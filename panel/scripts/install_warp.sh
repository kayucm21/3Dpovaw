#!/bin/bash
# Cloudflare WARP (WireGuard) installer using wgcf
#
# Result:
# - /etc/wireguard/warp.conf
# - systemd service: wg-quick@warp enabled + started
#
# Notes:
# - This script is designed for Ubuntu/Debian.
# - Requires root privileges.

set -uo pipefail
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a

log() { echo "$1"; }
step() { echo "STEP:$1"; }
die() { log "ОШИБКА: $1"; exit 1; }

tail_log() {
  local f="$1"
  [[ -f "$f" ]] || return 0
  log "----- ${f} (tail) -----"
  tail -n 80 "$f" 2>/dev/null || true
  log "------------------------"
}

detect_arch_suffix() {
  # wgcf release asset suffixes: linux_amd64, linux_arm64, linux_386, ...
  local m
  m="$(uname -m 2>/dev/null || echo amd64)"
  case "$m" in
    x86_64|amd64) echo "linux_amd64" ;;
    aarch64|arm64) echo "linux_arm64" ;;
    i386|i686) echo "linux_386" ;;
    armv7l|armv7) echo "linux_armv7" ;;
    armv6l|armv6) echo "linux_armv6" ;;
    armv5l|armv5) echo "linux_armv5" ;;
    *) echo "linux_amd64" ;;
  esac
}

require_root() {
  if [[ "${EUID:-$(id -u)}" != "0" ]]; then
    log "ОШИБКА: Запустите от root"
    exit 1
  fi
}

require_root

step 1
log "▶ Установка зависимостей (wireguard-tools, curl, jq)..."
log "  Фиксим dpkg/apt (если был прерван)..."
systemctl stop unattended-upgrades 2>/dev/null || true
systemctl disable unattended-upgrades 2>/dev/null || true
pkill -9 unattended-upgrades 2>/dev/null || true
sleep 2

rm -f /var/lib/dpkg/lock-frontend \
      /var/lib/dpkg/lock \
      /var/cache/apt/archives/lock \
      /var/lib/apt/lists/lock 2>/dev/null || true

if ! timeout 300 dpkg --configure -a >/tmp/warp-dpkg-configure.err 2>&1; then
  log "⚠ dpkg --configure -a занял слишком много времени или завершился с ошибкой, продолжаем с apt -f install..."
  tail_log /tmp/warp-dpkg-configure.err
fi

if ! timeout 420 apt-get -f install -y -qq \
  -o Dpkg::Options::="--force-confdef" \
  -o Dpkg::Options::="--force-confold" \
  -o DPkg::Lock::Timeout=120 >/tmp/warp-apt-fix.err 2>&1; then
  log "⚠ apt-get -f install не завершился быстро, продолжаем и пробуем обычную установку зависимостей..."
  tail_log /tmp/warp-apt-fix.err
fi

if ! apt-get update -y -qq -o DPkg::Lock::Timeout=120 2>/tmp/warp-apt-update.err; then
  tail_log /tmp/warp-apt-update.err
  die "apt-get update не удалось"
fi

if ! apt-get install -y -qq \
  -o Dpkg::Options::="--force-confdef" \
  -o Dpkg::Options::="--force-confold" \
  curl wget jq ca-certificates iproute2 gnupg2 2>/tmp/warp-apt-install-base.err; then
  tail_log /tmp/warp-apt-install-base.err
  die "не удалось установить базовые зависимости"
fi

# WireGuard tools (wg + wg-quick)
log "  Установка wireguard-tools..."
if ! apt-get install -y -qq \
  -o Dpkg::Options::="--force-confdef" \
  -o Dpkg::Options::="--force-confold" \
  wireguard-tools resolvconf 2>/tmp/warp-apt-install-wg.err; then
  # Try meta-package as fallback (Debian/Ubuntu variants)
  log "  ⚠ wireguard-tools не найден, пробуем установить wireguard..."
  if ! apt-get install -y -qq \
    -o Dpkg::Options::="--force-confdef" \
    -o Dpkg::Options::="--force-confold" \
    wireguard 2>/tmp/warp-apt-install-wireguard.err; then
    tail_log /tmp/warp-apt-install-wg.err
    tail_log /tmp/warp-apt-install-wireguard.err
    die "не удалось установить wireguard-tools (попробуйте установить вручную: apt install wireguard)"
  fi
fi

if ! command -v wg-quick >/dev/null 2>&1; then
  tail_log /tmp/warp-apt-install-wg.err
  tail_log /tmp/warp-apt-install-wireguard.err
  die "wg-quick не найден. Установите wireguard-tools вручную."
fi

if ! command -v wg >/dev/null 2>&1; then
  die "wg не найден. WireGuard tools установлены некорректно."
