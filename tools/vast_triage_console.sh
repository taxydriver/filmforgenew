#!/usr/bin/env bash
# vast_triage_console.sh - quick checks for Caddy + portal (:1111) + ComfyUI (:18188)
set -euo pipefail

log() { printf "\033[1;36m[triage]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[warn]\033[0m %s\n" "$*"; }
die() { printf "\033[1;31m[error]\033[0m %s\n" "$*"; exit 1; }

CADDYFILE="${CADDYFILE:-/etc/caddy/Caddyfile}"
PORTAL_PORT="${PORTAL_PORT:-1111}"
PORTAL_UPSTREAM_PORT="${PORTAL_UPSTREAM_PORT:-11111}"
COMFY_PORT="${COMFY_PORT:-18188}"

log "1) Caddy binary & config"
if ! command -v caddy >/dev/null 2>&1; then
  warn "caddy not in PATH; will rely on systemctl logs"
fi
[ -f "$CADDYFILE" ] || die "Caddyfile missing: $CADDYFILE"
echo "---- $CADDYFILE (head) ----"
sed -n '1,80p' "$CADDYFILE" || true
echo "---------------------------"

log "2) Validate Caddyfile syntax"
if command -v caddy >/dev/null 2>&1; then
  if ! caddy validate --config "$CADDYFILE"; then
    die "Caddyfile validation failed"
  fi
else
  warn "Skipping 'caddy validate' (binary missing)"
fi

log "3) Is Caddy running & listening on :$PORTAL_PORT?"
ss -lntp | grep -E ":$PORTAL_PORT\\s" || warn "Not listening on :$PORTAL_PORT"
systemctl is-active caddy && systemctl status caddy --no-pager -l | sed -n '1,25p' || warn "caddy service inactive?"

log "4) Curl portal (with and without token, if present in file)"
TOKEN="$(grep -m1 -oE '[0-9a-f]{64}' "$CADDYFILE" || true)"
set +e
curl -fsS "http://127.0.0.1:$PORTAL_PORT/health.ico" >/dev/null && echo "health.ico: OK" || echo "health.ico: FAIL"
if [ -n "$TOKEN" ]; then
  curl -fsS "http://127.0.0.1:$PORTAL_PORT/?token=$TOKEN" >/dev/null && echo "/ with token: OK" || echo "/ with token: FAIL"
  curl -fsS -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:$PORTAL_PORT/" >/dev/null && echo "/ bearer: OK" || echo "/ bearer: FAIL"
else
  warn "No token found in Caddyfile; skipping token tests"
fi
set -e

log "5) Check portal upstream on :$PORTAL_UPSTREAM_PORT"
ss -lntp | grep -E ":$PORTAL_UPSTREAM_PORT\\s" || warn "Nothing listening on :$PORTAL_UPSTREAM_PORT"
set +e
curl -fsS "http://127.0.0.1:$PORTAL_UPSTREAM_PORT" >/dev/null && echo "upstream root: OK" || echo "upstream root: FAIL"
set -e

log "6) Check ComfyUI on :$COMFY_PORT"
ss -lntp | grep -E ":$COMFY_PORT\\s" || warn "Nothing listening on :$COMFY_PORT"
set +e
curl -fsS "http://127.0.0.1:$COMFY_PORT/system_stats" >/dev/null && echo "comfy system_stats: OK" || echo "comfy system_stats: FAIL"
set -e

log "7) Recent Caddy logs"
journalctl -u caddy --no-pager -n 80 -o short-precise || warn "No journal entries for caddy"

echo
log "Done. If portal still not opening, likely causes:"
echo " - Caddy not running / not listening on :$PORTAL_PORT"
echo " - Portal upstream (:${PORTAL_UPSTREAM_PORT}) down"
echo " - Token/BASIC auth blocking without credentials"
echo " - Cloudflare/Proxy mismatch (use Full SSL)"
echo " - Caddyfile syntax issue (see validation step)"
