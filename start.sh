#!/usr/bin/env bash
# Demarre XAM-XAM en local, sans Docker : API (backend) sur :8000, interface (frontend) sur :3000.
#
#   ./start.sh        # installe ce qui manque, demarre les deux services en arriere-plan
#   ./stop.sh         # arrete tout
#
# Journaux : .run/backend.log et .run/frontend.log

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
RUN="$ROOT/.run"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"

info()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn()  { printf '\033[1;33m[ATTENTION]\033[0m %s\n' "$*"; }
fail()  { printf '\033[1;31m[ERREUR]\033[0m %s\n' "$*" >&2; exit 1; }

port_busy() { lsof -tiTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

mkdir -p "$RUN"

# --- Verifications ---------------------------------------------------------
command -v npm >/dev/null 2>&1 || fail "npm est introuvable. Installe Node.js."
PYTHON="$(command -v python3.11 || command -v python3 || true)"
[ -n "$PYTHON" ] || fail "Python 3 est introuvable."

port_busy "$BACKEND_PORT"  && fail "Le port $BACKEND_PORT est deja utilise (lance ./stop.sh d'abord)."
port_busy "$FRONTEND_PORT" && fail "Le port $FRONTEND_PORT est deja utilise (lance ./stop.sh d'abord)."

if [ ! -f "$BACKEND/.env" ]; then
  cp "$BACKEND/.env.example" "$BACKEND/.env"
  warn "backend/.env cree depuis .env.example : renseigne OPENROUTER_API_KEY ou MISTRAL_API_KEY."
fi
if ! grep -Eq '^(OPENROUTER_API_KEY=sk-or-v1-[^x]|MISTRAL_API_KEY=.+)' "$BACKEND/.env"; then
  warn "Aucune cle API dans backend/.env : l'interface s'affichera mais les questions echoueront."
fi
[ -f "$FRONTEND/.env.local" ] || cp "$FRONTEND/.env.local.example" "$FRONTEND/.env.local"

# --- Dependances (seulement au premier lancement) --------------------------
if [ ! -x "$BACKEND/.venv/bin/uvicorn" ]; then
  info "Installation des dependances Python (quelques minutes)..."
  "$PYTHON" -m venv "$BACKEND/.venv"
  "$BACKEND/.venv/bin/pip" install -q --upgrade pip
  "$BACKEND/.venv/bin/pip" install -q -r "$BACKEND/requirements.txt"
fi
if [ ! -d "$FRONTEND/node_modules" ]; then
  info "Installation des dependances du frontend..."
  (cd "$FRONTEND" && npm install --no-audit --no-fund)
fi
mkdir -p "$BACKEND/data" "$BACKEND/storage"

# --- Demarrage -------------------------------------------------------------
info "Demarrage du backend sur :$BACKEND_PORT..."
(cd "$BACKEND" || exit 1; nohup .venv/bin/uvicorn api:app --port "$BACKEND_PORT" >"$RUN/backend.log" 2>&1 </dev/null & echo $! >"$RUN/backend.pid")

info "Demarrage du frontend sur :$FRONTEND_PORT..."
(cd "$FRONTEND" || exit 1; PORT="$FRONTEND_PORT" nohup npm run dev >"$RUN/frontend.log" 2>&1 </dev/null & echo $! >"$RUN/frontend.pid")

info "Attente du backend (chargement du modele d'embedding)..."
for _ in $(seq 1 90); do
  curl -sf "http://localhost:$BACKEND_PORT/api/health" >/dev/null 2>&1 && break
  kill -0 "$(cat "$RUN/backend.pid")" 2>/dev/null || fail "Le backend s'est arrete. Voir .run/backend.log"
  sleep 2
done
curl -sf "http://localhost:$BACKEND_PORT/api/health" >/dev/null 2>&1 || fail "Le backend ne repond pas. Voir .run/backend.log"

for _ in $(seq 1 30); do
  curl -sf -o /dev/null "http://localhost:$FRONTEND_PORT" && break
  sleep 2
done

echo
info "XAM-XAM est demarre :"
echo "    Interface : http://localhost:$FRONTEND_PORT/accueil"
echo "    API       : http://localhost:$BACKEND_PORT/docs"
echo "    Journaux  : .run/backend.log, .run/frontend.log"
echo "    Arret     : ./stop.sh"
