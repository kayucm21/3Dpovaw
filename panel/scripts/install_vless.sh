#!/bin/bash
# VLESS auto-install: Xray + Caddy TLS (WS)

set -uo pipefail
export DEBIAN_FRONTEND=noninteractive
export UCF_FORCE_CONFFOLD=1
export NEEDRESTART_MODE=a

DOMAIN="${VLESS_DOMAIN:-}"
EMAIL="${VLESS_EMAIL:-}"
UUID="${VLESS_UUID:-}"
VLESS_PORT="${VLESS_PORT:-443}"
WS_PATH="${VLESS_WS_PATH:-/vless}"

if [[ -z "$DOMAIN" || -z "$EMAIL" || -z "$UUID" ]]; then
  echo "ОШИБКА: Не заданы VLESS_DOMAIN, VLESS_EMAIL, VLESS_UUID"
  exit 1
fi

if [[ "${WS_PATH:0:1}" != "/" ]]; then
  WS_PATH="/${WS_PATH}"
fi

log() { echo "$1"; }
step() { echo "STEP:$1"; }

step 1
log "▶ Обновление системы и установка зависимостей..."
apt-get update -y -qq -o DPkg::Lock::Timeout=120 2>/dev/null || true
apt-get install -y -qq \
  -o Dpkg::Options::="--force-confdef" \
  -o Dpkg::Options::="--force-confold" \
  curl wget unzip jq ufw iproute2 ca-certificates 2>/dev/null || true
log "✅ Система обновлена"

step 2
log "▶ Включение BBR..."
grep -qxF "net.core.default_qdisc=fq" /etc/sysctl.conf \
  || echo "net.core.default_qdisc=fq" >> /etc/sysctl.conf
grep -qxF "net.ipv4.tcp_congestion_control=bbr" /etc/sysctl.conf \
  || echo "net.ipv4.tcp_congestion_control=bbr" >> /etc/sysctl.conf
sysctl -p >/dev/null 2>&1 || true
log "✅ BBR включён"

step 3
log "▶ Настройка файрволла..."
ufw allow 22/tcp >/dev/null 2>&1 || true
ufw allow 80/tcp >/dev/null 2>&1 || true
ufw allow "${VLESS_PORT}"/tcp >/dev/null 2>&1 || true
echo "y" | ufw enable >/dev/null 2>&1 || ufw --force enable >/dev/null 2>&1 || true
log "✅ Файрволл настроен"

step 4
log "▶ Установка Xray..."
XRAY_URL=$(curl -fsSL "https://api.github.com/repos/XTLS/Xray-core/releases/latest" | jq -r '.assets[] | select(.name | test("linux-64\\.zip$")) | .browser_download_url' | head -n1)
if [[ -z "$XRAY_URL" || "$XRAY_URL" == "null" ]]; then
  log "ОШИБКА: Не удалось получить ссылку Xray release"
  exit 1
fi

mkdir -p /tmp/xray-install /usr/local/etc/xray /var/log/xray
wget -q -O /tmp/xray-install/xray.zip "$XRAY_URL" || {
  log "ОШИБКА: Не удалось скачать Xray"
  exit 1
}
unzip -o -q /tmp/xray-install/xray.zip -d /tmp/xray-install
install -m 755 /tmp/xray-install/xray /usr/local/bin/xray
log "✅ Xray установлен"

step 5
log "▶ Настройка Xray inbound VLESS (WS)..."
cat > /usr/local/etc/xray/config.json <<EOF
{
  "log": {
    "access": "/var/log/xray/access.log",
    "error": "/var/log/xray/error.log",
    "loglevel": "warning"
  },
  "inbounds": [
    {
      "listen": "127.0.0.1",
      "port": 10000,
      "protocol": "vless",
      "settings": {
        "clients": [
          {
            "id": "${UUID}",
            "email": "admin@${DOMAIN}"
          }
        ],
        "decryption": "none"
      },
      "streamSettings": {
        "network": "ws",
        "security": "none",
        "wsSettings": {
          "path": "${WS_PATH}"
        }
      }
    }
  ],
  "outbounds": [
    {
      "protocol": "freedom"
    }
  ]
}
EOF
log "✅ Конфиг Xray создан"

step 6
log "▶ Создание systemd сервиса Xray..."
cat > /etc/systemd/system/xray.service <<'EOF'
[Unit]
Description=Xray Service
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/xray -config /usr/local/etc/xray/config.json
Restart=on-failure
RestartSec=3
LimitNOFILE=1048576

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable xray >/dev/null 2>&1 || true
systemctl restart xray
if ! systemctl is-active --quiet xray; then
  log "ОШИБКА: Xray не запустился"
  exit 1
fi
log "✅ Xray сервис запущен"

step 7
log "▶ Установка и настройка Caddy для TLS..."
apt-get install -y -qq \
  -o Dpkg::Options::="--force-confdef" \
  -o Dpkg::Options::="--force-confold" \
  caddy 2>/dev/null || true
mkdir -p /var/www/html /etc/caddy
cat > /var/www/html/index.html <<'EOF'
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Loading</title></head>
<body style="margin:0;background:#0b0b0b;color:#666;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh">Loading content...</body>
</html>
EOF

cat > /etc/caddy/Caddyfile <<EOF
:${VLESS_PORT}, ${DOMAIN} {
  tls ${EMAIL}

  log {
    output file /var/log/caddy/access.log
    format json
  }

  @vless path ${WS_PATH}*
  reverse_proxy @vless 127.0.0.1:10000

  file_server {
    root /var/www/html
  }
}
EOF
log "✅ Caddyfile создан"

if ! caddy validate --config /etc/caddy/Caddyfile >/tmp/vless-caddy-validate.err 2>&1; then
  cat /tmp/vless-caddy-validate.err
  log "ОШИБКА: Caddyfile невалиден"
  exit 1
fi

step 8
log "▶ Запуск Caddy..."
systemctl enable caddy >/dev/null 2>&1 || true
systemctl restart caddy
if ! systemctl is-active --quiet caddy; then
  systemctl status caddy --no-pager 2>/dev/null || true
  log "ОШИБКА: Caddy не запустился"
  exit 1
fi
log "✅ Caddy запущен"

log "▶ Финализация..."
rm -rf /tmp/xray-install
log "✅ VLESS установлен и готов к работе"

step DONE
exit 0
