#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  NaiveProxy Panel v5.0 — Ultra-Fast Installer
#  Установка за 60 секунд с полной VDS-оптимизацией
#  Запуск: bash <(curl -fsSL https://raw.githubusercontent.com/kayucm21/3Dpovaw/main/install.sh)
# ═══════════════════════════════════════════════════════════════

set -uo pipefail
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a
export NEEDRESTART_SUSPEND=1

REPO_URL="https://github.com/kayucm21/3Dpovaw"
PANEL_DIR="/opt/naiveproxy-panel"
SERVICE_NAME="naiveproxy-panel"
INTERNAL_PORT=3000

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; PURPLE='\033[0;35m'; CYAN='\033[0;36m'
BOLD='\033[1m'; RESET='\033[0m'

header() {
  [[ -t 1 ]] && clear || true
  echo ""
  echo -e "${PURPLE}${BOLD}╔═══════════════════════════════════════════════════════════════╗${RESET}"
  echo -e "${PURPLE}${BOLD}║     NaiveProxy Panel v5.0 — Ultra-Fast Installer             ║${RESET}"
  echo -e "${PURPLE}${BOLD}╚═══════════════════════════════════════════════════════════════╝${RESET}"
  echo ""
}

log_step() { echo -e "\n${CYAN}${BOLD}▶ $1${RESET}"; }
log_ok()   { echo -e "${GREEN}✅ $1${RESET}"; }
log_warn() { echo -e "${YELLOW}⚠  $1${RESET}"; }
log_err()  { echo -e "${RED}❌ $1${RESET}"; }
log_info() { echo -e "   ${BLUE}$1${RESET}"; }

header

[[ $EUID -ne 0 ]] && { log_err "Запускайте от root: sudo bash install.sh"; exit 1; }
! command -v apt-get &>/dev/null && { log_err "Только Ubuntu/Debian"; exit 1; }

SERVER_IP=$(curl -4 -s --connect-timeout 5 ifconfig.me 2>/dev/null || curl -4 -s --connect-timeout 5 icanhazip.com 2>/dev/null || hostname -I | awk '{print $1}')
echo -e "   ${BLUE}IP сервера: ${BOLD}${SERVER_IP}${RESET}"
echo ""

# ═══════════════════════════════════════════════════════════════
# VDS AUTO-DETECT & OPTIMIZE
# ═══════════════════════════════════════════════════════════════
log_step "⚡ VDS Auto-Detect & Optimize"

# Определяем ресурсы
TOTAL_RAM=$(free -m | awk 'NR==2{print $2}')
CPU_CORES=$(nproc)
DISK_TYPE=$(cat /sys/block/$(lsblk -ndo NAME | head -1)/queue/rotational 2>/dev/null || echo "1")
[[ "$DISK_TYPE" == "0" ]] && DISK_TYPE="SSD" || DISK_TYPE="HDD"

log_info "RAM: ${TOTAL_RAM}MB | CPU: ${CPU_CORES} cores | Disk: ${DISK_TYPE}"

# Оптимизация sysctl под ресурсы
SYSCTL_CONF="/etc/sysctl.d/99-naiveproxy.conf"
cat > "$SYSCTL_CONF" <<EOF
# NaiveProxy Panel v5.0 — VDS Optimizations
net.core.default_qdisc=fq
net.ipv4.tcp_congestion_control=bbr
net.core.rmem_max=67108864
net.core.wmem_max=67108864
net.core.rmem_default=262144
net.core.wmem_default=262144
net.ipv4.tcp_rmem=4096 87380 67108864
net.ipv4.tcp_wmem=4096 65536 67108864
net.ipv4.tcp_window_scaling=1
net.ipv4.tcp_fastopen=3
net.ipv4.tcp_tw_reuse=1
net.ipv4.tcp_fin_timeout=15
net.ipv4.tcp_keepalive_time=300
net.ipv4.tcp_max_syn_backlog=65536
net.core.netdev_max_backlog=65536
net.ipv4.ip_local_port_range=1024 65535
fs.file-max=2097152
fs.nr_open=2097152
EOF

