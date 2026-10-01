#!/usr/bin/env bash
# One-shot installer for the network-wide ad blocker.
#
# Run on an always-on Linux machine connected to your home network
# (Raspberry Pi, old laptop, mini PC, NAS that runs Docker...):
#
#   git clone <this repo> ad-block && cd ad-block && ./scripts/install.sh
#
# It will: install Docker if needed, free up port 53, create .env with a
# random dashboard password, start Pi-hole, load the blocklists and verify
# that blocking works. Then it tells you the one router setting to change.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

say()  { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[x]\033[0m %s\n' "$*" >&2; exit 1; }

SUDO=""
if [[ $EUID -ne 0 ]]; then
  command -v sudo >/dev/null || die "Run as root or install sudo."
  SUDO="sudo"
fi

[[ "$(uname -s)" == "Linux" ]] || die "This installer supports Linux only. See README.md for other options."

# --- 1. Docker ---------------------------------------------------------------
if ! command -v docker >/dev/null; then
  say "Docker is not installed."
  read -r -p "Install Docker now using the official script from get.docker.com? [Y/n] " ans
  [[ "${ans:-Y}" =~ ^[Yy]$ ]] || die "Docker is required. Install it and re-run this script."
  curl -fsSL https://get.docker.com | $SUDO sh
  [[ -n "$SUDO" ]] && $SUDO usermod -aG docker "$USER" || true
fi

DOCKER="docker"
docker info >/dev/null 2>&1 || DOCKER="$SUDO docker"
$DOCKER compose version >/dev/null 2>&1 || die "Docker Compose v2 is required ('docker compose'). Update Docker and re-run."

# --- 2. Free port 53 (Ubuntu/Debian's systemd-resolved holds it) -------------
if command -v ss >/dev/null && $SUDO ss -lnup 2>/dev/null | grep -E ':53\s' | grep -q systemd-resolve; then
  say "systemd-resolved is using port 53; disabling its stub listener so Pi-hole can use it."
  $SUDO mkdir -p /etc/systemd/resolved.conf.d
  printf '[Resolve]\nDNSStubListener=no\n' | $SUDO tee /etc/systemd/resolved.conf.d/ad-block.conf >/dev/null
  $SUDO ln -sf /run/systemd/resolve/resolv.conf /etc/resolv.conf
  $SUDO systemctl restart systemd-resolved
fi
if command -v ss >/dev/null && $SUDO ss -lnup 2>/dev/null | grep -E ':53\s' | grep -vq pihole-FTL; then
  if ! $DOCKER ps --format '{{.Names}}' | grep -qx pihole; then
    warn "Something else is already listening on port 53:"
    $SUDO ss -lnup | grep -E ':53\s' || true
    die "Stop that service (e.g. dnsmasq, another Pi-hole/AdGuard) and re-run."
  fi
fi

# --- 3. Configuration --------------------------------------------------------
LAN_IP="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") {print $(i+1); exit}}' || true)"
[[ -n "$LAN_IP" ]] || LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
[[ -n "$LAN_IP" ]] || die "Could not detect this machine's LAN IP address. Is it connected to your network?"

if [[ ! -f .env ]]; then
  say "Creating .env"
  tz="$(timedatectl show -p Timezone --value 2>/dev/null || cat /etc/timezone 2>/dev/null || echo UTC)"
  pw="$(od -An -N15 -tx1 /dev/urandom | tr -d ' \n')"
  sed -e "s|^TZ=.*|TZ=${tz}|" -e "s|^WEB_PASSWORD=.*|WEB_PASSWORD=${pw}|" .env.example > .env
  chmod 600 .env
fi
# Read a value from .env without executing it as shell code.
envget() { sed -n "s/^$1=//p" .env | tail -n 1 | tr -d '"'\''\r'; }
WEB_PORT="$(envget WEB_PORT)"
WEB_PASSWORD="$(envget WEB_PASSWORD)"

mkdir -p data/pihole

# --- 4. Start Pi-hole ----------------------------------------------------------
say "Starting Pi-hole"
$DOCKER compose pull
$DOCKER compose up -d

say "Waiting for Pi-hole to become ready"
for _ in $(seq 1 60); do
  status="$($DOCKER inspect -f '{{.State.Health.Status}}' pihole 2>/dev/null || true)"
  [[ "$status" == "healthy" ]] && break
  sleep 3
done
[[ "${status:-}" == "healthy" ]] || die "Pi-hole did not start. Check: $DOCKER logs pihole"

# --- 5. Blocklists -------------------------------------------------------------
say "Loading blocklists"
if [[ "$DOCKER" == "docker" ]]; then
  ./scripts/apply-lists.sh
else
  $SUDO ./scripts/apply-lists.sh
fi

# --- 6. Verify -------------------------------------------------------------------
say "Testing"
if [[ "$DOCKER" == "docker" ]]; then
  ./scripts/test-blocking.sh "$LAN_IP" || true
else
  $SUDO ./scripts/test-blocking.sh "$LAN_IP" || true
fi

cat <<EOF

$(printf '\033[1;32m')Ad blocker is running on ${LAN_IP}$(printf '\033[0m')

Dashboard:  http://${LAN_IP}:${WEB_PORT:-8080}/admin
Password:   ${WEB_PASSWORD}   (stored in .env)

ONE STEP LEFT — point your network at it:

  1. Give this machine a fixed address: in your router, create a
     "DHCP reservation" / "static lease" for ${LAN_IP}.
  2. In your router's DHCP / LAN settings, set the DNS server to:
         Primary DNS:   ${LAN_IP}
         Secondary DNS: (leave empty — a public DNS here lets ads through)
  3. Reconnect your devices to Wi-Fi (or reboot them) so they pick it up.

Step-by-step guides for common routers:  docs/ROUTER-SETUP.md
Stop devices that bypass the blocker:    docs/STOP-BYPASS.md
EOF
