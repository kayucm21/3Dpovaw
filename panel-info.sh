#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  NaiveProxy Panel v6.0 — Информация о панели
#  Показывает: URL панели, логин, пароль, домен, протокол
#  Запуск: bash panel-info.sh
# ═══════════════════════════════════════════════════════════════

set -e

PANEL_DIR="/opt/naiveproxy-panel"
CONFIG_FILE="$PANEL_DIR/panel/data/config.json"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

if [[ $EUID -ne 0 ]]; then
  echo -e "${RED}❌ Запускайте от root: sudo bash panel-info.sh${RESET}"
  exit 1
fi

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo -e "${RED}❌ Панель не установлена!${RESET}"
  echo -e "   Установите: bash <(curl -fsSL https://raw.githubusercontent.com/kayucm21/3Dpovaw/main/install.sh)"
  exit 1
fi

# Получаем данные
SERVER_IP=$(curl -4 -s --connect-timeout 5 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
PANEL_URL="http://${SERVER_IP}:3000"

# Проверяем Nginx на 8080
if ss -tlnp | grep -q ':8080'; then
  PANEL_URL="http://${SERVER_IP}:8080"
fi

# Проверяем HTTPS домен
if [[ -f "/etc/nginx/sites-enabled/naiveproxy-panel" ]]; then
  DOMAIN=$(grep -oP 'server_name\s+\K[^;]+' /etc/nginx/sites-enabled/naiveproxy-panel | head -1 | xargs)
  if [[ -n "$DOMAIN" && -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]]; then
    PANEL_URL="https://${DOMAIN}"
  fi
fi

# Читаем конфиг
DOMAIN_PROXY=$(jq -r '.domain // "не задан"' "$CONFIG_FILE" 2>/dev/null || echo "не задан")
PROTOCOL=$(jq -r '.installProtocol // "не установлен"' "$CONFIG_FILE" 2>/dev/null || echo "не установлен")
EMAIL=$(jq -r '.email // "не задан"' "$CONFIG_FILE" 2>/dev/null || echo "не задан")
VLESS_PORT=$(jq -r '.vlessPort // "443"' "$CONFIG_FILE" 2>/dev/null || echo "443")
VLESS_WS=$(jq -r '.vlessWsPath // "/vless"' "$CONFIG_FILE" 2>/dev/null || echo "/vless")
WARP=$(jq -r '.warpEnabled // false' "$CONFIG_FILE" 2>/dev/null || echo "false")

# Пароль (хешированный, показываем как есть)
PASS_HASH=$(jq -r '.adminPassword // ""' "$CONFIG_FILE" 2>/dev/null || echo "")

# Проверяем статус сервисов
PANEL_STATUS=$(systemctl is-active naiveproxy-panel 2>/dev/null || echo "inactive")
XRAY_STATUS=$(systemctl is-active xray 2>/dev/null || echo "inactive")
CADDY_STATUS=$(systemctl is-active caddy 2>/dev/null || echo "inactive")
NGINX_STATUS=$(systemctl is-active nginx 2>/dev/null || echo "inactive")

status_icon() { [[ "$1" == "active" ]] && echo -e "${GREEN}●${RESET}" || echo -e "${RED}●${RESET}"; }

echo ""
echo -e "${CYAN}${BOLD}╔═══════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${CYAN}${BOLD}║           NaiveProxy Panel v6.0 — Информация                  ║${RESET}"
echo -e "${CYAN}${BOLD}╚═══════════════════════════════════════════════════════════════╝${RESET}"
echo ""

echo -e "${BOLD}🌐 Доступ к панели:${RESET}"
echo -e "   URL:      ${GREEN}${BOLD}${PANEL_URL}${RESET}"
echo -e "   Логин:    ${GREEN}admin${RESET}"
echo -e "   Пароль:   ${GREEN}admin${RESET} ${YELLOW}(смените через panel-password.sh)${RESET}"
echo ""

echo -e "${BOLD}📊 Статус сервисов:${RESET}"
echo -e "   Панель:   $(status_icon "$PANEL_STATUS") naiveproxy-panel"
echo -e "   Xray:     $(status_icon "$XRAY_STATUS") xray"
echo -e "   Caddy:    $(status_icon "$CADDY_STATUS") caddy"
echo -e "   Nginx:    $(status_icon "$NGINX_STATUS") nginx"
echo ""

echo -e "${BOLD}🔗 Прокси конфигурация:${RESET}"
echo -e "   Протокол: ${CYAN}${PROTOCOL}${RESET}"
echo -e "   Домен:    ${CYAN}${DOMAIN_PROXY}${RESET}"
echo -e "   Email:    ${CYAN}${EMAIL}${RESET}"

if [[ "$PROTOCOL" == "vless" ]]; then
  echo -e "   Порт:     ${CYAN}${VLESS_PORT}${RESET}"
  echo -e "   WS Path:  ${CYAN}${VLESS_WS}${RESET}"
  if [[ -f "$PANEL_DIR/panel/data/vless-uuid.txt" ]]; then
    UUID=$(cat "$PANEL_DIR/panel/data/vless-uuid.txt" 2>/dev/null || echo "не найден")
    echo -e "   UUID:     ${CYAN}${UUID}${RESET}"
    echo ""
    echo -e "${BOLD}🔗 VLESS ссылка:${RESET}"
    echo -e "   ${GREEN}vless://${UUID}@${DOMAIN_PROXY}:${VLESS_PORT}?encryption=none&security=tls&type=ws&host=${DOMAIN_PROXY}&sni=${DOMAIN_PROXY}&path=${VLESS_WS}#VLESS${RESET}"
  fi
else
  # Naive
  USERS=$(jq -r '.proxyUsers[0] // empty' "$CONFIG_FILE" 2>/dev/null)
  if [[ -n "$USERS" ]]; then
    NAIVE_LOGIN=$(echo "$USERS" | jq -r '.username // ""')
    NAIVE_PASS=$(echo "$USERS" | jq -r '.password // ""')
    if [[ -n "$NAIVE_LOGIN" && -n "$NAIVE_PASS" ]]; then
      echo ""
      echo -e "${BOLD}🔗 Naive ссылка:${RESET}"
      echo -e "   ${GREEN}naive+https://${NAIVE_LOGIN}:${NAIVE_PASS}@${DOMAIN_PROXY}:443${RESET}"
    fi
  fi
fi

echo ""
echo -e "${BOLD}🛡️ Безопасность:${RESET}"
if [[ "$WARP" == "true" ]]; then
  echo -e "   WARP:     ${GREEN}● Включен${RESET}"
else
  echo -e "   WARP:     ${YELLOW}○ Выключен${RESET}"
fi

# SNI Whitelist
SNI_FILE="$PANEL_DIR/panel/data/sni-whitelist.json"
if [[ -f "$SNI_FILE" ]]; then
  SNI_COUNT=$(jq '.domains | length' "$SNI_FILE" 2>/dev/null || echo "0")
  echo -e "   SNI:      ${CYAN}${SNI_COUNT} доменов в белом списке${RESET}"
fi

echo ""
echo -e "${BOLD}⚡ Быстрые команды:${RESET}"
echo -e "   ${CYAN}bash panel-password.sh${RESET}  — сменить логин/пароль"
echo -e "   ${CYAN}pm2 logs naiveproxy-panel${RESET} — логи панели"
echo -e "   ${CYAN}systemctl restart xray${RESET}     — рестарт Xray"
echo -e "   ${CYAN}cd /opt/naiveproxy-panel && git pull${RESET} — обновить"
echo ""