# Оптимизация limits
LIMITS_CONF="/etc/security/limits.d/99-naiveproxy.conf"
cat > "$LIMITS_CONF" <<EOF
* soft nofile 1048576
* hard nofile 1048576
* soft nproc 65536
* hard nproc 65536
root soft nofile 1048576
root hard nofile 1048576
EOF

# Применяем sysctl
sysctl --system >/dev/null 2>&1 || sysctl -p "$SYSCTL_CONF" >/dev/null 2>&1 || true
log_ok "VDS оптимизирован: BBR + TCP tuning + limits"

# ═══════════════════════════════════════════════════════════════
# FAST SYSTEM UPDATE (параллельно)
# ═══════════════════════════════════════════════════════════════
log_step "⚡ Быстрое обновление системы"

# Параллельное обновление и установка
(
  apt-get update -qq -o DPkg::Lock::Timeout=30 2>/dev/null
  apt-get install -y -qq -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" \
    curl wget git unzip jq ufw iproute2 ca-certificates openssl net-tools \
    apt-transport-https gnupg2 software-properties-common 2>/dev/null
) &
BG_PID=$!

# Пока обновляется — определяем параметры
print_access_option() {
  local n="$1"; shift; local text="$1"; shift; local mark=" "
  [[ "${ACCESS_MODE:-}" == "$n" ]] && mark="✅"
  echo -e "  ${mark} ${CYAN}${n})${RESET} ${text}"
}

echo -e "${BOLD}Выберите способ доступа к панели:${RESET}"
print_access_option "1" "Через Nginx на порту ${BOLD}8080${RESET} ${GREEN}(рекомендуется)${RESET}"
print_access_option "2" "Напрямую на порту ${BOLD}3000${RESET}"
print_access_option "3" "Через Nginx с доменом + HTTPS"
echo ""

if [[ -z "${ACCESS_MODE:-}" ]]; then
  [[ -t 0 ]] && read -rp "Ваш выбор [1/2/3]: " ACCESS_MODE || ACCESS_MODE="1"
fi
ACCESS_MODE="${ACCESS_MODE:-1}"

PANEL_DOMAIN=""; PANEL_EMAIL_SSL=""
if [[ "$ACCESS_MODE" == "3" ]]; then
  echo ""
  read -rp "  Домен панели (panel.yourdomain.com): " PANEL_DOMAIN
  read -rp "  Email для SSL: " PANEL_EMAIL_SSL
fi

echo ""
echo -e "${BOLD}Выберите протокол:${RESET}"
echo -e "  ${CYAN}1)${RESET} Naive (Caddy forwardproxy)"
echo -e "  ${CYAN}2)${RESET} VLESS (Xray + Caddy WS+TLS) ${GREEN}(быстрее)${RESET}"
[[ -t 0 ]] && read -rp "Ваш выбор [1/2]: " PROTOCOL_CHOICE || PROTOCOL_CHOICE="2"
PROTOCOL_CHOICE="${PROTOCOL_CHOICE:-2}"
INSTALL_PROTOCOL="naive"
[[ "$PROTOCOL_CHOICE" == "2" ]] && INSTALL_PROTOCOL="vless"

echo ""
echo -e "${BOLD}Настройка ${INSTALL_PROTOCOL^^}:${RESET}"
echo -e "${YELLOW}  ⚠ Убедитесь что A-запись домена указывает на ${SERVER_IP}${RESET}"
echo ""
read -rp "  Домен для прокси (vpn.yourdomain.com): " NAIVE_DOMAIN
read -rp "  Email для Let's Encrypt: " NAIVE_EMAIL

# Генерация данных
NAIVE_LOGIN=$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 16)
NAIVE_PASS=$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 24)
VLESS_UUID=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || openssl rand -hex 16 | sed 's/\(..\)/\1/g' | head -c 36)
VLESS_PORT="443"
VLESS_WS_PATH="/vless"

