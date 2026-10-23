"""Limitation de debit : par utilisateur (identifiant anonyme du navigateur) et par adresse IP."""

import os

from fastapi import HTTPException, Request

from cache import store


RATE_LIMIT_PER_MINUTE = int(os.environ.get("RATE_LIMIT_PER_MINUTE", "20"))


# Par adresse IP : volontairement large — au Senegal, de nombreux utilisateurs
# partagent la meme IP publique (operateurs mobiles, universites, entreprises).
RATE_LIMIT_IP_PER_MINUTE = int(os.environ.get("RATE_LIMIT_IP_PER_MINUTE", "600"))


RATE_LIMIT_MESSAGE = "Trop de questions en peu de temps. Patientez une minute puis réessayez."


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


async def enforce_rate_limit(request: Request, client_id: str | None, per_client: int = RATE_LIMIT_PER_MINUTE) -> None:
    if not await store.allow(f"ip:{client_ip(request)}", RATE_LIMIT_IP_PER_MINUTE) or (
        client_id and not await store.allow(f"client:{client_id}", per_client)
    ):
        raise HTTPException(status_code=429, detail=RATE_LIMIT_MESSAGE, headers={"Retry-After": "60"})
