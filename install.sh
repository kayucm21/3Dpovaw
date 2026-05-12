#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  NaiveProxy Panel v7.1 — Ultra-Fast Installer (15-30 секунд)
#  Оптимизировано для слабых VDS (HDD, 1 core, 256MB RAM)
#  Запуск: bash <(curl -fsSL https://raw.githubusercontent.com/kayucm21/3Dpovaw/main/install.sh)
# ═══════════════════════════════════════════════════════════════

set -uo pipefail
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a
export NEEDRESTART_SUSPEND=1
export UCF_FORCE_CONFFOLD=1

REPO_URL="https://github.com/kayucm21/3Dpovaw"
PANEL_DIR="/opt/naiveproxy-panel"
SERVICE_NAME="naiveproxy-panel"
INTERNAL_PORT=3000

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; PURPLE='\033[0;35m'; CYAN='\033[0;36m'
BOLD='\033[1m'; RESET='\033[0m'

START_TIME=$(date +%s)

header() {
  [[ -t 1 ]] && clear || true
  echo ""
  echo -e "${PURPLE}${BOLD}╔═══════════════════════════════════════════════════════════════╗${RESET}"
  echo -e "${PURPLE}${BOLD}║     NaiveProxy Panel v7.1 — Ultra-Fast (15-30 сек)           ║${RESET}"
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

SERVER_IP=$(curl -4 -s --connect-timeout 3 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
log_info "IP сервера: ${BOLD}${SERVER_IP}${RESET}"

# ═══════════════════════════════════════════════════════════════
# БЫСТРАЯ ОПТИМИЗАЦИЯ (без лишних проверок)
# ═══════════════════════════════════════════════════════════════
log_step "⚡ BBR + TCP tuning"
grep -q "tcp_congestion_control=bbr" /etc/sysctl.conf 2>/dev/null || {
  echo "net.core.default_qdisc=fq" >> /etc/sysctl.conf
  echo "net.ipv4.tcp_congestion_control=bbr" >> /etc/sysctl.conf
  sysctl -p >/dev/null 2>&1 || true
}
log_ok "BBR включён"

# ═══════════════════════════════════════════════════════════════
# МИНИМАЛЬНОЕ ОБНОВЛЕНИЕ (только если критично отсутствует)
# ═══════════════════════════════════════════════════════════════
log_step "⚡ Проверка зависимостей"
MISSING=""
for pkg in curl wget git ca-certificates; do
  dpkg -s "$pkg" &>/dev/null || MISSING="$MISSING $pkg"
done
if [[ -n "$MISSING" ]]; then
  apt-get update -qq -o DPkg::Lock::Timeout=30 2>/dev/null || true
  apt-get install -y -qq $MISSING 2>/dev/null || true
fi
log_ok "Зависимости готовы"

# ═══════════════════════════════════════════════════════════════
# ВВОД ДАННЫХ (быстро)
# ═══════════════════════════════════════════════════════════════
log_step "⚡ Настройка"

# Определение режима доступа (авто: nginx если есть)
ACCESS_MODE="1"
if command -v nginx &>/dev/null; then
  ACCESS_MODE="1"
elif [[ -z "${SKIP_NGINX:-}" ]]; then
  ACCESS_MODE="1"
fi

# Протокол (авто: vless)
INSTALL_PROTOCOL="vless"

# Ввод домена (единственное что спрашиваем)
if [[ -z "${NAIVE_DOMAIN:-}" ]]; then
  [[ -t 0 ]] && read -rp "  Домен для прокси (vpn.yourdomain.com): " NAIVE_DOMAIN
fi
if [[ -z "${NAIVE_EMAIL:-}" ]]; then
  [[ -t 0 ]] && read -rp "  Email для Let's Encrypt: " NAIVE_EMAIL
fi

NAIVE_LOGIN="admin"
NAIVE_PASS=$(openssl rand -base64 32 | tr -dc 'A-Za-z0-9' | head -c 16)
VLESS_UUID=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || openssl rand -hex 16 | sed 's/\(..\)/\1/g' | head -c 36)
VLESS_PORT="443"
VLESS_WS_PATH="/vless"

log_info "Домен: ${NAIVE_DOMAIN}"
[[ "$INSTALL_PROTOCOL" == "naive" ]] && log_info "Логин: ${NAIVE_LOGIN} | Пароль: ${NAIVE_PASS}" || log_info "UUID: ${VLESS_UUID}"

# ═══════════════════════════════════════════════════════════════
# NODE.JS БЫСТРО (бинарник, не репозиторий)
# ═══════════════════════════════════════════════════════════════
log_step "⚡ Node.js"
if command -v node &>/dev/null; then
  log_ok "Node.js $(node -v) уже установлен"
else
  # Бинарник Node.js (быстрее чем apt репозиторий)
  NODE_TGZ="https://nodejs.org/dist/v20.15.1/node-v20.15.1-linux-x64.tar.xz"
  wget -q --timeout=15 --tries=2 -O /tmp/node.tar.xz "$NODE_TGZ" 2>/dev/null || \
  curl -fsSL --max-time 15 --retry 2 -o /tmp/node.tar.xz "$NODE_TGZ" 2>/dev/null
  if [[ -s /tmp/node.tar.xz ]]; then
    tar -xf /tmp/node.tar.xz -C /usr/local --strip-components=1 2>/dev/null
    rm -f /tmp/node.tar.xz
    log_ok "Node.js $(node -v) установлен (бинарник)"
  else
    # Fallback через репозиторий
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
    apt-get install -y -qq nodejs 2>/dev/null
    log_ok "Node.js $(node -v) установлен"
  fi
fi

# PM2
if ! command -v pm2 &>/dev/null; then
  npm install -g pm2@latest --no-audit --no-fund --silent 2>/dev/null || true
fi
log_ok "PM2 готов"

# ═══════════════════════════════════════════════════════════════
# КЛОНИРОВАНИЕ ПАНЕЛИ (быстро)
# ═══════════════════════════════════════════════════════════════
log_step "⚡ Установка панели"
rm -rf "$PANEL_DIR" 2>/dev/null
mkdir -p "$PANEL_DIR"

git clone --depth=1 --single-branch "$REPO_URL" "$PANEL_DIR" >/dev/null 2>&1
cd "$PANEL_DIR/panel" || exit 1

# Установка зависимостей (production only)
npm install --omit=dev --no-audit --no-fund --silent 2>/dev/null || true
log_ok "Панель установлена"

# ═══════════════════════════════════════════════════════════════
# VLESS УСТАНОВКА (быстро)
# ═══════════════════════════════════════════════════════════════
log_step "⚡ Установка VLESS"
export VLESS_DOMAIN="$NAIVE_DOMAIN"
export VLESS_EMAIL="$NAIVE_EMAIL"
export VLESS_UUID="$VLESS_UUID"
export VLESS_PORT="$VLESS_PORT"
export VLESS_WS_PATH="$VLESS_WS_PATH"
bash "$PANEL_DIR/panel/scripts/install_vless.sh" 2>&1 | tail -5
log_ok "VLESS установлен"

# ═══════════════════════════════════════════════════════════════
# NGINX
# ═══════════════════════════════════════════════════════════════
log_step "⚡ Nginx"
if ! command -v nginx &>/dev/null; then
  apt-get install -y -qq nginx 2>/dev/null || true
fi
cat > /etc/nginx/sites-available/naiveproxy-panel <<'NGX'
server { listen 8080; location / { proxy_pass http://127.0.0.1:3000; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_buffering off; }}
NGX
ln -sf /etc/nginx/sites-available/naiveproxy-panel /etc/nginx/sites-enabled/ 2>/dev/null
rm -f /etc/nginx/sites-enabled/default 2>/dev/null
nginx -t 2>/dev/null && systemctl restart nginx 2>/dev/null || true
log_ok "Nginx готов"

# ═══════════════════════════════════════════════════════════════
# FIREWALL
# ═══════════════════════════════════════════════════════════════
log_step "⚡ Firewall"
ufw allow 22/tcp 2>/dev/null; ufw allow 80/tcp 2>/dev/null; ufw allow 443/tcp 2>/dev/null
ufw allow 3000/tcp 2>/dev/null; ufw allow 8080/tcp 2>/dev/null
ufw --force enable 2>/dev/null || true
log_ok "Firewall готов"

# ═══════════════════════════════════════════════════════════════
# СЕРВИС ПАНЕЛИ
# ═══════════════════════════════════════════════════════════════
log_step "⚡ Сервис панели"
cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=NaiveProxy Panel v7.1
After=network.target
[Service]
Type=simple
User=root
WorkingDirectory=${PANEL_DIR}/panel
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=3
LimitNOFILE=1048576
Environment=NODE_ENV=production
Environment=PORT=${INTERNAL_PORT}
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload 2>/dev/null; systemctl enable "$SERVICE_NAME" 2>/dev/null
systemctl start "$SERVICE_NAME" 2>/dev/null || pm2 start server/index.js --name "$SERVICE_NAME" 2>/dev/null || true
pm2 startup systemd -u root 2>/dev/null || true; pm2 save 2>/dev/null || true
log_ok "Панель запущена"

# ═══════════════════════════════════════════════════════════════
# СОХРАНЕНИЕ КОНФИГА
# ═══════════════════════════════════════════════════════════════
mkdir -p "$PANEL_DIR/panel/data"
cat > "$PANEL_DIR/panel/data/config.json" <<EOF
{"installed":true,"domain":"${NAIVE_DOMAIN}","email":"${NAIVE_EMAIL}","serverIp":"${SERVER_IP}","installProtocol":"vless","vlessPort":${VLESS_PORT},"proxyUsers":[{"username":"admin","password":"${VLESS_UUID}","protocol":"vless"}]}
EOF

# ═══════════════════════════════════════════════════════════════
# ФИНАЛ
# ═══════════════════════════════════════════════════════════════
ELAPSED=$(($(date +%s) - START_TIME))
echo ""
echo -e "${GREEN}${BOLD}╔═══════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${GREEN}${BOLD}║  ✅ Установка завершена за ${ELAPSED} сек!                        ║${RESET}"
echo -e "${GREEN}${BOLD}╚═══════════════════════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "${BOLD}🌐 Панель:${RESET} ${CYAN}http://${SERVER_IP}:8080${RESET}"
echo -e "${BOLD}🔑 Логин/Пароль:${RESET} ${GREEN}admin / admin${RESET}"
echo ""
echo -e "${BOLD}🔗 VLESS:${RESET} ${CYAN}vless://${VLESS_UUID}@${NAIVE_DOMAIN}:443?encryption=none&security=reality&flow=xtls-rprx-vision#VLESS${RESET}"
echo ""
echo -e "${YELLOW}⚠ Смените пароль сразу после входа!${RESET}"

