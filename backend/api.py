"""API REST consommee par le frontend Next.js (ANSD-RAG-main/lib/api.ts).

Les formes de reponse suivent exactement les types TypeScript du frontend
(QueryResponse, Citation, SourceDocument). Lancement :

    uvicorn api:app --host 0.0.0.0 --port 8000
"""

import asyncio
import csv
import hashlib
import json
import logging
import os
import re
import threading
import time
from collections import OrderedDict
from contextlib import asynccontextmanager

import agent
import analytics
import fastindex
import routes_admin
import routes_voice
import voice
from cache import normalize, store
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, StreamingResponse

from config import MANIFEST_PATH, TOP_K
from conversation import format_only_clause, period_only, small_talk_reply, with_format, with_period
from limits import enforce_rate_limit
from schemas import (
    Citation,
    ExplainRequest,
    ExplainResponse,
    HistoryTurn,
    QueryRequest,
    QueryResponse,
    SourceDocument,
    TitleRequest,
    TitleResponse,
    Usage,
)
from rag import (
    NO_DATA_MARKER,
    OPENROUTER_MODEL,
    acall_llm,
    aexplain,
    ashort_title,
    get_collection,
    corpus_index,
    aguidance,
    corpus_reply,
    acondense,
    get_embedder,
    retrieve,
    guidance_follow_up,
    guidance_question,
    split_used_sources,
    unknown_acronyms,
)

logger = logging.getLogger("ansd-api")


class _HideHealthcheck(logging.Filter):
    """Le healthcheck Docker appelle /api/health toutes les 15 s : on ne le
    journalise pas pour garder des logs lisibles."""

    def filter(self, record: logging.LogRecord) -> bool:
        return "/api/health" not in record.getMessage()


logging.getLogger("uvicorn.access").addFilter(_HideHealthcheck())

GENERIC_ERROR_MESSAGE = "Un bug est survenu. Veuillez réessayer."
NO_INDEX_MESSAGE = (
    "Aucun document n'est indexé pour le moment. Lancez scraper.py puis ingest.py."
)
# Reponse affichee quand les publications indexees ne couvrent pas la question.
NO_DATA_MESSAGES = {
    "fr": "Nous n'avons pas encore de données sur cette demande.",
    "en": "We don't have data on this request yet.",
}

