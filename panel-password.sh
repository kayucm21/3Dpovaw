#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  NaiveProxy Panel v6.0 — Смена логина и пароля
#  Запуск: bash panel-password.sh
# ═══════════════════════════════════════════════════════════════

set -e

PANEL_DIR="/opt/naiveproxy-panel"
CONFIG_FILE="$PANEL_DIR/panel/data/config.json"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

if [[ $EUID -ne 0 ]]; then
  echo -e "${RED}❌ Запускайте от root: sudo bash panel-password.sh${RESET}"
  exit 1
fi

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo -e "${RED}❌ Панель не установлена!${RESET}"
  exit 1
fi

echo ""
echo -e "${CYAN}${BOLD}╔═══════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${CYAN}${BOLD}║        NaiveProxy Panel v6.0 — Смена доступа                  ║${RESET}"
echo -e "${CYAN}${BOLD}╚═══════════════════════════════════════════════════════════════╝${RESET}"
echo ""

# Текущий логин
CURRENT_LOGIN=$(jq -r '.adminUsername // "admin"' "$CONFIG_FILE" 2>/dev/null || echo "admin")
echo -e "${BLUE}Текущий логин: ${CURRENT_LOGIN}${RESET}"
echo ""

# Ввод новых данных
echo -e "${BOLD}Введите новые данные (Enter = оставить без изменений):${RESET}"
echo ""
read -rp "  Новый логин [admin]: " NEW_LOGIN
NEW_LOGIN="${NEW_LOGIN:-admin}"

while true; do
  read -rsp "  Новый пароль: " NEW_PASS
  echo ""
  if [[ -z "$NEW_PASS" ]]; then
    echo -e "${RED}❌ Пароль не может быть пустым!${RESET}"
    continue
  fi
  if [[ ${#NEW_PASS} -lt 4 ]]; then
    echo -e "${YELLOW}⚠ Пароль слишком короткий (минимум 4 символа)${RESET}"
    continue
  fi
  read -rsp "  Повторите пароль: " NEW_PASS2
  echo ""
  if [[ "$NEW_PASS" != "$NEW_PASS2" ]]; then
    echo -e "${RED}❌ Пароли не совпадают!${RESET}"
    continue
  fi
  break
done

# Генерация хеша пароля (bcrypt)
PASS_HASH=$(node -e "
const bcrypt = require('bcryptjs');
const hash = bcrypt.hashSync('$NEW_PASS', 10);
console.log(hash);
" 2>/dev/null || echo "")

# Fallback на SHA256 если bcrypt недоступен
if [[ -z "$PASS_HASH" ]]; then
  PASS_HASH=$(echo -n "$NEW_PASS" | openssl dgst -sha256 -binary | xxd -p -c 64)
fi

# Обновляем конфиг
TMP_FILE=$(mktemp)
jq --arg login "$NEW_LOGIN" --arg pass "$PASS_HASH" \
  '.adminUsername = $login | .adminPassword = $pass' \
  "$CONFIG_FILE" > "$TMP_FILE" && mv "$TMP_FILE" "$CONFIG_FILE"

# Перезапускаем панель
if systemctl is-active --quiet naiveproxy-panel 2>/dev/null; then
  systemctl restart naiveproxy-panel >/dev/null 2>&1 || true
elif command -v pm2 &>/dev/null; then
  pm2 restart naiveproxy-panel --silent >/dev/null 2>&1 || true
fi

echo ""
echo -e "${GREEN}${BOLD}✅ Данные успешно изменены!${RESET}"
echo ""
echo -e "${BOLD}🌐 Новые данные для входа:${RESET}"
echo -e "   Логин:  ${GREEN}${NEW_LOGIN}${RESET}"
echo -e "   Пароль: ${GREEN}(скрыт)${RESET}"
echo ""
echo -e "${YELLOW}⚠ Старые сессии будут сброшены. Перезайдите в панель.${RESET}"
echo ""
