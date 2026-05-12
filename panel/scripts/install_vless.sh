#!/bin/bash
# VLESS Ultra-Fast Install: Xray + Reality (v7.0) — установка за 15-30 секунд

set -uo pipefail
export DEBIAN_FRONTEND=noninteractive
export UCF_FORCE_CONFFOLD=1
export NEEDRESTART_MODE=a
export NEEDRESTART_SUSPEND=1

DOMAIN="${VLESS_DOMAIN:-}"
EMAIL="${VLESS_EMAIL:-}"
UUID="${VLESS_UUID:-}"
VLESS_PORT="${VLESS_PORT:-443}"
WS_PATH="${VLESS_WS_PATH:-/vless}"

[[ -z "$DOMAIN" || -z "$EMAIL" || -z "$UUID" ]] && { echo "ОШИБКА: Не заданы VLESS_DOMAIN, VLESS_EMAIL, VLESS_UUID"; exit 1; }
[[ "${WS_PATH:0:1}" != "/" ]] && WS_PATH="/${WS_PATH}"

log()  { echo "$1"; }
step() { echo "STEP:$1"; }

# ═══════════════════════════════════════════════════════════════
# STEP 1 — Быстрое обновление (только если нужно)
# ═══════════════════════════════════════════════════════════════
step 1
log "▶ Проверка зависимостей..."
MISSING_PKGS=""
for pkg in curl wget unzip jq ufw iproute2 ca-certificates openssl; do
  dpkg -s "$pkg" &>/dev/null || MISSING_PKGS="$MISSING_PKGS $pkg"
done
if [[ -n "$MISSING_PKGS" ]]; then
  apt-get install -y -qq -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" $MISSING_PKGS 2>/dev/null || true
fi
log "✅ Зависимости готовы"

# ═══════════════════════════════════════════════════════════════
# STEP 2 — BBR (только если не включён)
# ═══════════════════════════════════════════════════════════════
step 2
CURRENT_CC=$(sysctl -n net.ipv4.tcp_congestion_control 2>/dev/null || echo "")
if [[ "$CURRENT_CC" != "bbr" ]]; then
  grep -qxF "net.ipv4.tcp_congestion_control=bbr" /etc/sysctl.conf || echo "net.ipv4.tcp_congestion_control=bbr" >> /etc/sysctl.conf
  grep -qxF "net.core.default_qdisc=fq" /etc/sysctl.conf || echo "net.core.default_qdisc=fq" >> /etc/sysctl.conf
  sysctl -p >/dev/null 2>&1 || true
  log "✅ BBR включён"
else
  log "✅ BBR уже активен"
fi

# ═══════════════════════════════════════════════════════════════
# STEP 3 — Файрволл (быстро)
# ═══════════════════════════════════════════════════════════════
step 3
ufw allow 22/tcp 2>/dev/null
ufw allow 80/tcp 2>/dev/null
ufw allow 443/tcp 2>/dev/null
ufw allow "${VLESS_PORT}"/tcp 2>/dev/null
ufw --force enable 2>/dev/null || true
log "✅ Файрволл готов"

# ═══════════════════════════════════════════════════════════════
# STEP 4 — Xray (прямое скачивание, без API)
# ═══════════════════════════════════════════════════════════════
step 4
log "▶ Установка Xray..."

XRAY_BIN="/usr/local/bin/xray"
XRAY_VER=""

# Проверяем установлен ли Xray и его версия
if [[ -f "$XRAY_BIN" ]]; then
  XRAY_VER=$($XRAY_BIN version 2>/dev/null | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || echo "")
fi

# Скачиваем всегда свежий (быстро, ~5 сек)
XRAY_TMP="/tmp/xray-install-$$"
mkdir -p "$XRAY_TMP" /usr/local/etc/xray /var/log/xray

# Прямая ссылка на последний релиз (без API)
ARCH="linux-64"
XRAY_URL="https://github.com/XTLS/Xray-core/releases/latest/download/Xray-${ARCH}.zip"

wget -q --timeout=15 --tries=2 -O "${XRAY_TMP}/xray.zip" "$XRAY_URL" 2>/dev/null || \
curl -fsSL --max-time 15 --retry 2 -o "${XRAY_TMP}/xray.zip" "$XRAY_URL" 2>/dev/null

if [[ -s "${XRAY_TMP}/xray.zip" ]]; then
  unzip -o -q "${XRAY_TMP}/xray.zip" -d "$XRAY_TMP"
  install -m 755 "${XRAY_TMP}/xray" "$XRAY_BIN"
  rm -rf "$XRAY_TMP"
  log "✅ Xray установлен"
