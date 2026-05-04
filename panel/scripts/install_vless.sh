#!/bin/bash
# VLESS auto-install: Xray + Caddy TLS (WS) — ТЮНИНГ 50MB БУФЕРА

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
apt-get install -y -qq -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" curl wget unzip jq ufw iproute2 ca-certificates 2>/dev/null || true
log "✅ Система обновлена"

step 2
log "▶ Включение BBR и TCP оптимизаций..."
# BBR
grep -qxF "net.core.default_qdisc=fq" /etc/sysctl.conf || echo "net.core.default_qdisc=fq" >> /etc/sysctl.conf
grep -qxF "net.ipv4.tcp_congestion_control=bbr" /etc/sysctl.conf || echo "net.ipv4.tcp_congestion_control=bbr" >> /etc/sysctl.conf
# Тюнинг буферов 50MB
echo "net.core.rmem_max = 52428800" >> /etc/sysctl.conf
echo "net.core.wmem_max = 52428800" >> /etc/sysctl.conf
echo "net.core.rmem_default = 52428800" >> /etc/sysctl.conf
echo "net.core.wmem_default = 52428800" >> /etc/sysctl.conf
echo "net.ipv4.tcp_rmem = 4096 87380 52428800" >> /etc/sysctl.conf
echo "net.ipv4.tcp_wmem = 4096 65536 52428800" >> /etc/sysctl.conf
echo "net.ipv4.tcp_window_scaling = 1" >> /etc/sysctl.conf
echo "net.ipv4.tcp_fastopen = 3" >> /etc/sysctl.conf
echo "net.ipv4.tcp_tw_reuse = 1" >> /etc/sysctl.conf
echo "net.ipv4.tcp_fin_timeout = 15" >> /etc/sysctl.conf
echo "net.ipv4.tcp_keepalive_time = 300" >> /etc/sysctl.conf
echo "net.core.netdev_max_backlog = 65536" >> /etc/sysctl.conf
sysctl -p >/dev/null 2>&1 || true
log "✅ BBR и TCP тюнинг применён (50MB буфер)"

step 3
log "▶ Настройка фаерволла..."
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
wget -q -O /tmp/xray-install/xray.zip "$XRAY_URL" || { log "ОШИБКА: Не удалось скачать Xray"; exit 1; }
unzip -o -q /tmp/xray-install/xray.zip -d /tmp/xray-install
install -m 755 /tmp/xray-install/xray /usr/local/bin/xray
log "✅ Xray установлен"

step 5
log "▶ Настройка Xray inbound VLESS (WS) с тюнингом 50MB..."
cat > /usr/local/etc/xray/config.json <<'XEOF'
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
          "path": "${WS_PATH}",
          "maxEarlyData": 2048,
          "earlyDataHeaderName": "Sec-WebSocket-Protocol"
        },
        "sockopt": {
          "tcpFastOpen": true,
          "tcpKeepAliveIdle": 300
        }
      },
      "sniffing": {
        "enabled": true,
        "destOverride": ["http", "tls"]
      }
    }
  ],
  "outbounds": [
    {
      "protocol": "freedom",
      "settings": {
        "domainStrategy": "UseIPv4"
      },
      "streamSettings": {
        "sockopt": {
          "tcpFastOpen": true
        }
      }
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
      }
    ]
  },
  "policy": {
    "levels": {
      "0": {
        "handshake": 4,
        "connIdle": 300,
        "uplinkOnly": 2,
        "downlinkOnly": 5,
        "bufferSize": 50
      }
    },
    "system": {
      "statsInboundUplink": true,
      "statsInboundDownlink": true
    }
  }
}
XEOF
# Подставляем переменные
sed -i "s/\${UUID}/${UUID}/g" /usr/local/etc/xray/config.json
sed -i "s/\${DOMAIN}/${DOMAIN}/g" /usr/local/etc/xray/config.json
sed -i "s|\${WS_PATH}|${WS_PATH}|g" /usr/local/etc/xray/config.json
log "✅ Xray настроен с bufferSize 50MB и TCP Fast Open"

step 6
log "▶ Установка Caddy..."
apt-get install -y -qq -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" debian-keyring debian-archive-keyring apt-transport-https 2>/dev/null || true
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' 2>/dev/null | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg 2>/dev/null || true
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' 2>/dev/null | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null 2>&1 || true
apt-get update -y -qq -o DPkg::Lock::Timeout=120 2>/dev/null || true
apt-get install -y -qq -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" caddy 2>/dev/null || true
log "✅ Caddy установлен"

step 7
log "▶ Настройка Caddy..."
cat > /etc/caddy/Caddyfile <<'CEOF'
{
  auto_https off
  admin off
}

${DOMAIN} {
  tls ${EMAIL} {
    on_demand
  }

  @vless_websocket {
    path ${WS_PATH}
    header Connection *Upgrade*
    header Upgrade websocket
  }

  reverse_proxy @vless_websocket 127.0.0.1:10000 {
    header_up -Origin
    transport http {
      compression off
      versions h2c 2
    }
  }

  handle {
    respond "Hello, World!" 200
  }
}
CEOF
sed -i "s|\${DOMAIN}|${DOMAIN}|g" /etc/caddy/Caddyfile
sed -i "s|\${EMAIL}|${EMAIL}|g" /etc/caddy/Caddyfile
sed -i "s|\${WS_PATH}|${WS_PATH}|g" /etc/caddy/Caddyfile
log "✅ Caddy настроен"

step 8
log "▶ Создание systemd сервиса Xray..."
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
log "✅ Сервис Xray создан"

step 9
log "▶ Запуск сервисов..."
systemctl daemon-reload >/dev/null 2>&1 || true
systemctl enable --now xray >/dev/null 2>&1 || true
systemctl enable --now caddy >/dev/null 2>&1 || true
sleep 2
log "✅ Сервисы запущены"

step 10
log "▶ Проверка установки..."
XRAY_STATUS=$(systemctl is-active xray 2>/dev/null || echo "inactive")
CADDY_STATUS=$(systemctl is-active caddy 2>/dev/null || echo "inactive")
log "Xray статус: ${XRAY_STATUS}"
log "Caddy статус: ${CADDY_STATUS}"

if [[ "$XRAY_STATUS" == "active" && "$CADDY_STATUS" == "active" ]]; then
  log "✅ VLESS установлен и работает!"
  log "🔗 Ссылка подключения:"
  log "vless://${UUID}@${DOMAIN}:${VLESS_PORT}?encryption=none&security=tls&type=ws&host=${DOMAIN}&sni=${DOMAIN}&path=${WS_PATH}#admin"
else
  log "⚠️ Проверьте логи: journalctl -u xray -n 50 --no-pager"
  log "⚠️ Или: journalctl -u caddy -n 50 --no-pager"
fi
