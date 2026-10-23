"""Routes de la voix : question posee a voix haute (transcription) et lecture des reponses."""

import base64
import hashlib

from fastapi import APIRouter, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.responses import Response

import voice
from cache import store
from limits import enforce_rate_limit
from schemas import SpeakRequest

router = APIRouter()


@router.post("/api/voice/transcribe")
async def voice_transcribe(
    request: Request,
    audio: UploadFile = File(...),
    language: str = Form("wo"),
    x_client_id: str | None = Header(default=None),
) -> dict:
    """Question posee a voix haute -> texte et langue parlee (Voxtral, Soynade : voir voice.py)."""
    await enforce_rate_limit(request, x_client_id)
    try:
        text, spoken = await voice.transcribe(await audio.read(), audio.filename or "", language)
    except voice.VoiceError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.detail)
    # spoken : langue parlee, detectee (peut differer de celle de l'interface).
    return {"text": text, "language": spoken}


@router.post("/api/voice/speak")
async def voice_speak(
    req: SpeakRequest, request: Request, x_client_id: str | None = Header(default=None)
) -> Response:
    """Lecture a voix haute d'une reponse (wolof : Soynade ; francais, anglais : Piper local, voir voice.py). 501 pour les langues
    sans voix : le frontend retombe alors sur la synthese du navigateur."""
    await enforce_rate_limit(request, x_client_id)
    # Meme texte, meme audio : chaque reponse n'est synthetisee qu'une fois (quota Soynade limite).
    key = f"tts:v3:{req.language}:{hashlib.sha1(req.text.encode('utf-8')).hexdigest()}"
    cached = await store.get_json(key)
    if cached:
        return Response(content=base64.b64decode(cached["audio"]), media_type=cached["type"])
    try:
        content, media_type, provider = await voice.synthesize(req.text, req.language)
    except voice.VoiceError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.detail)
    # Voix wolof de secours (Hugging Face, locale) gardees peu de temps : la voix Soynade reprend des que son quota revient.
    # Les voix francaise et anglaise (Piper) sont les voix normales : gardees aussi longtemps que celle de Soynade.
    ttl = 3600 if provider in ("local", "tanle-wo") else 7 * 24 * 3600
    await store.set_json(key, {"audio": base64.b64encode(content).decode("ascii"), "type": media_type}, ttl=ttl)
    return Response(content=content, media_type=media_type)