else
  log "⚠️ Xray скачать не удалось, используем существующий"
  [[ ! -f "$XRAY_BIN" ]] && { log "ОШИБКА: Xray не найден"; exit 1; }
fi

# ═══════════════════════════════════════════════════════════════
# STEP 5 — Reality ключи (мгновенно)
# ═══════════════════════════════════════════════════════════════
step 5
log "▶ Генерация Reality ключей..."

mkdir -p /opt/naiveproxy-panel/panel/data
REALITY_KEYS_FILE="/opt/naiveproxy-panel/panel/data/reality-keys.json"

if [[ -f "$REALITY_KEYS_FILE" ]]; then
  REALITY_PRIVATE=$(jq -r '.privateKey' "$REALITY_KEYS_FILE" 2>/dev/null || echo "")
  REALITY_PUBLIC=$(jq -r '.publicKey' "$REALITY_KEYS_FILE" 2>/dev/null || echo "")
  REALITY_SHORTID=$(jq -r '.shortId' "$REALITY_KEYS_FILE" 2>/dev/null || echo "")
fi

# Если ключи пустые — генерируем новые
if [[ -z "$REALITY_PRIVATE" || "$REALITY_PRIVATE" == "null" ]]; then
  KEYPAIR=$($XRAY_BIN x25519 2>/dev/null || echo "")
  if [[ -n "$KEYPAIR" ]]; then
    REALITY_PRIVATE=$(echo "$KEYPAIR" | grep "Private" | awk '{print $3}')
    REALITY_PUBLIC=$(echo "$KEYPAIR" | grep "Public" | awk '{print $3}')
  else
    REALITY_PRIVATE=$(openssl rand -hex 32)
    REALITY_PUBLIC=$(openssl rand -hex 32)
  fi
  REALITY_SHORTID=$(openssl rand -hex 4)
fi

REALITY_SNI="www.cloudflare.com"

cat > "$REALITY_KEYS_FILE" <<EOF
{
  "privateKey": "${REALITY_PRIVATE}",
  "publicKey": "${REALITY_PUBLIC}",
  "shortId": "${REALITY_SHORTID}",
  "serverNames": ["${DOMAIN}", "${REALITY_SNI}"]
}
EOF
log "✅ Reality ключи готовы"

# ═══════════════════════════════════════════════════════════════
# STEP 6 — Xray конфиг (мгновенно)
# ═══════════════════════════════════════════════════════════════
step 6
log "▶ Настройка Xray Reality + Vision..."

cat > /usr/local/etc/xray/config.json <<XEOF
{
  "log": {
    "access": "/var/log/xray/access.log",
    "error": "/var/log/xray/error.log",
    "loglevel": "warning"
  },
  "inbounds": [
    {
      "listen": "0.0.0.0",
      "port": ${VLESS_PORT},
      "protocol": "vless",
      "settings": {
        "clients": [
          {
            "id": "${UUID}",
            "email": "admin@${DOMAIN}",
            "flow": "xtls-rprx-vision"
          }
        ],
        "decryption": "none"
      },
      "streamSettings": {
        "network": "tcp",
        "security": "reality",
        "realitySettings": {
          "show": false,
          "dest": "${REALITY_SNI}:443",
          "xver": 0,
          "serverNames": [
            "${DOMAIN}",
            "${REALITY_SNI}",
            "www.microsoft.com",
            "www.apple.com",
            "www.amazon.com"
          ],
          "privateKey": "${REALITY_PRIVATE}",
          "shortIds": [
            "${REALITY_SHORTID}",
            "$(openssl rand -hex 4)",
            "$(openssl rand -hex 4)"
          ]
        }
      },
      "sniffing": {
        "enabled": true,
        "destOverride": ["http", "tls", "quic"]
      }
    }
  ],
  "outbounds": [
    {
      "protocol": "freedom",
      "settings": { "domainStrategy": "UseIPv4" }
    },
    {
      "protocol": "blackhole",
      "settings": {},
      "tag": "blocked"
    }
  ],
  "routing": {
    "domainStrategy": "IPIfNonMatch",
    "rules": [
      {
        "type": "field",
        "ip": ["geoip:private"],
        "outboundTag": "blocked"
      },
      {
        "type": "field",
        "domain": ["geosite:category-ads-all"],
        "outboundTag": "blocked"
      }
    ]
  }
}
XEOF
log "✅ Xray настроен"

# ═══════════════════════════════════════════════════════════════
# STEP 7 — Caddy (бинарник, без apt репозитория)
# ═══════════════════════════════════════════════════════════════
step 7
log "▶ Установка Caddy (fallback)..."

