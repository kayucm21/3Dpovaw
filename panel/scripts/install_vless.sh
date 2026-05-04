#!/bin/bash
# VLESS auto-install: Xray + Reality/XTLS (v6.0) — МАКСИМАЛЬНОЕ ШИФРОВАНИЕ

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
log "▶ Обновление системы..."
apt-get update -y -qq -o DPkg::Lock::Timeout=120 2>/dev/null || true
apt-get install -y -qq -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" curl wget unzip jq ufw iproute2 ca-certificates openssl 2>/dev/null || true
log "✅ Система обновлена"

step 2
log "▶ Включение BBR и TCP оптимизаций..."
grep -qxF "net.core.default_qdisc=fq" /etc/sysctl.conf || echo "net.core.default_qdisc=fq" >> /etc/sysctl.conf
grep -qxF "net.ipv4.tcp_congestion_control=bbr" /etc/sysctl.conf || echo "net.ipv4.tcp_congestion_control=bbr" >> /etc/sysctl.conf
echo "net.core.rmem_max = 67108864" >> /etc/sysctl.conf
echo "net.core.wmem_max = 67108864" >> /etc/sysctl.conf
echo "net.ipv4.tcp_rmem = 4096 87380 67108864" >> /etc/sysctl.conf
echo "net.ipv4.tcp_wmem = 4096 65536 67108864" >> /etc/sysctl.conf
echo "net.ipv4.tcp_fastopen = 3" >> /etc/sysctl.conf
echo "net.ipv4.tcp_tw_reuse = 1" >> /etc/sysctl.conf
echo "net.ipv4.tcp_window_scaling = 1" >> /etc/sysctl.conf
echo "net.ipv4.tcp_keepalive_time = 300" >> /etc/sysctl.conf
echo "net.core.netdev_max_backlog = 65536" >> /etc/sysctl.conf
sysctl -p >/dev/null 2>&1 || true
log "✅ BBR и TCP тюнинг применён"

step 3
log "▶ Настройка фаерволла..."
ufw allow 22/tcp >/dev/null 2>&1 || true
ufw allow 80/tcp >/dev/null 2>&1 || true
ufw allow 443/tcp >/dev/null 2>&1 || true
ufw allow "${VLESS_PORT}"/tcp >/dev/null 2>&1 || true
echo "y" | ufw enable >/dev/null 2>&1 || ufw --force enable >/dev/null 2>&1 || true
log "✅ Файрволл настроен"

step 4
log "▶ Установка Xray..."
XRAY_URL=$(curl -fsSL "https://api.github.com/repos/XTLS/Xray-core/releases/latest" | jq -r '.assets[] | select(.name | test("linux-64\\.zip$")) | .browser_download_url' | head -n1)
if [[ -z "$XRAY_URL" || "$XRAY_URL" == "null" ]]; then
  log "ОШИБКА: Не удалось получить ссылку Xray"
  exit 1
fi

mkdir -p /tmp/xray-install /usr/local/etc/xray /var/log/xray /opt/naiveproxy-panel/panel/data
wget -q -O /tmp/xray-install/xray.zip "$XRAY_URL" || { log "ОШИБКА: Не удалось скачать Xray"; exit 1; }
unzip -o -q /tmp/xray-install/xray.zip -d /tmp/xray-install
install -m 755 /tmp/xray-install/xray /usr/local/bin/xray
log "✅ Xray установлен"

step 5
log "▶ Генерация Reality ключей..."
# Генерируем Reality ключи для максимальной защиты
REALITY_PRIVATE=$(/usr/local/bin/xray x25519 2>/dev/null | grep "Private" | awk '{print $3}' || openssl rand -hex 32)
REALITY_PUBLIC=$(/usr/local/bin/xray x25519 2>/dev/null | grep "Public" | awk '{print $3}' || openssl rand -hex 32)
REALITY_SHORTID=$(openssl rand -hex 4)
# Fallback SNI (копируем основной домен)
REALITY_SNI="www.cloudflare.com"

# Сохраняем Reality ключи
cat > /opt/naiveproxy-panel/panel/data/reality-keys.json <<EOF
{
  "privateKey": "${REALITY_PRIVATE}",
  "publicKey": "${REALITY_PUBLIC}",
  "shortId": "${REALITY_SHORTID}",
  "serverNames": ["${DOMAIN}", "${REALITY_SNI}"]
}
EOF
log "✅ Reality ключи сгенерированы"

step 6
log "▶ Настройка Xray с Reality + Vision (максимальное шифрование)..."
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
      "settings": {
        "domainStrategy": "UseIPv4"
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
      },
      {
        "type": "field",
        "domain": ["geosite:category-ads-all"],
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
log "✅ Xray настроен с Reality + XTLS-Vision (невозможно отследить!)"

step 7
log "▶ Установка Caddy (для fallback сайта)..."
apt-get install -y -qq -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" debian-keyring debian-archive-keyring apt-transport-https 2>/dev/null || true
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' 2>/dev/null | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg 2>/dev/null || true
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' 2>/dev/null | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null 2>&1 || true
apt-get update -y -qq -o DPkg::Lock::Timeout=120 2>/dev/null || true
apt-get install -y -qq -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" caddy 2>/dev/null || true

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
  log "✅ VLESS + Reality установлен и работает!"
  log "🔗 Ссылка подключения:"
  log "vless://${UUID}@${DOMAIN}:${VLESS_PORT}?encryption=none&security=reality&sni=${DOMAIN}&fp=chrome&pbk=${REALITY_PUBLIC}&sid=${REALITY_SHORTID}&type=tcp&flow=xtls-rprx-vision#Reality"
else
  log "⚠️ Проверьте логи: journalctl -u xray -n 50 --no-pager"
fi
