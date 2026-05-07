#!/bin/bash
# WARP killswitch (no-leak) for server egress.
# Mode:
#   apply  - block OUTPUT that does not go via WARP interface, except Cloudflare WARP endpoint
#   remove - remove killswitch rules
#
# This uses iptables/ip6tables (works on Ubuntu/Debian; may require iptables-nft backend).
#
# Notes:
# - Allows loopback and established connections.
# - Allows traffic to RFC1918/local ranges.
# - Allows UDP to WARP Endpoint (from /etc/wireguard/warp.conf) via main WAN interface so tunnel can come up.
#
# Usage:
#   bash warp_killswitch.sh apply
#   bash warp_killswitch.sh remove

set -uo pipefail

ACTION="${1:-}"
WARP_CONF="/etc/wireguard/warp.conf"
CHAIN="WARP_KILLSWITCH"

log() { echo "$1"; }

need_root() {
  if [[ "${EUID:-$(id -u)}" != "0" ]]; then
    log "ОШИБКА: запустите от root"
    exit 1
  fi
}

detect_wan_if() {
  local iface
  iface=$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="dev") {print $(i+1); exit}}')
  if [[ -z "$iface" ]]; then
    # Fallback: get first non-loopback interface
    iface=$(ip link show 2>/dev/null | grep -E '^[0-9]+:' | grep -v 'lo:' | head -1 | awk -F: '{print $2}' | tr -d ' ')
  fi
  echo "$iface"
}

read_endpoint() {
  # Returns: "<ip> <port>" or empty
  [[ -f "$WARP_CONF" ]] || return 0
  local ep
  ep="$(grep -m1 -E '^\s*Endpoint\s*=' "$WARP_CONF" 2>/dev/null | awk -F'=' '{print $2}' | xargs || true)"
  [[ -n "$ep" ]] || return 0
  # ep like: 162.159.193.10:2408
  local host port
  host="${ep%:*}"
  port="${ep##*:}"
  host="${host#[}"
  host="${host%]}"
  if [[ "$host" =~ ^[0-9a-fA-F:.]+$ ]] && [[ "$port" =~ ^[0-9]{1,5}$ ]]; then
    echo "$host $port"
  fi
}

iptables_has_chain() {
  iptables -w -S "$CHAIN" >/dev/null 2>&1
}

ip6tables_has_chain() {
  ip6tables -w -S "$CHAIN" >/dev/null 2>&1
}

ensure_chain() {
  if ! iptables_has_chain; then
    iptables -w -N "$CHAIN" 2>/dev/null || iptables -w -F "$CHAIN" 2>/dev/null || true
  fi
  if ! iptables -w -C OUTPUT -j "$CHAIN" >/dev/null 2>&1; then
    iptables -w -I OUTPUT 1 -j "$CHAIN" 2>/dev/null || true
  fi
}

ensure_chain6() {
  if command -v ip6tables >/dev/null 2>&1; then
    if ! ip6tables_has_chain; then
      ip6tables -w -N "$CHAIN" 2>/dev/null || ip6tables -w -F "$CHAIN" 2>/dev/null || true
    fi
    if ! ip6tables -w -C OUTPUT -j "$CHAIN" >/dev/null 2>&1; then
      ip6tables -w -I OUTPUT 1 -j "$CHAIN" 2>/dev/null || true
    fi
  fi
}

flush_chain() {
  if iptables_has_chain; then
    iptables -w -F "$CHAIN" 2>/dev/null || true
  fi
}

flush_chain6() {
  if command -v ip6tables >/dev/null 2>&1 && ip6tables_has_chain; then
    ip6tables -w -F "$CHAIN" 2>/dev/null || true
  fi
}

remove_chain() {
  if iptables_has_chain; then
    iptables -w -D OUTPUT -j "$CHAIN" 2>/dev/null || true
    iptables -w -F "$CHAIN" 2>/dev/null || true
    iptables -w -X "$CHAIN" 2>/dev/null || true
  fi
}