echo ""
echo -e "${GREEN}  ✅ Сгенерированы данные:${RESET}"
[[ "$INSTALL_PROTOCOL" == "naive" ]] && { log_info "Логин:  ${NAIVE_LOGIN}"; log_info "Пароль: ${NAIVE_PASS}"; } || log_info "UUID: ${VLESS_UUID}"
log_info "Домен:  ${NAIVE_DOMAIN}"
echo ""

# Ждём завершения apt
wait $BG_PID 2>/dev/null || true
log_ok "Система обновлена"

# ═══════════════════════════════════════════════════════════════
# FAST INSTALL (параллельно где возможно)
# ═══════════════════════════════════════════════════════════════
log_step "⚡ Установка зависимостей"

# Node.js (быстрая установка)
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
  apt-get install -y -qq nodejs 2>/dev/null
fi
NODE_VER=$(node -v 2>/dev/null || echo "none")
log_ok "Node.js ${NODE_VER}"

# PM2
if ! command -v pm2 &>/dev/null; then
  npm install -g pm2@latest >/dev/null 2>&1
fi
log_ok "PM2 установлен"

# ═══════════════════════════════════════════════════════════════
# CLONE & SETUP PANEL (ускоренное)
# ═══════════════════════════════════════════════════════════════
log_step "⚡ Установка панели"

rm -rf "$PANEL_DIR" 2>/dev/null
mkdir -p "$PANEL_DIR"

# Быстрый clone с минимумом данных
git clone --depth=1 --single-branch "$REPO_URL" "$PANEL_DIR" >/dev/null 2>&1

cd "$PANEL_DIR/panel" || exit 1

# Установка зависимостей (production only, быстро)
npm install --omit=dev --no-audit --no-fund --silent >/dev/null 2>&1
log_ok "Панель установлена"

# ═══════════════════════════════════════════════════════════════
# INSTALL PROTOCOL (оптимизированное)
# ═══════════════════════════════════════════════════════════════
log_step "⚡ Установка ${INSTALL_PROTOCOL^^}"

if [[ "$INSTALL_PROTOCOL" == "naive" ]]; then
  # Naive - быстрая установка
  bash "$PANEL_DIR/panel/scripts/install_naiveproxy.sh" "$NAIVE_DOMAIN" "$NAIVE_EMAIL" "$NAIVE_LOGIN" "$NAIVE_PASS" 2>&1 | tail -5
else
  # VLESS с тюнингом
  export VLESS_DOMAIN="$NAIVE_DOMAIN"
  export VLESS_EMAIL="$NAIVE_EMAIL"
  export VLESS_UUID="$VLESS_UUID"
  export VLESS_PORT="$VLESS_PORT"
  export VLESS_WS_PATH="$VLESS_WS_PATH"
  bash "$PANEL_DIR/panel/scripts/install_vless.sh" 2>&1 | tail -10
fi
log_ok "${INSTALL_PROTOCOL^^} установлен"

# ═══════════════════════════════════════════════════════════════
# SYSTEMD SERVICE (оптимизированный)
# ═══════════════════════════════════════════════════════════════
log_step "⚡ Настройка сервиса"

cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=NaiveProxy Panel v5.0
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=${PANEL_DIR}/panel
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=3
KillMode=process
LimitNOFILE=1048576
LimitNPROC=65536
Environment=NODE_ENV=production
Environment=PORT=${INTERNAL_PORT}

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload >/dev/null 2>&1
systemctl enable "$SERVICE_NAME" >/dev/null 2>&1
systemctl start "$SERVICE_NAME" 2>/dev/null || pm2 start server/index.js --name "$SERVICE_NAME" --silent 2>/dev/null || true

