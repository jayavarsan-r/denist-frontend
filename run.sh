#!/usr/bin/env bash
# ============================================================================
# DentAI — start the whole stack (backend :4000 + frontend :3000)
# Usage:  ./run.sh        (Ctrl+C stops both)
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/dentai-app"
BACKEND_PORT=4000
FRONTEND_PORT=3000

c_green="\033[32m"; c_yellow="\033[33m"; c_red="\033[31m"; c_dim="\033[2m"; c_reset="\033[0m"
say() { echo -e "$1"; }

# ── pre-flight ──────────────────────────────────────────────────────────────
command -v node >/dev/null || { say "${c_red}✗ node not found${c_reset}"; exit 1; }
command -v ffmpeg >/dev/null || say "${c_yellow}⚠ ffmpeg not found — voice transcription (Sarvam) will fail. Install: brew install ffmpeg${c_reset}"
[ -f "$FRONTEND/.env.local" ] || say "${c_yellow}⚠ dentai-app/.env.local missing — set NEXT_PUBLIC_API_URL=http://localhost:$BACKEND_PORT${c_reset}"
[ -f "$BACKEND/.env" ] || say "${c_yellow}⚠ backend/.env missing — Supabase/AI keys won't load${c_reset}"

# ── free the ports (kill anything stale) ────────────────────────────────────
free_port() { local p=$1; local pids; pids=$(lsof -ti :"$p" 2>/dev/null || true); [ -n "$pids" ] && { say "${c_dim}freeing port $p (killing $pids)${c_reset}"; kill $pids 2>/dev/null || true; sleep 1; }; return 0; }
free_port "$BACKEND_PORT"
free_port "$FRONTEND_PORT"

# ── install deps if missing ─────────────────────────────────────────────────
[ -d "$BACKEND/node_modules" ]  || { say "${c_dim}installing backend deps…${c_reset}";  (cd "$BACKEND"  && npm install); }
[ -d "$FRONTEND/node_modules" ] || { say "${c_dim}installing frontend deps…${c_reset}"; (cd "$FRONTEND" && npm install); }

# ── start both ──────────────────────────────────────────────────────────────
BE_LOG="$(mktemp -t dentai-backend)"; FE_LOG="$(mktemp -t dentai-frontend)"
say "\n${c_green}▶ starting backend${c_reset}  → http://localhost:$BACKEND_PORT   ${c_dim}($BE_LOG)${c_reset}"
( cd "$BACKEND" && PORT=$BACKEND_PORT npm start >"$BE_LOG" 2>&1 ) & BE_PID=$!
say "${c_green}▶ starting frontend${c_reset} → http://localhost:$FRONTEND_PORT   ${c_dim}($FE_LOG)${c_reset}"
( cd "$FRONTEND" && npm run dev >"$FE_LOG" 2>&1 ) & FE_PID=$!

# ── clean shutdown on Ctrl+C ────────────────────────────────────────────────
cleanup() {
  say "\n${c_yellow}stopping…${c_reset}"
  kill "$BE_PID" "$FE_PID" 2>/dev/null || true
  free_port "$BACKEND_PORT"; free_port "$FRONTEND_PORT"
  exit 0
}
trap cleanup INT TERM

# ── wait until both answer ──────────────────────────────────────────────────
wait_ready() {  # $1=url $2=label
  for _ in $(seq 1 40); do
    if curl -s -m 2 -o /dev/null "$1"; then return 0; fi
    # surface early crashes
    kill -0 "$BE_PID" 2>/dev/null || { say "${c_red}✗ backend exited — see $BE_LOG${c_reset}"; tail -n 20 "$BE_LOG"; cleanup; }
    kill -0 "$FE_PID" 2>/dev/null || { say "${c_red}✗ frontend exited — see $FE_LOG${c_reset}"; tail -n 20 "$FE_LOG"; cleanup; }
    sleep 1
  done
  say "${c_yellow}⚠ $2 didn't answer in time (still starting?) — logs above${c_reset}"
}
wait_ready "http://localhost:$BACKEND_PORT/api/queue" "backend"
wait_ready "http://localhost:$FRONTEND_PORT/" "frontend"

say "\n${c_green}✅ DentAI is up${c_reset}"
say "   frontend  ${c_green}http://localhost:$FRONTEND_PORT${c_reset}"
say "   backend   ${c_green}http://localhost:$BACKEND_PORT${c_reset}"
say "   ${c_dim}dev login → phone 1234567891 · OTP 123456${c_reset}"
say "   ${c_dim}live logs below · Ctrl+C to stop both${c_reset}\n"

# stream both logs until Ctrl+C
tail -f "$BE_LOG" "$FE_LOG" &
wait "$BE_PID" "$FE_PID"