remove_chain6() {
  if command -v ip6tables >/dev/null 2>&1 && ip6tables_has_chain; then
    ip6tables -w -D OUTPUT -j "$CHAIN" 2>/dev/null || true
    ip6tables -w -F "$CHAIN" 2>/dev/null || true
    ip6tables -w -X "$CHAIN" 2>/dev/null || true
  fi
}

apply_rules() {
  local wan_if endpoint_ip endpoint_port
  wan_if="$(detect_wan_if)"
  read -r endpoint_ip endpoint_port < <(read_endpoint || true)

  # Check if WARP interface exists
  if ! ip link show warp >/dev/null 2>&1; then
    log "⚠ Интерфейс WARP не найден. Сначала запустите WARP: wg-quick up warp"
    exit 1
  fi

  ensure_chain
  ensure_chain6
  flush_chain
  flush_chain6

  # IPv4 base allows
  iptables -w -A "$CHAIN" -o lo -j RETURN 2>/dev/null || true
  iptables -w -A "$CHAIN" -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN 2>/dev/null || true
  iptables -w -A "$CHAIN" -d 127.0.0.0/8 -j RETURN 2>/dev/null || true
  iptables -w -A "$CHAIN" -d 10.0.0.0/8 -j RETURN 2>/dev/null || true
  iptables -w -A "$CHAIN" -d 172.16.0.0/12 -j RETURN 2>/dev/null || true
  iptables -w -A "$CHAIN" -d 192.168.0.0/16 -j RETURN 2>/dev/null || true
  iptables -w -A "$CHAIN" -d 169.254.0.0/16 -j RETURN 2>/dev/null || true

  # Allow WARP handshake to endpoint over WAN (so tunnel can come up)
  if [[ -n "${endpoint_ip:-}" && -n "${endpoint_port:-}" && -n "${wan_if:-}" ]]; then
    if [[ "$endpoint_ip" == *:* ]]; then
      # IPv6 endpoint - handled in IPv6 section
      :
    else
      iptables -w -A "$CHAIN" -o "$wan_if" -p udp -d "$endpoint_ip" --dport "$endpoint_port" -j RETURN 2>/dev/null || true
    fi
  fi

  # Allow anything that is routed via WARP interface
  iptables -w -A "$CHAIN" -o warp -j RETURN 2>/dev/null || true

  # Default: block (no leak)
  iptables -w -A "$CHAIN" -j REJECT --reject-with icmp-admin-prohibited 2>/dev/null || true

  # IPv6 (best-effort)
  if command -v ip6tables >/dev/null 2>&1; then
    ip6tables -w -A "$CHAIN" -o lo -j RETURN 2>/dev/null || true
    ip6tables -w -A "$CHAIN" -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN 2>/dev/null || true
    ip6tables -w -A "$CHAIN" -d ::1/128 -j RETURN 2>/dev/null || true
    ip6tables -w -A "$CHAIN" -d fc00::/7 -j RETURN 2>/dev/null || true
    ip6tables -w -A "$CHAIN" -d fe80::/10 -j RETURN 2>/dev/null || true

    if [[ -n "${endpoint_ip:-}" && -n "${endpoint_port:-}" && -n "${wan_if:-}" ]]; then
      if [[ "$endpoint_ip" == *:* ]]; then
        ip6tables -w -A "$CHAIN" -o "$wan_if" -p udp -d "$endpoint_ip" --dport "$endpoint_port" -j RETURN 2>/dev/null || true
      fi
    fi

    ip6tables -w -A "$CHAIN" -o warp -j RETURN 2>/dev/null || true
    ip6tables -w -A "$CHAIN" -j REJECT --reject-with icmp6-adm-prohibited 2>/dev/null || true
  fi

  log "✅ Killswitch применён (OUTPUT через WARP-only)"
}

case "$ACTION" in
  apply)
    need_root
    apply_rules
    ;;
  remove)
    need_root
    remove_chain
    remove_chain6
    log "✅ Killswitch удалён"
    ;;
  *)
    echo "Usage: $0 apply|remove"
    exit 2
    ;;
esac