CADDY_BIN="/usr/bin/caddy"
if ! command -v caddy &>/dev/null; then
  CADDY_URL="https://github.com/caddyserver/caddy/releases/latest/download/caddy_linux_amd64"
  wget -q --timeout=10 --tries=2 -O /tmp/caddy "$CADDY_URL" 2>/dev/null || \
  curl -fsSL --max-time 10 --retry 2 -o /tmp/caddy "$CADDY_URL" 2>/dev/null
  if [[ -s /tmp/caddy ]]; then
    install -m 755 /tmp/caddy "$CADDY_BIN"
    rm -f /tmp/caddy
    log "✅ Caddy установлен (бинарник)"
  else
    # Fallback через apt
    apt-get install -y -qq caddy 2>/dev/null || true
    log "✅ Caddy установлен (apt fallback)"
  fi
else
  log "✅ Caddy уже установлен"
fi

mkdir -p /var/www/html /var/log/caddy
cat > /etc/caddy/Caddyfile <<CEOF
{
  auto_https off
  admin off
}

${DOMAIN} {
  tls ${EMAIL} {
    on_demand
  }
  respond "Hello, World!" 200
}
CEOF
sed -i "s|\${DOMAIN}|${DOMAIN}|g" /etc/caddy/Caddyfile
sed -i "s|\${EMAIL}|${EMAIL}|g" /etc/caddy/Caddyfile
log "✅ Caddy настроен"

# ═══════════════════════════════════════════════════════════════
# STEP 8 — Systemd сервис Xray
# ═══════════════════════════════════════════════════════════════
step 8
log "▶ Создание сервиса Xray..."

cat > /etc/systemd/system/xray.service <<'EOF'
[Unit]
Description=Xray Service
Documentation=https://github.com/xtls
After=network.target nss-lookup.target

[Service]
User=root
NoNewPrivileges=true
ExecStart=/usr/local/bin/xray run -config /usr/local/etc/xray/config.json
Restart=on-failure
RestartPreventExitStatus=23
LimitNPROC=10000
LimitNOFILE=1000000

[Install]
WantedBy=multi-user.target
EOF

# Caddy сервис (если нет)
if [[ ! -f /etc/systemd/system/caddy.service ]]; then
  cat > /etc/systemd/system/caddy.service <<'EOF'
[Unit]
Description=Caddy
Documentation=https://caddyserver.com/docs/
After=network.target network-online.target
Requires=network-online.target

[Service]
Type=notify
User=root
ExecStart=/usr/bin/caddy run --environ --config /etc/caddy/Caddyfile
ExecReload=/usr/bin/caddy reload --config /etc/caddy/Caddyfile --force
TimeoutStopSec=5s
LimitNOFILE=1048576
LimitNPROC=512
PrivateTmp=true
ProtectSystem=full
AmbientCapabilities=CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
EOF
fi

log "✅ Сервисы созданы"

# ═══════════════════════════════════════════════════════════════
# STEP 9 — Запуск (быстро, без sleep)
# ═══════════════════════════════════════════════════════════════
step 9
log "▶ Запуск сервисов..."

systemctl daemon-reload 2>/dev/null
systemctl enable xray 2>/dev/null
systemctl enable caddy 2>/dev/null
systemctl restart xray 2>/dev/null || systemctl start xray 2>/dev/null || true
systemctl restart caddy 2>/dev/null || systemctl start caddy 2>/dev/null || true

# Проверяем статус сразу
sleep 0.5
XRAY_STATUS=$(systemctl is-active xray 2>/dev/null || echo "inactive")
CADDY_STATUS=$(systemctl is-active caddy 2>/dev/null || echo "inactive")
log "Xray: ${XRAY_STATUS} | Caddy: ${CADDY_STATUS}"

# ═══════════════════════════════════════════════════════════════
# STEP 10 — Финал
# ═══════════════════════════════════════════════════════════════
step 10

if [[ "$XRAY_STATUS" == "active" ]]; then
  log "✅ VLESS + Reality установлен и работает!"
  log "🔗 Ссылка: vless://${UUID}@${DOMAIN}:${VLESS_PORT}?encryption=none&security=reality&sni=${DOMAIN}&fp=chrome&pbk=${REALITY_PUBLIC}&sid=${REALITY_SHORTID}&type=tcp&flow=xtls-rprx-vision#Reality"
else
  log "⚠️ Xray не запустился, пробуем ещё раз..."
  systemctl restart xray 2>/dev/null || true
  sleep 1
  XRAY_STATUS=$(systemctl is-active xray 2>/dev/null || echo "inactive")
  [[ "$XRAY_STATUS" == "active" ]] && log "✅ Xray запущен!" || log "❌ Проверьте: journalctl -u xray -n 20 --no-pager"
fi

log "STEP:DONE"
