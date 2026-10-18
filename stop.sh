#!/usr/bin/env bash
# Arrete XAM-XAM demarre par ./start.sh (backend et frontend).

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN="$ROOT/.run"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"

info() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }

# Tue un processus et tous ses descendants (npm -> next -> workers).
kill_tree() {
  local pid="$1" child
  for child in $(pgrep -P "$pid" 2>/dev/null); do kill_tree "$child"; done
  kill "$pid" 2>/dev/null
}

stop() {
  local name="$1" port="$2" pidfile="$RUN/$1.pid" pids
  if [ -f "$pidfile" ]; then
    kill_tree "$(cat "$pidfile")"
    rm -f "$pidfile"
  fi
  # Filet de securite : ce qui ecoute encore sur le port (ex. lance a la main).
  sleep 1
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null)"
  if [ -n "$pids" ]; then
    kill $pids 2>/dev/null
    sleep 1
    pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null)"
    [ -n "$pids" ] && kill -9 $pids 2>/dev/null
  fi
  info "$name arrete (port $port)."
}

stop backend "$BACKEND_PORT"
stop frontend "$FRONTEND_PORT"