CORS_ORIGINS = [
    o.strip()
    for o in os.environ.get("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
    if o.strip()
]

@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Prechauffage : modele d'embedding et base vectorielle charges des le
    # demarrage, pas a la premiere question d'un utilisateur.
    await run_in_threadpool(lambda: list(get_embedder().embed(["warmup"])))
    await run_in_threadpool(get_collection)
    # Index de recherche rapide (fastindex.py) : charge en ~1 s, ou construit depuis Chroma (~3 min)
    # au premier demarrage. En arriere-plan : en attendant, la recherche passe par Chroma.
    threading.Thread(target=fastindex.ensure, daemon=True).start()
    # Puis suivi de la base : nouvelles publications (update_corpus.py) prises en compte sans redemarrer.
    threading.Thread(target=fastindex.watch, daemon=True).start()
    # Index du corpus (titres, URL, sigles) : environ 2 minutes la premiere fois,
    # puis lu depuis storage/corpus_cache.json. Lance en arriere-plan pour ne pas
    # retarder le demarrage ; les requetes qui en dependent attendent la fin.
    threading.Thread(target=corpus_index, daemon=True).start()
    yield


app = FastAPI(title="ANSD RAG API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Journal, avis et tableau de bord admin ; voix (routes_admin.py, routes_voice.py).
app.include_router(routes_admin.router)
app.include_router(routes_voice.router)


# ------------------------------------------------------------------ schemas


# ------------------------------------------------------------------ helpers

def document_id(url: str) -> str:
    """Identifiant stable d'un document, derive de son URL ansd.sn."""
    return hashlib.sha1(url.encode("utf-8")).hexdigest()[:16]


def publication_date(url: str) -> str:
    # Les PDF ansd.sn sont ranges sous /sites/default/files/AAAA-MM/...
    match = re.search(r"/files/(\d{4}-\d{2})/", url)
    return match.group(1) if match else ""


def read_manifest() -> list[dict]:
    if not MANIFEST_PATH.exists():
        return []
    with open(MANIFEST_PATH, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def indexed_urls() -> set[str]:
    """URL des documents indexes, relues seulement si le nombre de fragments change."""
    return corpus_index()["urls"]


_NUMBER_RE = re.compile(r"(?<![\w.])(?:p\.\s*|page\s+|source\s+)?\d+(?:[.,]\d+)*", re.IGNORECASE)


def _normalize_numbers(text: str) -> str:
    # "18 126 390" -> "18126390" (espaces, insecables et fines insecables)
    return re.sub(r"(?<=\d)[   ](?=\d)", "", text)


def _figures(text: str) -> list[str]:
    figures = [
        m.group(0)
        for m in _NUMBER_RE.finditer(_normalize_numbers(text))
        if not re.match(r"(p\.|page|source)", m.group(0), re.IGNORECASE)
    ]
    return [f for f in figures if len(f.replace(",", "").replace(".", "")) > 1]


def figures_found_in_context(answer: str, hits: list[dict], question: str = "") -> bool:
    """Vrai si chaque chiffre apporte par la reponse (hors numeros de
    page/source et hors nombres deja presents dans la question, ex. l'annee
    demandee) apparait mot pour mot dans les extraits recuperes. Une reponse
    sans chiffre propre (ex. « information non disponible ») n'est pas verifiee."""
    context = _normalize_numbers(" ".join(h["text"] for h in hits))
    from_question = set(_figures(question))
    figures = [f for f in _figures(answer) if f not in from_question]
    return bool(figures) and all(f in context for f in figures)


# ------------------------------------------------------------------ routes

# ------------------------------------------------------------------ montee en charge


_corpus = {"version": 0, "checked": 0.0}
_sources_cache: dict = {"version": None, "items": []}
_retrieval_cache: OrderedDict[str, list[dict]] = OrderedDict()


def corpus_version() -> int:
    """Nombre de fragments indexes, relu au plus une fois par minute : sert de
    version du corpus dans les cles de cache (une reindexation invalide tout)."""
    now = time.time()
    if now - _corpus["checked"] > 60:
        _corpus["version"] = get_collection().count()
        _corpus["checked"] = now
    return _corpus["version"]


async def aretrieve(
    question: str, prefer: list[tuple[str, int]] | None = None, top_k: int = TOP_K
) -> list[dict]:
    """Recherche vectorielle hors de la boucle d'evenements, avec un petit
    cache par processus (la meme question sert a la reponse puis au « Voir plus »)."""
    key = f"{corpus_version()}:{normalize(question)}:{sorted(set(prefer or []))}:{top_k}"
    if key in _retrieval_cache:
        _retrieval_cache.move_to_end(key)
        return _retrieval_cache[key]
    hits = await run_in_threadpool(retrieve, question, top_k, prefer)
    _retrieval_cache[key] = hits
    while len(_retrieval_cache) > 2000:
        _retrieval_cache.popitem(last=False)
    return hits


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok", "indexed_chunks": corpus_version(), "cache": store.backend}


@app.get("/api/sources", response_model=list[SourceDocument])
async def sources() -> list[SourceDocument]:
    """Liste des publications indexees — recalculee seulement si le corpus change."""
    version = corpus_version()
    if _sources_cache["version"] != version:
        _sources_cache["items"] = await run_in_threadpool(_build_sources)
        _sources_cache["version"] = version
    return _sources_cache["items"]


def _build_sources() -> list[SourceDocument]:
    rows = read_manifest()
    indexed = indexed_urls()
    if indexed:
        rows = [r for r in rows if r["url"] in indexed]
    return [
        SourceDocument(
            id=document_id(r["url"]),
            title=r["title"],
            publisher="ANSD",
            publication_date=publication_date(r["url"]),
            filename=document_id(r["url"]),
            description=" · ".join(p for p in (r.get("extension", "").upper(), r.get("size", "")) if p),
        )
        for r in rows
    ]


async def _to_french(text: str, timeout: float = 25) -> str:
    """Wolof -> francais (Soynade, modele de langage en secours) ; le texte tel quel s'il n'est pas du wolof (le service traduirait
    alors dans l'autre sens) ou si la traduction echoue (la recherche sera moins bonne, mais
    l'utilisateur obtient une reponse)."""
    if not voice.looks_wolof(text):
        return text
    try:
        return await voice.to_french(text, timeout=timeout)
    except voice.VoiceError:
        return text


# Langues traitees en francais puis traduites (question a l'aller, reponse au retour).
TRANSLATED_LANGUAGES = {"wo", "ff"}


def _in_question_language(req: QueryRequest) -> QueryRequest:
    """Repond dans la langue de la question : si l'utilisateur change de langue en cours de discussion
    (question en anglais alors que l'interface est en francais…), cette langue l'emporte sur le selecteur."""
    detected = voice.detect_language(req.question)
    if detected and detected != req.language:
        return req.model_copy(update={"language": detected})
    return req


@app.post("/api/query", response_model=QueryResponse)
async def query(
    req: QueryRequest,
    request: Request,
    x_client_id: str | None = Header(default=None),
    x_session_id: str | None = Header(default=None),
) -> QueryResponse:
    """Point d'entree. Anglais et francais : traites directement. Wolof et pulaar : la question et
    l'historique sont traduits en francais (wolof : Soynade ; pulaar : modele local), traites comme
    une question francaise (meme recherche, meme cache), puis la reponse est traduite."""
    req = _in_question_language(req)
    if req.language not in TRANSLATED_LANGUAGES:
        return await _query(req, request, x_client_id, x_session_id)
    lang = req.language
    chat = None if agent.AGENT_ENABLED or lang != "wo" else small_talk_reply(req.question, "wo")
    if chat:
        await enforce_rate_limit(request, x_client_id)
        analytics.log_event("chat", client_id=x_client_id, session_id=x_session_id, question=req.question, language="wo")
        # Reponse ecrite en wolof si elle existe ; sinon le francais, traduit.
        if chat == small_talk_reply(req.question, "fr"):
            chat = await voice.to_wolof(chat)
        return QueryResponse(
            question=req.question, language="wo", kind="chat", answered=False, answer=chat,
            citations=[], sources_used=[], model="", usage=Usage(),
        )
    to_fr = (lambda text, timeout=25: _to_french(text, timeout)) if lang == "wo" else (lambda text, timeout=25: voice.pulaar_to_french(text))
    question_fr, *history_fr = await asyncio.gather(
        to_fr(req.question),
        *[to_fr(t.answer, timeout=10) for t in req.history[-2:]],
        *[to_fr(t.question, timeout=10) for t in req.history[-2:]],
    )
    turns = req.history[-2:]
    history = [
        HistoryTurn(question=history_fr[len(turns) + i], answer=history_fr[i], sources=t.sources)
        for i, t in enumerate(turns)
    ]
    fr_req = req.model_copy(update={"language": "fr", "question": question_fr, "history": history})
    resp = await _query(fr_req, request, x_client_id, x_session_id)
    translate = voice.to_wolof if lang == "wo" else voice.to_pulaar
    answer = await translate(resp.answer) if resp.answer else resp.answer
    return resp.model_copy(update={
        "language": lang, "question": req.question, "answer": answer,
        # Texte francais d'origine, affiche a la demande : la traduction automatique peut se tromper.
        "original_answer": resp.answer if answer != resp.answer else None,
    })


def _agent_cache_key(req: QueryRequest, question: str) -> str | None:
    """Cle de cache d'une reponse de l'agent. Seules les questions qui ouvrent une discussion sont
    mises en cache : une question de suite depend de ce qui precede. « Relancer » ignore le cache."""
    if req.regenerate or any(t.answer.strip() for t in req.history):
        return None
    return f"agent:{agent.AGENT_VERSION}:{corpus_version()}:{agent.MISTRAL_MODEL}:{req.language}:{normalize(question)}"


def _agent_response(
    result: dict, req: QueryRequest, question: str, started: float, x_client_id: str | None,
    x_session_id: str | None, cached: bool = False,
) -> QueryResponse:
    """Resultat de l'agent -> reponse de l'API, et journal d'utilisation (tableau de bord admin)."""
    citations = [
        Citation(document_id=document_id(c["url"]) if c.get("url") else c["document_title"], **c)
        for c in result["citations"]
    ]
    answered = bool(citations)
    usage = result["usage"]
    analytics.log_event(
        "query" if result["searched"] else "chat",
        client_id=x_client_id,
        session_id=x_session_id,
        question=question,
        language=req.language,
        mode=req.mode,
        answered=answered if result["searched"] else None,
        cached=cached,
        latency_ms=round((time.perf_counter() - started) * 1000),
        # Une reponse servie depuis le cache n'a rien consomme.
        prompt_tokens=0 if cached else usage["prompt_tokens"],
        completion_tokens=0 if cached else usage["completion_tokens"],
        sources=list(dict.fromkeys(c.document_title for c in citations)),
    )
    return QueryResponse(
        question=question,
        kind="answer" if answered else "chat",
        language=req.language,
        answered=answered,
        answer=result["answer"],
        citations=citations,
        sources_used=list(dict.fromkeys(c.document_id for c in citations)),
        model=result["model"],
        usage=Usage(**usage),
    )


async def _agent_query(
    req: QueryRequest, question: str, x_client_id: str | None, x_session_id: str | None
) -> QueryResponse | None:
    """Reponse de l'agent conversationnel (voir agent.py), depuis le cache si possible. None si l'agent echoue."""
    started = time.perf_counter()
    key = _agent_cache_key(req, question)
    if key and (hit := await store.get_json(key)):
        return _agent_response(hit, req, question, started, x_client_id, x_session_id, cached=True)
    history = [t.model_dump() for t in req.history if t.answer.strip()]
    try:
        result = await agent.run_agent(question, req.language, history, temperature=0.7 if req.regenerate else 0.2)
    except Exception:
        logger.exception("agent failed")
        return None
    if key:
        await store.set_json(key, result)
    return _agent_response(result, req, question, started, x_client_id, x_session_id)


def _ndjson(event: dict) -> bytes:
    return (json.dumps(event, ensure_ascii=False) + "\n").encode("utf-8")


@app.post("/api/query/stream")
async def query_stream(
    req: QueryRequest,
    request: Request,
    x_client_id: str | None = Header(default=None),
    x_session_id: str | None = Header(default=None),
) -> StreamingResponse:
    """Meme reponse que /api/query, mais envoyee au fil de l'eau (une ligne JSON par evenement) :
      {"type": "status", "text": "search"}   recherche en cours ;
      {"type": "delta", "text": "…"}         morceau de texte (marqueurs [n] a masquer a l'affichage) ;
      {"type": "reset"}                      oublier le texte recu (nouvelle recherche ou correction) ;
      {"type": "done", "response": {...}}    reponse finale (QueryResponse), qui remplace le texte recu ;
      {"type": "error", "detail": "…"}.
    Wolof : la reponse doit etre traduite en entier, elle arrive donc en une fois (« done »)."""
    req = _in_question_language(req)
    question = req.question.strip()
    if req.language in TRANSLATED_LANGUAGES or not agent.AGENT_ENABLED:
        response = await query(req, request, x_client_id, x_session_id)

        async def single():
            yield _ndjson({"type": "done", "response": response.model_dump()})

        return StreamingResponse(single(), media_type="application/x-ndjson")

    await enforce_rate_limit(request, x_client_id)  # avant d'ouvrir le flux : une erreur 429 normale
    started = time.perf_counter()
    key = _agent_cache_key(req, question)
    hit = await store.get_json(key) if key else None

    async def events():
        if hit:
            response = _agent_response(hit, req, question, started, x_client_id, x_session_id, cached=True)
            yield _ndjson({"type": "done", "response": response.model_dump()})
            return
        history = [t.model_dump() for t in req.history if t.answer.strip()]
        sent_text = False
        try:
            async for event in agent.agent_events(
                question, req.language, history, temperature=0.7 if req.regenerate else 0.2
            ):
                if event["type"] == "result":
                    result = event["data"]
                    if key:
                        await store.set_json(key, result)
                    response = _agent_response(result, req, question, started, x_client_id, x_session_id)
                    yield _ndjson({"type": "done", "response": response.model_dump()})
                    return
                sent_text = sent_text or event["type"] == "delta"
                yield _ndjson(event)
        except Exception:
            logger.exception("agent failed (flux)")
        # Agent indisponible : ancien circuit a regles, pour toujours repondre.
        try:
            if sent_text:
                yield _ndjson({"type": "reset"})
            response = await _query(req, request, x_client_id, x_session_id, skip_agent=True)
            yield _ndjson({"type": "done", "response": response.model_dump()})
        except HTTPException as exc:
            yield _ndjson({"type": "error", "detail": exc.detail})
        except Exception:
            logger.exception("repli apres echec de l'agent impossible")
            yield _ndjson({"type": "error", "detail": GENERIC_ERROR_MESSAGE})

    # X-Accel-Buffering : un proxy (nginx) ne doit pas retenir le flux.
    return StreamingResponse(
        events(), media_type="application/x-ndjson", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )


async def _query(
    req: QueryRequest,
    request: Request,
    x_client_id: str | None,
    x_session_id: str | None,
    skip_agent: bool = False,
) -> QueryResponse:
    """Repond a la question (depuis le cache si elle a deja ete posee) et
    journalise l'utilisation (tableau de bord admin)."""
    started = time.perf_counter()
    question = req.question.strip()
    response: QueryResponse | None = None
    cached = False
    if not skip_agent:  # repli du flux : limite deja appliquee
        await enforce_rate_limit(request, x_client_id)  # trop de requetes : non journalise comme une question
    if agent.AGENT_ENABLED and not skip_agent:
        agent_response = await _agent_query(req, question, x_client_id, x_session_id)
        if agent_response is not None:
            return agent_response
        # Agent indisponible (erreur du modele…) : ancien circuit a regles, pour toujours repondre.
    chat = small_talk_reply(question, req.language)
    if chat:
        analytics.log_event("chat", client_id=x_client_id, session_id=x_session_id, question=question, language=req.language)
        return QueryResponse(
            question=question, language=req.language, kind="chat", answered=False, answer=chat,
            citations=[], sources_used=[], model="", usage=Usage(),
        )
    try:
        about_corpus = await run_in_threadpool(corpus_reply, question, req.language)
    except Exception:
        logger.exception("corpus reply failed")
        about_corpus = None
    if about_corpus:
        analytics.log_event("chat", client_id=x_client_id, session_id=x_session_id, question=question, language=req.language)
        return QueryResponse(
            question=question, language=req.language, kind="chat", answered=False, answer=about_corpus,
            citations=[], sources_used=[], model="", usage=Usage(),
        )
    last_turn = [t.model_dump() for t in req.history if t.answer.strip()][-1:]
    guide_follow_up = guidance_follow_up(question, last_turn)
    if guide_follow_up or guidance_question(question):
        # Demande de conseil ou d'etapes (« que me conseillez-vous pour recuperer les donnees ? »),
        # ou precision apportee a une telle demande (« sur l'emploi ») : reponse de guide, sans
        # chiffre, avec un lien vers chaque publication recommandee.
        try:
            advice, guide_sources, model = await aguidance(
                question, req.language, last_turn if guide_follow_up else None
            )
        except Exception:
            logger.exception("guidance failed")
            advice = ""
        if advice:
            analytics.log_event("chat", client_id=x_client_id, session_id=x_session_id, question=question, language=req.language)
            return QueryResponse(
                question=question, language=req.language, kind="guide", answered=False, answer=advice,
                citations=[], sources_used=[], model=model, usage=Usage(), sources=guide_sources,
                # Demande complete (« etapes pour mes recherches — sur l'emploi ») : renvoyee comme
                # question de l'echange, elle garde l'accompagnement actif pour les precisions suivantes.
                standalone_question=f"{last_turn[0]['question']} — {question}" if guide_follow_up else None,
            )
    try:
        history = [t.model_dump() for t in req.history if t.answer.strip()][-2:]
        standalone = question
        clause = format_only_clause(question) if history else None
        periods = period_only(question) if history and not clause else None
        if clause:
            # Simple demande de mise en forme : meme sujet que la question precedente.
            standalone = with_format(history[-1]["question"], clause)
        elif periods:
            # Simple relance de periode (« et pour 2025 ? ») : meme sujet, autre periode —
            # meme si la question precedente n'a pas eu de reponse.
            standalone = with_period(history[-1]["question"], periods)
        elif history:
            try:
                standalone = await acondense(question, history)
            except Exception:
                logger.warning("reformulation impossible, question telle quelle", exc_info=True)
        # Les sources et la reponse precedentes ne servent QUE si la question est une suite
        # (mise en forme, autre periode, ou reformulee a partir de l'historique). Une question
        # sur un autre sujet repart de zero : sinon les pages du tour precedent sont forcees
        # dans les resultats et affichees comme sources de la nouvelle reponse.
        follow_up = bool(clause or periods) or normalize(standalone) != normalize(question)
        prefer = (
            [(src["title"], src["page"]) for t in history[-1:] for src in t["sources"] if src["page"] is not None]
            if follow_up else []
        )
        previous = history[-1]["answer"] if history and follow_up else None
        # La reponse precedente fait partie de la cle : « mets ca en tableau » apres deux
        # reponses differentes ne doit pas resservir la meme reponse en cache.
        prev_key = hashlib.sha1(previous.encode()).hexdigest()[:12] if previous else "-"
        key = f"answer:v17:{corpus_version()}:{req.language}:{normalize(standalone)}:{sorted(set(prefer))}:{prev_key}"
        data, cached = await store.cached(
            key,
            lambda: _answer(standalone, req.language, prefer, previous, temperature=0.6 if req.regenerate else 0.2),
            refresh=req.regenerate,
        )
        response = QueryResponse(
            **{**data, "question": question, "standalone_question": standalone if standalone != question else None}
        )
        return response
    finally:
        analytics.log_event(
            "query",
            client_id=x_client_id,
            session_id=x_session_id,
            question=question,
            language=req.language,
            mode=req.mode,
            answered=response.answered if response else None,
            error=response is None,
            cached=cached,
            latency_ms=round((time.perf_counter() - started) * 1000),
            # Une reponse servie depuis le cache n'a rien consomme.
            prompt_tokens=0 if cached else (response.usage.prompt_tokens if response else None),
            completion_tokens=0 if cached else (response.usage.completion_tokens if response else None),
            sources=list(dict.fromkeys(c.document_title for c in response.citations)) if response else None,
        )


YEAR_RE = re.compile(r"\b(?:19|20)\d{2}\b")
YEAR_CANDIDATES_FACTOR = 8  # candidats recuperes avant filtre par annee = TOP_K x 8


def filter_by_years(question: str, hits: list[dict]) -> list[dict]:
    """Question qui cite une ou des annees : seuls les extraits qui les mentionnent
    (texte ou titre du document) sont donnes au modele. Evite qu'il lise un chiffre
    d'une autre annee dans un tableau (colonnes d'annees perdues a l'extraction du
    PDF). Aucun extrait pour ces annees => liste vide => « pas de donnees »."""
    years = set(YEAR_RE.findall(question))
    if not years:
        return hits
    return [h for h in hits if any(y in h["text"] or y in h["source"] for y in years)]


_EMPTY_ANSWER_RE = re.compile(
    r"(n'est|ne sont|n'a|n'ont|ne figure|ne figurent|ne contient|ne contiennent)\s+(pas|aucun)"
    r"[^.]{0,60}(indiqu|mentionn|pr[ée]cis|disponible|fourni|pr[ée]sent|donn)",
    re.IGNORECASE,
)


def _is_empty_answer(answer: str, question: str) -> bool:
    """Reponse du type « l'information n'est pas explicitement indiquee », sans
    aucun chiffre propre : c'est une absence de donnees, affichee comme telle."""
    return bool(_EMPTY_ANSWER_RE.search(answer)) and not [
        f for f in _figures(answer) if f not in set(_figures(question))
    ]


_YEAR_ONLY_RE = re.compile(r"(?:19|20)\d{2}")


def pick_sources(answer: str, hits: list[dict], used: list[int]) -> list[int]:
    """Indices des extraits a afficher comme sources de la reponse.

    Une source n'est affichee que si son texte contient reellement un chiffre de la
    reponse : les annees sont ignorees (« 2010 » apparait dans n'importe quel
    document de la serie) et le chiffre doit etre un nombre entier dans l'extrait
    (« 12 » ne correspond pas a « 2012 »). Les extraits cites par le modele passent
    en premier. Reponse sans chiffre propre ou rien de verifiable : on s'en tient a
    ce que le modele a indique, a defaut a l'extrait le plus pertinent."""
    figures = [f for f in _figures(answer) if not _YEAR_ONLY_RE.fullmatch(f)]
    if not figures:
        return used or [0]
    patterns = [re.compile(rf"(?<![\d,.]){re.escape(f)}(?!\d)") for f in figures]
    texts = [_normalize_numbers(h["text"]) for h in hits]
    supporting = [i for i, t in enumerate(texts) if any(p.search(t) for p in patterns)]
    if not supporting:
        return used or [0]
    ordered = [i for i in used if i in supporting] + [i for i in supporting if i not in used]
    return ordered[:3]


async def _answer(
    question: str,
    language: str,
    prefer: list[tuple[str, int]] | None = None,
    previous: str | None = None,
    temperature: float = 0.2,
) -> dict:
    no_data = QueryResponse(
        question=question, language=language, answered=False, kind="no_data",
        answer=NO_DATA_MESSAGES.get(language, NO_DATA_MESSAGES["fr"]),
        citations=[], sources_used=[], model=OPENROUTER_MODEL, usage=Usage(),
    ).model_dump()
    # Sigle inconnu de tout le corpus (ex. « DR ») : rien a chercher, et surtout
    # rien a laisser inventer au modele.
    if await run_in_threadpool(unknown_acronyms, question):
        return no_data
    try:
        # Question datee : on cherche plus large avant de filtrer par annee, sinon les
        # 6 meilleurs extraits (souvent d'autres annees d'une meme serie) ne laissent rien.
        wide = TOP_K * YEAR_CANDIDATES_FACTOR if YEAR_RE.search(question) else TOP_K
        hits = filter_by_years(question, await aretrieve(question, prefer, wide))[:TOP_K]
    except Exception:
        logger.exception("retrieval failed")
        raise HTTPException(status_code=500, detail=GENERIC_ERROR_MESSAGE)

    if not hits:
        return no_data

    try:
        completion = await acall_llm(question, hits, language, previous, temperature)
        raw = completion["choices"][0]["message"]["content"].strip()
    except Exception:
        logger.exception("LLM call failed")
        raise HTTPException(status_code=502, detail=GENERIC_ERROR_MESSAGE)

    answer, used = split_used_sources(raw, len(hits))
    if not answer or answer.strip(" .").upper() == NO_DATA_MARKER or _is_empty_answer(answer, question):
        return no_data

    verified = figures_found_in_context(answer, hits, question)
    # Sources affichees : seulement les extraits reellement utilises pour repondre.
    cited = [hits[i] for i in pick_sources(answer, hits, used)]
    cited = list({(h["source"], h["page"]): h for h in cited}.values())
    citations = [
        Citation(
            document_id=document_id(h["url"]) if h.get("url") else h["source"],
            document_title=h["source"],
            url=h.get("url"),
            quote=h["text"][:400],
            page_start=h["page"],
            page_end=h["page"],
            verified=verified,
        )
        for h in cited
    ]
    usage = completion.get("usage") or {}
    return QueryResponse(
        question=question,
        language=language,
        answered=True,
        answer=answer,
        citations=citations,
        sources_used=list(dict.fromkeys(c.document_id for c in citations)),
        model=completion.get("model", OPENROUTER_MODEL),
        usage=Usage(**{k: usage.get(k, 0) for k in Usage.model_fields}),
    ).model_dump()


@app.post("/api/explain", response_model=ExplainResponse)
async def explain_answer(
    req: ExplainRequest,
    request: Request,
    x_client_id: str | None = Header(default=None),
    x_session_id: str | None = Header(default=None),
) -> ExplainResponse:
    """Explication detaillee d'une reponse deja donnee (bouton « Voir plus »),
    preparee en arriere-plan par le frontend et mise en cache."""
    question = req.question.strip()
    await enforce_rate_limit(request, x_client_id)
    ok = False
    try:
        prefer = [(src.title, src.page) for src in req.sources if src.page is not None]
        answer_key = hashlib.sha1(req.answer.strip().encode()).hexdigest()[:12]
        key = f"explain:v8:{corpus_version()}:{req.language}:{normalize(question)}:{sorted(set(prefer))}:{answer_key}"
        data, _ = await store.cached(key, lambda: _explain(question, req.answer.strip(), req.language, prefer))
        ok = True
        return ExplainResponse(**data)
    finally:
        analytics.log_event(
            "explain", client_id=x_client_id, session_id=x_session_id,
            question=question, language=req.language, error=not ok,
        )


async def _explain(question: str, answer: str, language: str, prefer: list[tuple[str, int]] | None = None) -> dict:
    try:
        hits = filter_by_years(question, await aretrieve(question, prefer)) or await aretrieve(question, prefer)
        if not hits:
            raise HTTPException(status_code=404, detail=NO_INDEX_MESSAGE)
        details, sources = await aexplain(question, answer, hits, language)
        return {"details": agent.clean_markdown(details), "sources": sources}
    except HTTPException:
        raise
    except Exception:
        logger.exception("explain failed")
        raise HTTPException(status_code=502, detail=GENERIC_ERROR_MESSAGE)


@app.post("/api/title", response_model=TitleResponse)
async def title(req: TitleRequest, request: Request, x_session_id: str | None = Header(default=None)) -> TitleResponse:
    """Titre court (1 a 3 mots) d'une discussion, pour l'historique du frontend
    (et les « sujets les plus demandes » du tableau de bord)."""
    await enforce_rate_limit(request, None)
    question = req.question.strip()
    try:
        data, _ = await store.cached(
            f"title:{normalize(question)}",
            lambda: _title(question),
            ttl=7 * 24 * 3600,
        )
    except Exception:
        logger.exception("title generation failed")
        raise HTTPException(status_code=502, detail=GENERIC_ERROR_MESSAGE)
    # Le tableau de bord regroupe les sujets en francais ; l'historique affiche le titre traduit.
    await run_in_threadpool(analytics.log_session_title, x_session_id, data["title"])
    if req.language in ("en", "wo", "ff"):
        translated, _ = await store.cached(
            f"title:{req.language}:{normalize(question)}",
            lambda: _translated_title(data["title"], req.language),
            ttl=7 * 24 * 3600,
        )
        return TitleResponse(**translated)
    return TitleResponse(**data)


async def _translated_title(title_fr: str, language: str) -> dict:
    return {"title": await voice.translate_title(title_fr, language)}


async def _title(question: str) -> dict:
    return {"title": await ashort_title(question)}


@app.get("/files/{doc_id}")
def publication_file(doc_id: str) -> RedirectResponse:
    """Les PDF ne sont jamais stockes localement : on redirige vers ansd.sn."""
    for row in read_manifest():
        if document_id(row["url"]) == doc_id:
            return RedirectResponse(row["url"], status_code=307)
    raise HTTPException(status_code=404, detail="Publication introuvable.")


# ------------------------------------------------------------------ admin


