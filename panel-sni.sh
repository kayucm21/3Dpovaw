#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  NaiveProxy Panel v7.0 — SNI Whitelist Manager
#  Управление доменами для Reality маскировки
#  Запуск: bash panel-sni.sh
# ═══════════════════════════════════════════════════════════════

set -e

PANEL_DIR="/opt/naiveproxy-panel"
SNI_FILE="$PANEL_DIR/panel/data/sni-whitelist.json"
REALITY_KEYS_FILE="$PANEL_DIR/panel/data/reality-keys.json"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

if [[ $EUID -ne 0 ]]; then
  echo -e "${RED}❌ Запускайте от root: sudo bash panel-sni.sh${RESET}"
  exit 1
fi

if [[ ! -f "$PANEL_DIR/panel/data/config.json" ]]; then
  echo -e "${RED}❌ Панель не установлена!${RESET}"
  exit 1
fi

# Инициализация файла whitelist
init_whitelist() {
  if [[ ! -f "$SNI_FILE" ]]; then
    cat > "$SNI_FILE" <<EOF
{
  "domains": [
    {"domain": "www.cloudflare.com", "active": true, "addedAt": "$(date -Iseconds)"},
    {"domain": "www.microsoft.com", "active": true, "addedAt": "$(date -Iseconds)"},
    {"domain": "www.apple.com", "active": true, "addedAt": "$(date -Iseconds)"},
    {"domain": "www.amazon.com", "active": true, "addedAt": "$(date -Iseconds)"},
    {"domain": "www.google.com", "active": true, "addedAt": "$(date -Iseconds)"}
  ]
}
EOF
    echo "✅ Whitelist инициализирован"
  fi
}

# Показать меню
show_menu() {
  echo ""
  echo -e "${CYAN}${BOLD}╔═══════════════════════════════════════════════════════════════╗${RESET}"
  echo -e "${CYAN}${BOLD}║     NaiveProxy Panel v7.0 — SNI Whitelist Manager             ║${RESET}"
  echo -e "${CYAN}${BOLD}╚═══════════════════════════════════════════════════════════════╝${RESET}"
  echo ""
  echo -e "${BOLD}Меню:${RESET}"
  echo -e "  ${CYAN}1)${RESET} Показать список доменов"
  echo -e "  ${CYAN}2)${RESET} Добавить домен"
  echo -e "  ${CYAN}3)${RESET} Удалить домен"
  echo -e "  ${CYAN}4)${RESET} Включить/выключить домен"
  echo -e "  ${CYAN}5)${RESET} Добавить популярные домены"
  echo -e "  ${CYAN}6)${RESET} Проверить доступность домена"
  echo -e "  ${CYAN}7)${RESET} Обновить Xray конфигу"
  echo -e "  ${CYAN}0)${RESET} Выход"
  echo ""
}

# Показать список доменов
show_list() {
  if [[ ! -f "$SNI_FILE" ]]; then
    echo -e "${YELLOW}⚠ Whitelist пуст${RESET}"
    return
  fi
  
  local count=$(jq '.domains | length' "$SNI_FILE")
  local active=$(jq '[.domains[] | select(.active == true)] | length' "$SNI_FILE")
  
  echo -e "${BOLD}SNI Whitelist (${active}/${count} активных):${RESET}"
  echo ""
  
  jq -r '.domains[] | "  [\u2713] \(.domain) - \(.active | if . then "ACTIVE" else "INACTIVE" end)"' "$SNI_FILE" 2>/dev/null || \
  echo -e "${YELLOW}⚠ Ошибка чтения файла${RESET}"
  
  echo ""
}

# Добавить домен
add_domain() {
  read -rp "  Введите домен (например, www.cloudflare.com): " DOMAIN
  
  if [[ -z "$DOMAIN" ]]; then
    echo -e "${RED}❌ Домен не указан${RESET}"
    return
  fi
  
  # Проверка на дубликат
  if jq -e --arg d "$DOMAIN" '.domains[] | select(.domain == $d)' "$SNI_FILE" >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠ Домен уже существует${RESET}"
    return
  fi
  
  # Добавляем домен
  local tmp=$(mktemp)
  jq --arg d "$DOMAIN" --arg now "$(date -Iseconds)" \
    '.domains += [{"domain": $d, "active": true, "addedAt": $now}]' \
    "$SNI_FILE" > "$tmp" && mv "$tmp" "$SNI_FILE"
  
  echo -e "${GREEN}✅ Домен добавлен: $DOMAIN${RESET}"
}

# Удалить домен
remove_domain() {
  show_list
  read -rp "  Введите домен для удаления: " DOMAIN
  
  if [[ -z "$DOMAIN" ]]; then
    echo -e "${RED}❌ Домен не указан${RESET}"
    return
  fi
  
  if ! jq -e --arg d "$DOMAIN" '.domains[] | select(.domain == $d)' "$SNI_FILE" >/dev/null 2>&1; then
    echo -e "${RED}❌ Домен не найден${RESET}"
    return
  fi
  
  local tmp=$(mktemp)
  jq --arg d "$DOMAIN" '.domains = [.domains[] | select(.domain != $d)]' \
    "$SNI_FILE" > "$tmp" && mv "$tmp" "$SNI_FILE"
  
  echo -e "${GREEN}✅ Домен удалён: $DOMAIN${RESET}"
}