# PM2 как fallback + авто-старт
if command -v pm2 &>/dev/null; then
  pm2 startup systemd -u root --silent 2>/dev/null || true
  pm2 save --silent 2>/dev/null || true
fi

log_ok "Сервис настроен"

# ═══════════════════════════════════════════════════════════════
# SAVE CONFIG
# ═══════════════════════════════════════════════════════════════
log_step "⚡ Сохранение конфигурации"

mkdir -p "$PANEL_DIR/panel/data"

cat > "$PANEL_DIR/panel/data/config.json" <<EOF
{
  "installed": true,
  "domain": "${NAIVE_DOMAIN}",
  "email": "${NAIVE_EMAIL}",
  "serverIp": "${SERVER_IP}",
  "adminPassword": "$(echo -n "admin" | openssl dgst -sha256 -binary | xxd -p -c 64)",
  "installProtocol": "${INSTALL_PROTOCOL}",
  "vlessPort": ${VLESS_PORT},
  "vlessWsPath": "${VLESS_WS_PATH}",
  "vlessAutoPort": true,
  "vlessPreferredPorts": [443, 2053, 2083, 2087, 2096, 8443],
  "tiktokMode": false,
  "warpInstalled": false,
  "warpEnabled": false,
  "warpKillswitch": true,
  "discordEnabled": false,
  "discordWebhookUrl": "",
  "discordIntervalSec": 300,
  "proxyUsers": [
    {
      "username": "${NAIVE_LOGIN}",
      "password": "${NAIVE_PASS}",
      "protocol": "${INSTALL_PROTOCOL}"
    }
  ]
}
EOF

# Сохранение данных для VLESS
if [[ "$INSTALL_PROTOCOL" == "vless" ]]; then
  echo "${VLESS_UUID}" > "$PANEL_DIR/panel/data/vless-uuid.txt"
fi

log_ok "Конфигурация сохранена"

# ═══════════════════════════════════════════════════════════════
# INSTALL HELPER SCRIPTS
# ═══════════════════════════════════════════════════════════════
log_step "⚡ Установка скриптов управления"

cp "$PANEL_DIR/panel-info.sh" /usr/local/bin/panel-info 2>/dev/null || true
cp "$PANEL_DIR/panel-password.sh" /usr/local/bin/panel-password 2>/dev/null || true
chmod +x /usr/local/bin/panel-info /usr/local/bin/panel-password 2>/dev/null || true

log_ok "Скрипты установлены: panel-info, panel-password"

# ═══════════════════════════════════════════════════════════════
# FIREWALL (быстрая настройка)
# ═══════════════════════════════════════════════════════════════
log_step "⚡ Настройка firewall"

ufw allow 22/tcp >/dev/null 2>&1
ufw allow 80/tcp >/dev/null 2>&1
ufw allow 443/tcp >/dev/null 2>&1
ufw allow 3000/tcp >/dev/null 2>&1
[[ "$ACCESS_MODE" == "1" ]] && ufw allow 8080/tcp >/dev/null 2>&1
ufw --force enable >/dev/null 2>&1 || true
log_ok "Firewall настроен"

# ═══════════════════════════════════════════════════════════════
# ACCESS MODE SETUP
# ═══════════════════════════════════════════════════════════════
log_step "⚡ Настройка доступа (режим ${ACCESS_MODE})"

if [[ "$ACCESS_MODE" == "1" ]]; then
  # Nginx reverse proxy на 8080
  apt-get install -y -qq nginx 2>/dev/null || true
  cat > /etc/nginx/sites-available/naiveproxy-panel <<'NGX'
server {
  listen 8080;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_buffering off;
    proxy_read_timeout 86400;
  }
}
NGX
  ln -sf /etc/nginx/sites-available/naiveproxy-panel /etc/nginx/sites-enabled/ 2>/dev/null
  rm -f /etc/nginx/sites-enabled/default 2>/dev/null
  nginx -t 2>/dev/null && systemctl restart nginx >/dev/null 2>&1 || true
  ACCESS_URL="http://${SERVER_IP}:8080"

