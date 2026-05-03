#!/bin/bash
# Daily auto-update helper for the panel.
# Intended to be called by systemd timer.

set -uo pipefail

REPO_DIR="/opt/naiveproxy-panel"
PANEL_DIR="${REPO_DIR}/panel"
STATE_FILE="${PANEL_DIR}/data/update.json"

mkdir -p "${PANEL_DIR}/data" 2>/dev/null || true

now="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

run() {
  cd "$REPO_DIR"
  git pull --ff-only
  cd "$PANEL_DIR"
  npm install --omit=dev
  pm2 restart naiveproxy-panel
}

msg=""
if run >/tmp/panel-auto-update.out 2>/tmp/panel-auto-update.err; then
  result="success"
  msg="Обновлено"
else
  result="error"
  msg="$(tail -n 40 /tmp/panel-auto-update.err 2>/dev/null | tr -d "\r" | tail -n 40)"
  [[ -z "$msg" ]] && msg="Ошибка обновления"
fi

cat > "$STATE_FILE" <<EOF
{
  "lastUpdateAt": "${now}",
  "lastResult": "${result}",
  "lastMessage": "$(echo "$msg" | sed 's/"/\\"/g')"
}
EOF

