"""Routes du journal d'utilisation : interactions, avis des utilisateurs et tableau de bord admin."""

import hmac
import os
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.concurrency import run_in_threadpool

import analytics
from limits import enforce_rate_limit
from schemas import FeedbackRequest, TrackRequest

router = APIRouter()


@router.post("/api/track", status_code=204)
async def track(
    req: TrackRequest,
    x_client_id: str | None = Header(default=None),
    x_session_id: str | None = Header(default=None),
) -> None:
    """Interactions de l'utilisateur (« Voir plus » deplie, « Écouter ») pour
    le tableau de bord admin."""
    analytics.log_event(req.event, client_id=x_client_id, session_id=x_session_id)


@router.post("/api/feedback", status_code=204)
async def feedback(
    req: FeedbackRequest,
    request: Request,
    x_client_id: str | None = Header(default=None),
    x_session_id: str | None = Header(default=None),
) -> None:
    """Avis de l'utilisateur sur une reponse (« utile / pas utile », commentaire facultatif),
    lu dans le tableau de bord admin."""
    await enforce_rate_limit(request, x_client_id)
    await run_in_threadpool(
        lambda: analytics.log_feedback(
            question=req.question, answer=req.answer, rating=1 if req.rating == "up" else -1,
            language=req.language, comment=req.comment, client_id=x_client_id, session_id=x_session_id,
        )
    )


ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "")


def require_admin(authorization: str | None = Header(default=None)) -> None:
    """Acces au tableau de bord : `Authorization: Bearer <ADMIN_TOKEN>`."""
    if not ADMIN_TOKEN:
        raise HTTPException(
            status_code=503,
            detail="Tableau de bord désactivé : définissez ADMIN_TOKEN dans le .env du backend.",
        )
    token = (authorization or "").removeprefix("Bearer ").strip()
    if not hmac.compare_digest(token.encode(), ADMIN_TOKEN.encode()):
        raise HTTPException(status_code=401, detail="Mot de passe administrateur incorrect.")


@router.get("/api/admin/stats", dependencies=[Depends(require_admin)])
def admin_stats(days: int = 30) -> dict:
    """Indicateurs d'utilisation sur les `days` derniers jours (0 = tout)."""
    return analytics.stats(days if days > 0 else None)


@router.get("/api/admin/questions", dependencies=[Depends(require_admin)])
def admin_questions(
    days: int = 30,
    status: Literal["all", "answered", "no_data", "error"] = "all",
    limit: int = 25,
    offset: int = 0,
) -> dict:
    """Journal des questions, le plus recent en premier."""
    return analytics.recent_questions(
        days if days > 0 else None,
        limit=max(1, min(limit, 200)),
        offset=max(0, offset),
        status=None if status == "all" else status,
    )


@router.get("/api/admin/feedback", dependencies=[Depends(require_admin)])
def admin_feedback(
    days: int = 30,
    rating: Literal["all", "up", "down"] = "all",
    limit: int = 25,
    offset: int = 0,
) -> dict:
    """Avis des utilisateurs, le plus recent en premier."""
    return analytics.recent_feedback(
        days if days > 0 else None,
        rating={"up": 1, "down": -1}.get(rating),
        limit=max(1, min(limit, 200)),
        offset=max(0, offset),
    )