elif [[ "$ACCESS_MODE" == "3" && -n "$PANEL_DOMAIN" ]]; then
  # HTTPS через Nginx
  apt-get install -y -qq nginx certbot python3-certbot-nginx 2>/dev/null || true
  cat > /etc/nginx/sites-available/naiveproxy-panel <<NGX
server {
  listen 80;
  server_name ${PANEL_DOMAIN};
  return 301 https://\$server_name\$request_uri;
}
server {
  listen 443 ssl http2;
  server_name ${PANEL_DOMAIN};
  ssl_certificate /etc/letsencrypt/live/${PANEL_DOMAIN}/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/${PANEL_DOMAIN}/privkey.pem;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_buffering off;
  }
}
NGX
  ln -sf /etc/nginx/sites-available/naiveproxy-panel /etc/nginx/sites-enabled/ 2>/dev/null
  rm -f /etc/nginx/sites-enabled/default 2>/dev/null
  nginx -t 2>/dev/null && systemctl restart nginx >/dev/null 2>&1 || true
  certbot --nginx -d "$PANEL_DOMAIN" --non-interactive --agree-tos -m "$PANEL_EMAIL_SSL" 2>/dev/null || true
  ACCESS_URL="https://${PANEL_DOMAIN}"
else
  ACCESS_URL="http://${SERVER_IP}:3000"
fi

log_ok "Доступ настроен"

# ═══════════════════════════════════════════════════════════════
# FINAL OUTPUT
# ═══════════════════════════════════════════════════════════════
echo ""
echo -e "${GREEN}${BOLD}╔═══════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${GREEN}${BOLD}║  ✅ Установка завершена за $(($(date +%s) - START_TIME)) секунд!                              ║${RESET}"
echo -e "${GREEN}${BOLD}╚═══════════════════════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "${BOLD}🌐 Панель управления:${RESET} ${CYAN}${ACCESS_URL}${RESET}"
echo -e "${BOLD}🔑 Логин:${RESET}    ${GREEN}admin${RESET}"
echo -e "${BOLD}🔑 Пароль:${RESET}   ${GREEN}admin${RESET} ${YELLOW}(смените сразу!)${RESET}"
echo ""

if [[ "$INSTALL_PROTOCOL" == "naive" ]]; then
  echo -e "${BOLD}🔗 Ссылка Naive:${RESET}"
  echo -e "   ${CYAN}naive+https://${NAIVE_LOGIN}:${NAIVE_PASS}@${NAIVE_DOMAIN}:443${RESET}"
else
  echo -e "${BOLD}🔗 Ссылка VLESS:${RESET}"
  echo -e "   ${CYAN}vless://${VLESS_UUID}@${NAIVE_DOMAIN}:${VLESS_PORT}?encryption=none&security=tls&type=ws&host=${NAIVE_DOMAIN}&sni=${NAIVE_DOMAIN}&path=${VLESS_WS_PATH}#VLESS${RESET}"
  echo ""
  echo -e "${BOLD}📱 Подписка (автообновление):${RESET}"
  echo -e "   ${CYAN}${ACCESS_URL}/sub/YOUR_TOKEN${RESET}"
  echo -e "   ${YELLOW}Создайте подписку в панели → Подписки${RESET}"
fi

echo ""
echo -e "${BOLD}⚡ VDS оптимизирован:${RESET} BBR + TCP Fast Open + Limits"
echo -e "${BOLD}🔄 Автообновление:${RESET} cd /opt/naiveproxy-panel && git pull && npm install && pm2 restart naiveproxy-panel"
echo ""
echo -e "${YELLOW}${BOLD}⚠ Важно:${RESET}"
echo -e "   • Смените пароль admin сразу после входа"
echo -e "   • Настройте 2FA в разделе Безопасность"
echo -e "   • Создайте подписку для автообновления ключей"
echo ""

START_TIME=$(date +%s)