fi

mkdir -p /etc/wireguard
chmod 700 /etc/wireguard
log "✅ Зависимости установлены"

step 2
log "▶ Установка wgcf..."
if ! command -v wgcf >/dev/null 2>&1; then
  ARCH_SUFFIX="$(detect_arch_suffix)"
  log "  Архитектура: ${ARCH_SUFFIX}"
  
  WGCF_URL="$(curl -fsSL --connect-timeout 30 "https://api.github.com/repos/ViRb3/wgcf/releases/latest" \
    | jq -r --arg suf "$ARCH_SUFFIX" '.assets[] | select(.name | test("^wgcf_.*_" + $suf + "$")) | .browser_download_url' | head -n1)"
  
  if [[ -z "${WGCF_URL}" || "${WGCF_URL}" == "null" ]]; then
    log "⚠ Не удалось найти релиз wgcf для ${ARCH_SUFFIX}, пробуем скачать с Cloudflare..."
    # Fallback: try Cloudflare's official wgcf
    if [[ "$ARCH_SUFFIX" == "linux_amd64" ]]; then
      WGCF_URL="https://github.com/ViRb3/wgcf/releases/download/v2.2.16/wgcf_2.2.16_linux_amd64.tar.gz"
    elif [[ "$ARCH_SUFFIX" == "linux_arm64" ]]; then
      WGCF_URL="https://github.com/ViRb3/wgcf/releases/download/v2.2.16/wgcf_2.2.16_linux_arm64.tar.gz"
    else
      die "не удалось получить ссылку на wgcf для ${ARCH_SUFFIX}"
    fi
  fi
  
  log "  Скачиваем wgcf (${ARCH_SUFFIX})..."
  if ! curl -fL --retry 5 --retry-delay 3 --connect-timeout 30 --max-time 180 \
    -o /tmp/wgcf.tar.gz "${WGCF_URL}" 2>/tmp/wgcf-download.err; then
    tail_log /tmp/wgcf-download.err
    die "не удалось скачать wgcf"
  fi
  
  # Extract and install
  if [[ "${WGCF_URL}" == *.tar.gz ]]; then
    tar -xzf /tmp/wgcf.tar.gz -C /tmp || {
      die "не удалось распаковать wgcf"
    }
    if [[ -f /tmp/wgcf ]]; then
      mv /tmp/wgcf /usr/local/bin/wgcf
      chmod +x /usr/local/bin/wgcf
    else
      die "wgcf бинарник не найден в архиве"
    fi
  else
    mv /tmp/wgcf.tar.gz /usr/local/bin/wgcf 2>/dev/null || {
      curl -fL -o /usr/local/bin/wgcf "${WGCF_URL}" 2>/tmp/wgcf-download.err || \
        die "не удалось установить wgcf"
      chmod +x /usr/local/bin/wgcf
    }
  fi
  
  rm -f /tmp/wgcf.tar.gz
fi

if ! wgcf --version >/dev/null 2>&1; then
  die "wgcf установлен некорректно"
fi
log "✅ wgcf готов ($(wgcf --version 2>/dev/null | head -1 || echo 'unknown'))"

step 3
log "▶ Регистрация аккаунта WARP (wgcf)..."
WORKDIR="/etc/wireguard"
cd "$WORKDIR"

# Удаляем старый аккаунт если есть (перерегистрация)
if [[ -f "${WORKDIR}/wgcf-account.toml" ]]; then
  log "  Удаляем старый аккаунт для перерегистрации..."
  rm -f "${WORKDIR}/wgcf-account.toml" "${WORKDIR}/wgcf-private.key" "${WORKDIR}/wgcf-public.key" 2>/dev/null || true
fi

log "  Регистрируем новый аккаунт..."
if ! timeout 120 wgcf register 2>&1 | tee /tmp/wgcf-register.log; then
  tail_log /tmp/wgcf-register.log
  die "wgcf register не удался (timeout или ошибка)"
fi

if [[ ! -f "${WORKDIR}/wgcf-account.toml" ]]; then
  die "wgcf-account.toml не создан после регистрации"
fi

# Verify account
if ! wgcf show 2>/dev/null; then
  log "⚠ wgcf show не сработал, продолжаем..."
fi

log "✅ Аккаунт зарегистрирован"

step 4
log "▶ Генерация профиля..."
rm -f "${WORKDIR}/wgcf-profile.conf" >/dev/null 2>&1 || true

if ! wgcf generate 2>&1 | tee /tmp/wgcf-generate.log; then
  tail_log /tmp/wgcf-generate.log
  die "wgcf generate не удался"
fi

if [[ ! -s "${WORKDIR}/wgcf-profile.conf" ]]; then
  die "профиль wgcf пуст"
