#!/usr/bin/env bash
# Check that the ad blocker is answering DNS and blocking ad domains.
#
# Usage: ./scripts/test-blocking.sh [dns-server-ip]
#   Defaults to querying Pi-hole from inside its container. Pass this
#   machine's LAN IP to test the path your other devices will use.

set -uo pipefail

SERVER="${1:-}"
CONTAINER="${PIHOLE_CONTAINER:-pihole}"

ad_domains=(doubleclick.net googleadservices.com ads.youtube.com adservice.google.com
            pagead2.googlesyndication.com ads.facebook.com analytics.tiktok.com
            samsungads.com ads.roku.com device-metrics-us.amazon.com)
ok_domains=(google.com wikipedia.org apple.com)

lookup() {
  if [[ -n "$SERVER" ]] && command -v dig >/dev/null; then
    dig +short +time=3 +tries=2 A "$1" @"$SERVER" | tail -n 1
  elif [[ -n "$SERVER" ]] && command -v nslookup >/dev/null; then
    nslookup "$1" "$SERVER" 2>/dev/null | awk '/^Address/ {a=$NF} END {print a}'
  else
    # No dig/nslookup on this machine: use the one bundled in the container.
    docker exec "$CONTAINER" dig +short +time=3 +tries=2 A "$1" @"${SERVER:-127.0.0.1}" | tail -n 1
  fi
}

fail=0
echo "Querying ${SERVER:-Pi-hole inside container \"$CONTAINER\"}"
for d in "${ad_domains[@]}"; do
  r="$(lookup "$d")"
  if [[ "$r" == "0.0.0.0" || -z "$r" ]]; then
    printf '  \033[32mBLOCKED\033[0m  %s\n' "$d"
  else
    printf '  \033[31mALLOWED\033[0m  %s -> %s\n' "$d" "$r"; fail=1
  fi
done
for d in "${ok_domains[@]}"; do
  r="$(lookup "$d")"
  if [[ -n "$r" && "$r" != "0.0.0.0" ]]; then
    printf '  \033[32mRESOLVES\033[0m %s -> %s\n' "$d" "$r"
  else
    printf '  \033[31mBROKEN\033[0m   %s (normal sites should resolve!)\n' "$d"; fail=1
  fi
done

if ((fail)); then
  echo "Some checks failed. See README.md > Troubleshooting." >&2
  exit 1
fi
echo "All good: ads are blocked and normal sites work."
