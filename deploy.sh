#!/usr/bin/env bash
# Deploiement de XAM-XAM (backend + frontend) avec Docker Compose.
#
#   ./deploy.sh                                   # local : API sur :8000, interface sur :3000
#   ./deploy.sh --api-url https://api.exemple.sn --front-url https://exemple.sn
#   ./deploy.sh --scale                           # plusieurs instances du backend derriere Nginx
#   ./deploy.sh --pull                            # recupere d'abord la derniere version (git pull)
#   ./deploy.sh --down                            # arrete tous les services
#
# Prerequis : Docker Engine + Docker Compose v2.24+, et backend/.env rempli
# (copie de backend/.env.example).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

API_URL="http://localhost:8000"
FRONT_URL=""
SCALE=0
PULL=0
DOWN=0
HEALTH_TIMEOUT=600   # le premier demarrage construit l'index de recherche (~3 min)

info()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn()  { printf '\033[1;33m[ATTENTION]\033[0m %s\n' "$*"; }
fail()  { printf '\033[1;31m[ERREUR]\033[0m %s\n' "$*" >&2; exit 1; }

usage() { sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit 0; }

while [ $# -gt 0 ]; do
  case "$1" in
    --api-url)   API_URL="${2:?--api-url attend une URL}"; shift 2 ;;
    --front-url) FRONT_URL="${2:?--front-url attend une URL}"; shift 2 ;;
    --scale)     SCALE=1; shift ;;
    --pull)      PULL=1; shift ;;
    --down)      DOWN=1; shift ;;
    -h|--help)   usage ;;
    *)           fail "option inconnue : $1 (voir --help)" ;;
  esac
done

if [ "$SCALE" -eq 1 ]; then
  BACKEND_COMPOSE=(docker compose -f docker-compose.scale.yml)
  OTHER_BACKEND_COMPOSE=(docker compose -f docker-compose.yml)
else
  BACKEND_COMPOSE=(docker compose -f docker-compose.yml)
  OTHER_BACKEND_COMPOSE=(docker compose -f docker-compose.scale.yml)
fi

# --- Verifications ---------------------------------------------------------
command -v docker >/dev/null 2>&1 || fail "Docker est introuvable. Installe Docker Engine."
docker info >/dev/null 2>&1      || fail "Docker ne repond pas (service arrete ou droits insuffisants : sudo ou groupe docker)."
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 est introuvable (commande 'docker compose')."

if [ "$DOWN" -eq 1 ]; then
  info "Arret du frontend..."
  (cd "$FRONTEND" && docker compose down)
  info "Arret du backend..."
  (cd "$BACKEND" && docker compose -f docker-compose.yml down && docker compose -f docker-compose.scale.yml down)
  info "Tous les services sont arretes."
  exit 0
fi

if [ "$PULL" -eq 1 ]; then
  info "Recuperation de la derniere version du code..."
  git -C "$ROOT" pull --ff-only
fi

if [ ! -f "$BACKEND/.env" ]; then
  cp "$BACKEND/.env.example" "$BACKEND/.env"
  fail "backend/.env n'existait pas : il vient d'etre cree a partir de .env.example. Remplis-le (OPENROUTER_API_KEY, ADMIN_TOKEN, CORS_ORIGINS...) puis relance."
fi

if ! grep -Eq '^OPENROUTER_API_KEY=.+' "$BACKEND/.env" || grep -q 'xxxxxxxx' "$BACKEND/.env"; then
  fail "OPENROUTER_API_KEY n'est pas renseignee dans backend/.env."
fi
if grep -Eq '^ADMIN_TOKEN=changez-moi' "$BACKEND/.env"; then
  warn "ADMIN_TOKEN vaut encore 'changez-moi' dans backend/.env : change-le avant d'ouvrir le site au public."
fi

if [ ! -f "$BACKEND/storage/chroma/chroma.sqlite3" ]; then
  warn "Base de recherche absente (backend/storage). Elle n'est pas dans Git : copie-la sur le serveur,"
  warn "ou lance l'indexation une fois le backend demarre :"
  warn "  cd backend && docker compose exec backend python ingest.py"
fi
mkdir -p "$BACKEND/data" "$BACKEND/storage"

# L'URL du frontend doit etre autorisee par l'API (CORS).
if [ -n "$FRONT_URL" ]; then
  export CORS_ORIGINS="$FRONT_URL"
fi
# Injectee dans l'interface au moment du build : la changer impose de reconstruire.
export NEXT_PUBLIC_API_URL="$API_URL"

# --- Backend ---------------------------------------------------------------
info "[1/2] Backend (API, Redis, modeles locaux$([ "$SCALE" -eq 1 ] && echo ', Nginx'))..."
cd "$BACKEND"
# Les deux variantes utilisent le port 8000 : on arrete l'autre si elle tourne.
"${OTHER_BACKEND_COMPOSE[@]}" down --remove-orphans >/dev/null 2>&1 || true
"${BACKEND_COMPOSE[@]}" up --build -d --remove-orphans

# --- Frontend --------------------------------------------------------------
info "[2/2] Frontend (API vue par le navigateur : $NEXT_PUBLIC_API_URL)..."
cd "$FRONTEND"
docker compose up --build -d --remove-orphans

# --- Attente que tout reponde ----------------------------------------------
wait_for() {
  local name="$1" url="$2" waited=0
  printf '    attente de %s (%s)' "$name" "$url"
  until curl -fsS -o /dev/null "$url" 2>/dev/null; do
    if [ "$waited" -ge "$HEALTH_TIMEOUT" ]; then
      echo
      return 1
    fi
    printf '.'
    sleep 5
    waited=$((waited + 5))
  done
  echo " OK"
}

if command -v curl >/dev/null 2>&1; then
  info "Verification des services..."
  wait_for "l'API" "http://localhost:8000/api/health" \
    || fail "L'API ne repond pas apres ${HEALTH_TIMEOUT}s. Logs : cd backend && ${BACKEND_COMPOSE[*]} logs --tail 100"
  wait_for "l'interface" "http://localhost:3000" \
    || fail "L'interface ne repond pas. Logs : cd frontend && docker compose logs --tail 100"
else
  warn "curl absent : verification de sante ignoree."
fi

cat <<EOF

==========================================
  Deploiement termine
------------------------------------------
  Interface : http://localhost:3000${FRONT_URL:+  (public : $FRONT_URL)}
  API       : $API_URL
  Docs API  : http://localhost:8000/docs
==========================================
Logs backend  : cd backend  && ${BACKEND_COMPOSE[*]} logs -f
Logs frontend : cd frontend && docker compose logs -f
Tout arreter  : ./deploy.sh --down
EOF
