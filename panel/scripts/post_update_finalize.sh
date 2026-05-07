#!/bin/bash
# Runs automatically after npm install.
# Keeps update command simple and prints clear final status.

set -uo pipefail

echo "[postinstall] Проверка файлов панели..."

# Ensure install scripts are executable (safe no-op if already executable)
chmod +x /opt/naiveproxy-panel/panel/scripts/*.sh 2>/dev/null || true

echo "[postinstall] ✅ Файлы панели обновлены успешно."
echo "[postinstall] Теперь выполните: pm2 restart naiveproxy-panel"