# Включить/выключить домен
toggle_domain() {
  show_list
  read -rp "  Введите домен: " DOMAIN
  
  if [[ -z "$DOMAIN" ]]; then
    echo -e "${RED}❌ Домен не указан${RESET}"
    return
  fi
  
  if ! jq -e --arg d "$DOMAIN" '.domains[] | select(.domain == $d)' "$SNI_FILE" >/dev/null 2>&1; then
    echo -e "${RED}❌ Домен не найден${RESET}"
    return
  fi
  
  local current=$(jq -r --arg d "$DOMAIN" '.domains[] | select(.domain == $d) | .active' "$SNI_FILE")
  local new_state=$([[ "$current" == "true" ]] && echo "false" || echo "true")
  
  local tmp=$(mktemp)
  jq --arg d "$DOMAIN" --argjson state "$new_state" \
    '.domains = [.domains[] | if .domain == $d then .active = $state else . end]' \
    "$SNI_FILE" > "$tmp" && mv "$tmp" "$SNI_FILE"
  
  echo -e "${GREEN}✅ Статус изменён: $DOMAIN -> $([[ "$new_state" == "true" ]] && echo "ACTIVE" || echo "INACTIVE")${RESET}"
}

# Добавить популярные домены
add_presets() {
  local presets=(
    "www.cloudflare.com"
    "www.microsoft.com"
    "www.apple.com"
    "www.amazon.com"
    "www.google.com"
    "www.youtube.com"
    "www.facebook.com"
    "www.twitter.com"
    "www.instagram.com"
    "www.linkedin.com"
    "www.netflix.com"
    "www.apple.com"
    "www.icloud.com"
    "www.outlook.com"
    "www.dropbox.com"
  )
  
  local added=0
  for domain in "${presets[@]}"; do
    if ! jq -e --arg d "$domain" '.domains[] | select(.domain == $d)' "$SNI_FILE" >/dev/null 2>&1; then
      local tmp=$(mktemp)
      jq --arg d "$domain" --arg now "$(date -Iseconds)" \
        '.domains += [{"domain": $d, "active": true, "addedAt": $now}]' \
        "$SNI_FILE" > "$tmp" && mv "$tmp" "$SNI_FILE"
      ((added++))
    fi
  done
  
  echo -e "${GREEN}✅ Добавлено популярных доменов: $added${RESET}"
}

# Проверить доступность домена
check_domain() {
  read -rp "  Введите домен для проверки: " DOMAIN
  
  if [[ -z "$DOMAIN" ]]; then
    echo -e "${RED}❌ Домен не указан${RESET}"
    return
  fi
  
  echo ""
  echo -e "${CYAN}Проверка домена: $DOMAIN${RESET}"
  echo ""
  
  # DNS lookup
  local dns=$(dig +short "$DOMAIN" 2>/dev/null | head -1)
  if [[ -n "$dns" ]]; then
    echo -e "  DNS A-запись: ${GREEN}$dns${RESET}"
  else
    echo -e "  DNS A-запись: ${RED}не найдена${RESET}"
  fi
  
  # HTTPS check
  local https=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "https://$DOMAIN" 2>/dev/null || echo "000")
  if [[ "$https" =~ ^2[0-9][0-9]$ ]]; then
    echo -e "  HTTPS доступность: ${GREEN}OK (HTTP $https)${RESET}"
  else
    echo -e "  HTTPS доступность: ${YELLOW}Недоступен (HTTP $https)${RESET}"
  fi
  
  # SNI support check
  local sni=$(echo | openssl s_client -connect "$DOMAIN:443" -servername "$DOMAIN" 2>/dev/null | grep -i "subject\|issuer" | head -2)
  if [[ -n "$sni" ]]; then
    echo -e "  SNI поддержка: ${GREEN}Да${RESET}"
  else
    echo -e "  SNI поддержка: ${RED}Нет${RESET}"
  fi
  
  echo ""
}

# Обновить Xray конфигу
update_xray() {
  if [[ ! -f "$SNI_FILE" ]]; then
    echo -e "${RED}❌ Whitelist не найден${RESET}"
    return
  fi
  
  echo -e "${CYAN}Обновление Xray конфигу...${RESET}"
  
  # Получаем список активных доменов
  local server_names=$(jq -r '[.domains[] | select(.active == true) | .domain]' "$SNI_FILE")
  
  if [[ -z "$server_names" || "$server_names" == "[]" ]]; then
    echo -e "${YELLOW}⚠ Нет активных доменов${RESET}"
    return
  fi
  
  # Проверяем наличие Reality ключей
  if [[ ! -f "$REALITY_KEYS_FILE" ]]; then
    echo -e "${RED}❌ Reality ключи не найдены. Сначала установите VLESS.${RESET}"
    return
  fi
  
  # Читаем текущий конфиг Xray
  local xray_config="/usr/local/etc/xray/config.json"
  if [[ ! -f "$xray_config" ]]; then
    echo -e "${RED}❌ Xray конфигу не найден${RESET}"
    return
  fi
  
  # Обновляем serverNames
  local tmp=$(mktemp)
  jq --argjson sn "$server_names" '.inbounds[0].streamSettings.realitySettings.serverNames = $sn' \
    "$xray_config" > "$tmp" && mv "$tmp" "$xray_config"
  
  # Перезапускаем Xray
  systemctl restart xray 2>/dev/null || echo -e "${YELLOW}⚠ Не удалось перезапустить Xray${RESET}"
  
  echo -e "${GREEN}✅ Xray конфигу обновлён${RESET}"
  echo -e "   Активных доменов: $(echo "$server_names" | jq 'length')"
  echo ""
}

# Главный цикл
init_whitelist

while true; do
  show_menu
  read -rp "  Ваш выбор: " choice
  
  case $choice in
    1) show_list ;;
    2) add_domain ;;
    3) remove_domain ;;
    4) toggle_domain ;;
    5) add_presets ;;
    6) check_domain ;;
    7) update_xray ;;
    0) 
      echo -e "${GREEN}До свидания!${RESET}"
      exit 0
      ;;
    *)
      echo -e "${RED}❌ Неверный выбор${RESET}"
      ;;
  esac
done
