#!/usr/bin/env bash
# Load the blocklists, allowlist and denylist from ./blocklists into Pi-hole
# and rebuild its block database ("gravity").
#
# Usage: ./scripts/apply-lists.sh [standard|aggressive]
#   Profile defaults to BLOCK_PROFILE in .env, then "standard".
#
# Safe to re-run any time you edit files in ./blocklists. Lists that this
# script added earlier but that are no longer in the chosen profile are
# removed; lists you added yourself in the dashboard are left alone.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LISTS="$ROOT/blocklists"
CONTAINER="${PIHOLE_CONTAINER:-pihole}"
TAG="managed-by:ad-block"

env_profile="$(sed -n 's/^BLOCK_PROFILE=//p' "$ROOT/.env" 2>/dev/null | tail -n 1 | tr -d '"'\''[:space:]')"
PROFILE="${1:-${env_profile:-standard}}"

case "$PROFILE" in
  standard)   files=("$LISTS/standard.txt") ;;
  aggressive) files=("$LISTS/standard.txt" "$LISTS/aggressive.txt") ;;
  *) echo "Unknown profile '$PROFILE' (use: standard | aggressive)" >&2; exit 1 ;;
esac

# Print non-empty, non-comment lines of the given files, de-duplicated.
entries() { sed -e 's/#.*//' -e 's/[[:space:]]//g' "$@" | awk 'NF && !seen[$0]++'; }

if ! docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true; then
  echo "Pi-hole container '$CONTAINER' is not running. Start it with: docker compose up -d" >&2
  exit 1
fi

mapfile -t urls < <(entries "${files[@]}")
mapfile -t allow < <(entries "$LISTS/allowlist.txt")
mapfile -t deny < <(entries "$LISTS/denylist.txt")

sql="BEGIN;"
in_list=""
for url in "${urls[@]}"; do
  if [[ ! "$url" =~ ^https?://[^\'\"[:space:]]+$ ]]; then
    echo "Skipping invalid list URL: $url" >&2
    continue
  fi
  sql+="INSERT INTO adlist (address, enabled, comment, type) VALUES ('$url', 1, '$TAG', 0)
        ON CONFLICT(address, type) DO UPDATE SET enabled = 1, comment = '$TAG';"
  in_list+="${in_list:+,}'$url'"
done
stale="SELECT id FROM adlist WHERE comment = '$TAG' AND type = 0 AND address NOT IN (${in_list:-''})"
sql+="DELETE FROM gravity WHERE adlist_id IN ($stale);"
sql+="DELETE FROM antigravity WHERE adlist_id IN ($stale);"
sql+="DELETE FROM adlist WHERE id IN ($stale);"
# Allow/deny entries are re-added below, so removing a line from
# allowlist.txt / denylist.txt removes it from Pi-hole too.
sql+="DELETE FROM domainlist WHERE comment = '$TAG';"
sql+="COMMIT;"

echo "==> Profile: $PROFILE (${#urls[@]} blocklists)"
docker exec "$CONTAINER" pihole-FTL sqlite3 /etc/pihole/gravity.db "$sql"

if ((${#allow[@]})); then
  echo "==> Allowlisting ${#allow[@]} domains"
  docker exec "$CONTAINER" pihole allow -q --comment "$TAG" "${allow[@]}" >/dev/null
fi
if ((${#deny[@]})); then
  echo "==> Denylisting ${#deny[@]} domains (including subdomains)"
  docker exec "$CONTAINER" pihole --wild -q --comment "$TAG" "${deny[@]}" >/dev/null
fi

echo "==> Downloading lists and rebuilding the block database (can take a few minutes)..."
docker exec "$CONTAINER" pihole -g

# Pi-hole reloads the new database a moment after gravity finishes; wait for it.
for _ in $(seq 1 20); do
  [[ "$(docker exec "$CONTAINER" dig +short +time=1 +tries=1 doubleclick.net @127.0.0.1 2>/dev/null)" == "0.0.0.0" ]] && break
  sleep 1
done

total="$(docker exec "$CONTAINER" pihole-FTL sqlite3 /etc/pihole/gravity.db \
  "SELECT COUNT(DISTINCT domain) FROM gravity;" 2>/dev/null || echo '?')"
if [[ "$total" == "0" ]]; then
  echo "[!] No blocklists could be downloaded. Check this machine's internet access, then re-run ./scripts/apply-lists.sh" >&2
  exit 1
fi
echo "==> Done. $total unique domains are now blocked for every device using this DNS server."
