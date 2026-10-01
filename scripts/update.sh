#!/usr/bin/env bash
# Update Pi-hole to the latest version and refresh all blocklists.
# (Pi-hole also refreshes blocklists by itself once a week.)

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

COMPOSE_FILE="docker-compose.yml"
if docker inspect -f '{{.HostConfig.NetworkMode}}' pihole 2>/dev/null | grep -qx host; then
  COMPOSE_FILE="docker-compose.dhcp.yml"
fi

docker compose -f "$COMPOSE_FILE" pull
docker compose -f "$COMPOSE_FILE" up -d
for _ in $(seq 1 60); do
  [[ "$(docker inspect -f '{{.State.Health.Status}}' pihole 2>/dev/null)" == "healthy" ]] && break
  sleep 3
done
./scripts/apply-lists.sh "$@"
docker image prune -f >/dev/null