fi

# Convert wgcf profile to wg-quick config with a predictable name (warp.conf).
cp -f "${WORKDIR}/wgcf-profile.conf" "${WORKDIR}/warp.conf"

# Ensure full-tunnel for both IPv4 and IPv6 (hide server IPv4/IPv6 egress).
sed -i 's/^AllowedIPs *=.*/AllowedIPs = 0.0.0.0\/0, ::\/0/g' "${WORKDIR}/warp.conf" 2>/dev/null || true

# Make it more stable on mobile/cellular networks.
grep -q '^MTU' "${WORKDIR}/warp.conf" 2>/dev/null || echo "MTU = 1280" >> "${WORKDIR}/warp.conf"

# Fix endpoint if needed (Cloudflare WARP endpoints)
if ! grep -q '^Endpoint' "${WORKDIR}/warp.conf" 2>/dev/null; then
  echo "Endpoint = 162.159.192.1:2408" >> "${WORKDIR}/warp.conf"
fi

# Ensure proper permissions
chmod 600 "${WORKDIR}/warp.conf"
chmod 600 "${WORKDIR}/wgcf-account.toml" 2>/dev/null || true

log "✅ /etc/wireguard/warp.conf создан"

step 5
log "▶ Включение и запуск WARP (wg-quick@warp)..."
systemctl daemon-reload >/dev/null 2>&1 || true

# Create wg-quick service template if missing
if [[ ! -f /lib/systemd/system/wg-quick@.service && ! -f /etc/systemd/system/wg-quick@.service ]]; then
  log "  Создаём wg-quick@.service шаблон..."
  cat > /etc/systemd/system/wg-quick@.service <<'EOF'
[Unit]
Description=WireGuard via wg-quick(8) for %I
After=network-online.target nss-lookup.target
Wants=network-online.target
Documentation=man:wg-quick(8)
Documentation=man:wg(8)

[Service]
Type=oneshot
RemainAfterExit=yes
Environment=WG_QUICK_USERSPACE_IMPLEMENTATION=wireguard-go
Environment=WG_QUICK_USERSPACE_IMPLEMENTATION_PATH=/usr/bin/wireguard-go
ExecStart=/usr/bin/wg-quick up %i
ExecStop=/usr/bin/wg-quick down %i
ExecReload=/bin/bash -c '/usr/bin/wg syncconf %i <(/usr/bin/wg-quick strip %i)'

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload >/dev/null 2>&1 || true
fi

# Stop any existing WARP instance
log "  Останавливаем старый WARP (если был)..."
systemctl stop wg-quick@warp 2>/dev/null || true
wg-quick down warp 2>/dev/null || true
sleep 2

# Enable and start
log "  Включаем автостарт WARP..."
systemctl enable wg-quick@warp >/dev/null 2>&1 || true

log "  Запускаем WARP..."
if ! systemctl restart wg-quick@warp 2>/tmp/wg-warp.out; then
  log "  ⚠ systemctl restart не сработал, пробуем wg-quick up напрямую..."
  if ! wg-quick up warp 2>/tmp/wg-quick-up.out; then
    tail_log /tmp/wg-warp.out
    tail_log /tmp/wg-quick-up.out
    log "----- systemctl status wg-quick@warp -----"
    systemctl status wg-quick@warp --no-pager 2>/dev/null || true
    log "----- journalctl -u wg-quick@warp (last 80) -----"
    journalctl -u wg-quick@warp -n 80 --no-pager 2>/dev/null || true
    log "----- wg show -----"
    wg show 2>/dev/null || true
    die "не удалось поднять интерфейс WARP"
  fi
fi

sleep 2

# Verify WARP is working
log "  Проверяем WARP..."
if ! ip link show warp >/dev/null 2>&1; then
  log "  ⚠ Интерфейс warp не найден, проверяем через wg..."
  if ! wg show warp 2>/dev/null; then
    tail_log /tmp/wg-quick-up.out
    die "WARP интерфейс не активен"
  fi
fi

# Test external IP via WARP
sleep 2
log "  Проверяем внешний IP через WARP..."
WARP_IP=$(curl -4 -s --connect-timeout 15 ifconfig.me 2>/dev/null || curl -4 -s --connect-timeout 15 icanhazip.com 2>/dev/null || echo "не удалось проверить")
if [[ "$WARP_IP" == "не удалось проверить" || -z "$WARP_IP" ]]; then
  log "  ⚠ Не удалось проверить внешний IP через WARP (но интерфейс работает)"
else
  log "  ✅ WARP внешний IP: ${WARP_IP}"
fi

log "✅ WARP включён и работает"

step DONE
log "✅ Готово (WARP)"
exit 0

