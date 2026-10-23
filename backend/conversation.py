"""Messages traites par regle, sans appel au modele ni recherche :
  - conversation courante (« bonjour », « merci »…) ;
  - demandes de mise en forme seules (« en tableau », « point par point ») ;
  - relances de periode seules (« et pour 2025 ? »).
Le sujet des deux dernieres est celui de la question precedente (voir api._query).
"""

import re
import unicodedata


def norm(text: str) -> str:
    """Minuscules, sans accents ni ponctuation : « Évolution du Chômage ! » -> « evolution du chomage »."""
    text = unicodedata.normalize("NFD", text.lower())
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    return " ".join(re.sub(r"[^a-z0-9]+", " ", text).split())


# --- conversation courante (salutations, remerciements, presentation)
SMALL_TALK = [
    (
        r"^(bonjour|bonsoir|salut|hello|hi|hey|coucou|salam|salamalekum|salaam aleykoum|asalaa?m? ?(maa)?lekum|nanga ?def|na nga def)\b",
        {
            "fr": "Bonjour ! Je suis l'assistant de l'ANSD. Posez-moi une question sur les statistiques du Sénégal : croissance, prix, emploi, chiffre d'affaires des entreprises…",
            "en": "Hello! I'm the ANSD assistant. Ask me about Senegal's statistics: growth, prices, employment, business turnover…",
            # Wolof ecrit a la main, simple : a faire valider par un locuteur.
            "wo": "Nanga def ! Maangi fi ngir tontu say laaj ci statistik yu Senegaal.",
        },
    ),
    (
        r"^(merci|thanks?|thank you|j[eë]r[eë]j[eë]f)\b",
        {
            "fr": "Avec plaisir ! N'hésitez pas si vous avez une autre question.",
            "en": "You're welcome! Feel free to ask another question.",
            "wo": "Amul solo ! Soo am beneen laaj, wax ma ko.",
        },
    ),
    (
        r"^(au revoir|bye|goodbye|a bientot|à bientôt|ba beneen|ba benn yoon)\b",
        {
            "fr": "Au revoir et à bientôt !",
            "en": "Goodbye, see you soon!",
            "wo": "Ba beneen yoon !",
        },
    ),
    (
        r"^(qui es[- ]tu|tu es qui|c'?est quoi (cet|ce) (assistant|chatbot)|que (sais|peux)[- ]tu faire|who are you|what can you do)\b",
        {
            "fr": "Je suis l'assistant de l'ANSD. Je réponds à vos questions à partir des publications officielles de l'ANSD, en citant à chaque fois le document et la page. Vous pouvez aussi me demander une réponse point par point, en tableau, plus courte ou plus détaillée.",
            "en": "I'm the ANSD assistant. I answer your questions from ANSD's official publications, always citing the document and page. You can also ask for a bullet-point, table, shorter or more detailed answer.",
        },
    ),
]


def small_talk_reply(question: str, language: str) -> str | None:
    """Reponse directe aux messages de conversation courante (« bonjour », « merci »…),
    sans recherche documentaire. None si c'est une vraie question. Langues sans
    traduction validee (wolof, pulaar, sereer, diola) : reponse en francais."""
    text = question.strip().lower().rstrip(" !?.")
    if len(text) > 40:  # une phrase longue est une vraie question
        return None
    for pattern, replies in SMALL_TALK:
        if re.match(pattern, text):
            return replies.get(language) or replies["fr"]
    return None


# --- demandes de mise en forme seules (« point par point », « en tableau »…)
# Reconnues par regle, sans le modele : le sujet est celui de la question precedente.
# (consigne, mots qui la declenchent — sans accents, debut de mot)
FORMAT_REQUESTS = [
    ("sous forme de tableau", ("tableau", "tableaux", "table")),
    ("sous forme de liste numérotée", ("numero", "etape", "numbered")),
    ("point par point (liste à puces)", ("point", "points", "liste", "listes", "puce", "puces", "bullet", "list")),
    ("en une seule phrase", ("court", "simple", "resum", "phrase", "bref", "brievement", "shorter", "summar")),
    ("de façon plus détaillée", ("detail", "developpe", "explique", "elabor")),
]
_FORMAT_FILLERS = set(
    (
        "affiche afficher mets mettre met ca ce cela ceci le la les l un une des de du d en sous forme dans "
        "moi me te tu peux pourrais pourriez stp svp s il plait plais vous voulez donne donner fais faire "
        "presente presenter montre montrer reponse reponses plus encore juste et avec par a au aux "
        "ecris ecrire redige rediger reformule reformuler version maintenant aussi oui merci "
        "show give make put it this that as in a the please answer can you could more"
    ).split()
)
_FORMAT_SUFFIX = re.compile(r"\s*— réponds .*$")


def format_only_clause(question: str) -> str | None:
    """Consigne de forme si le message n'est QU'une demande de mise en forme
    (court, sans nouveau sujet) ; None sinon — « explique-moi le PIB » est une
    vraie question, « mets ça dans un tableau » une mise en forme."""
    words = norm(question).split()
    if not words or len(words) > 10:
        return None
    clause = None
    for word in words:
        if word in _FORMAT_FILLERS:
            continue
        match = next((c for c, stems in FORMAT_REQUESTS if any(word.startswith(st) for st in stems)), None)
        if match is None:
            return None  # mot porteur de sens : nouvelle question
        clause = clause or match
    return clause


# --- relances de periode seules (« et pour 2025 ? », « je veux juste 2026 »…)
# Regle fixe : sujet de la question precedente, seule la periode change.
_PERIOD_FILLERS = _FORMAT_FILLERS | set(
    (
        "et pour en l annee annees an ans sur concernant les donnees donnee chiffres chiffre "
        "je veux voudrais juste seulement uniquement alors quid que qu est ce qui quel quelle "
        "for year years what about and data only just"
    ).split()
)
_YEAR = re.compile(r"\b(?:19|20)\d{2}\b")
_QUARTER = re.compile(r"\b(?:t[1-4]|[1-4](?:er|e|eme|ème)? trimestre|q[1-4])\b", re.IGNORECASE)


def period_only(question: str) -> list[str] | None:
    """Periode(s) citee(s) si le message n'est QU'une relance de periode ; None sinon."""
    text = norm(question)
    years = _YEAR.findall(text)
    quarters = [q.upper() for q in _QUARTER.findall(text)]
    if not years and not quarters:
        return None
    rest = _QUARTER.sub(" ", _YEAR.sub(" ", text))
    leftover = [w for w in rest.split() if w not in _PERIOD_FILLERS and w not in ("trimestre", "trimestres")]
    return None if leftover else years + quarters


def with_period(previous_question: str, periods: list[str]) -> str:
    """Question precedente avec la nouvelle periode : l'annee citee est remplacee
    si la question n'en contenait qu'une, sinon la periode est precisee a la fin."""
    base = _FORMAT_SUFFIX.sub("", previous_question).rstrip(" ?.")
    years = [p for p in periods if _YEAR.fullmatch(p)]
    if len(years) == 1 and len(set(_YEAR.findall(base))) == 1 and len(periods) == 1:
        return f"{_YEAR.sub(years[0], base)} ?"
    return f"{base} — période : {' '.join(periods)} ?"


def with_format(previous_question: str, clause: str) -> str:
    """Question precedente (sans son eventuelle ancienne consigne) + nouvelle consigne."""
    return f"{_FORMAT_SUFFIX.sub('', previous_question).rstrip(' ?.')} — réponds {clause}."
