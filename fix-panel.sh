#!/bin/bash
# 🔧 Скрипт восстановления панели NaiveProxy
# Ошибка: MODULE_NOT_FOUND — не установлены npm зависимости

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
RESET='\033[0m'
BOLD='\033[1m'

PANEL_DIR="/opt/naiveproxy-panel/panel"
SERVICE_NAME="naiveproxy-panel"

echo -e "${GREEN}${BOLD}╔═══════════════════════════════════════════════════════════╗${RESET}"
echo -e "${GREEN}${BOLD}║     🔧 Восстановление панели NaiveProxy                   ║${RESET}"
echo -e "${GREEN}${BOLD}╚═══════════════════════════════════════════════════════════╝${RESET}"
echo ""

# 1. Остановка сервиса
echo -e "${YELLOW}[1/7] Остановка сервиса...${RESET}"
systemctl stop "$SERVICE_NAME" 2>/dev/null || true
pm2 stop "$SERVICE_NAME" 2>/dev/null || true
pkill -f "node server/index.js" 2>/dev/null || true
sleep 1

# 2. Проверка Node.js
echo -e "${YELLOW}[2/7] Проверка Node.js и npm...${RESET}"
NODE_VER=$(node -v 2>/dev/null || echo "не найден")
NPM_VER=$(npm -v 2>/dev/null || echo "не найден")
echo -e "   Node.js: ${CYAN}${NODE_VER}${RESET}"
echo -e "   npm:     ${CYAN}${NPM_VER}${RESET}"

if [[ "$NODE_VER" == "не найден" ]]; then
    echo -e "${RED}❌ Node.js не установлен! Устанавливаю...${RESET}"
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
    apt-get install -y nodejs >/dev/null 2>&1
    echo -e "${GREEN}✅ Node.js установлен: $(node -v)${RESET}"
fi

# 3. Установка build-tools для node-pty
echo -e "${YELLOW}[3/7] Установка build-tools (для node-pty)...${RESET}"
apt-get install -y -qq build-essential python3 make g++ >/dev/null 2>&1
echo -e "${GREEN}✅ Build-tools установлены${RESET}"

# 4. Очистка и установка зависимостей
echo -e "${YELLOW}[4/7] Установка npm зависимостей...${RESET}"
cd "$PANEL_DIR"

# Удаляем старые node_modules
if [[ -d "node_modules" ]]; then
    echo -e "   Удаление старых node_modules..."
    rm -rf node_modules
fi

# Очистка кэша npm
npm cache clean --force >/dev/null 2>&1 || true

# Установка зависимостей
echo -e "   Запуск npm install (1-3 минуты)...${RESET}"
if npm install --omit=dev --no-audit --no-fund 2>&1 | tail -5; then
    echo -e "${GREEN}✅ npm install завершён${RESET}"
else
    echo -e "${YELLOW}⚠ Повторная попытка с --force...${RESET}"
    npm install --omit=dev --no-audit --no-fund --force 2>&1 | tail -5
fi

# 5. Проверка установки
echo -e "${YELLOW}[5/7] Проверка установки...${RESET}"
if [[ -d "node_modules/express" && -d "node_modules/node-pty" ]]; then
    echo -e "${GREEN}✅ Зависимости установлены успешно${RESET}"
else
    echo -e "${RED}❌ Ошибка! Пробую полный npm install...${RESET}"
    npm install 2>&1 | tail -10
fi

# 6. Проверка конфигурации
echo -e "${YELLOW}[6/7] Проверка конфигурации...${RESET}"
if [[ ! -f "data/config.json" ]]; then
    echo -e "${YELLOW}⚠ config.json не найден, создаю...${RESET}"
    mkdir -p data
    cat > data/config.json <<'EOF'
{
  "installed": true,
  "adminPassword": "8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918",
  "installProtocol": "naive",
  "proxyUsers": []
}
EOF
    echo -e "${GREEN}✅ config.json создан${RESET}"
else
    echo -e "${GREEN}✅ config.json найден${RESET}"
fi

# 7. Запуск сервиса
echo -e "${YELLOW}[7/7] Запуск сервиса...${RESET}"
systemctl daemon-reload >/dev/null 2>&1
systemctl restart "$SERVICE_NAME" 2>/dev/null || {
    echo -e "${YELLOW}⚠ systemctl не сработал, пробую pm2...${RESET}"
    pm2 restart "$SERVICE_NAME" --silent 2>/dev/null || {
        echo -e "${YELLOW}⚠ Запуск в фоне...${RESET}"
        cd "$PANEL_DIR"
        nohup node server/index.js > /var/log/naiveproxy-panel.log 2>&1 &
        sleep 2
    }
}

sleep 3

# Финальная проверка
echo ""
echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════════════${RESET}"
echo -e "${GREEN}${BOLD}📊 Статус сервисов:${RESET}"
echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════════════${RESET}"

PANEL_STATUS=$(systemctl is-active "$SERVICE_NAME" 2>/dev/null || echo "inactive")
NGINX_STATUS=$(systemctl is-active nginx 2>/dev/null || echo "inactive")

status_icon() { [[ "$1" == "active" ]] && echo -e "${GREEN}●${RESET}" || echo -e "${RED}●${RESET}"; }

echo -e "   Панель:   $(status_icon "$PANEL_STATUS") naiveproxy-panel"
echo -e "   Nginx:    $(status_icon "$NGINX_STATUS") nginx"
echo ""

# Проверка порта
if ss -tlnp 2>/dev/null | grep -q ':3000'; then
    echo -e "${GREEN}✅ Порт 3000 слушается${RESET}"
    echo -e "${GREEN}✅ Панель доступна: http://YOUR_IP:8080${RESET}"
else
    echo -e "${YELLOW}⚠ Порт 3000 не слушается — логи:${RESET}"
    echo -e "   ${CYAN}journalctl -u naiveproxy-panel -n 30 --no-pager${RESET}"
fi

echo ""
echo -e "${GREEN}${BOLD}✅ ГОТОВО! Панель должна работать!${RESET}"
echo ""