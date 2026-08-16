#!/bin/sh
set -e

# Anonymous usage telemetry for the imbios/bun-node image.
# Sends one tiny ping per container start to https://bun-node.imbios.dev/telemetry/ping
# with bun version, node version, architecture and a random id. The endpoint
# sees the container's source IP; nothing else is sent (no hostnames, commands
# or user data). The random id is retained in KV for up to one hour to dedupe
# repeated pings. Fails silently and never blocks startup.
# Opt out by setting BUN_NODE_TELEMETRY=0 (or DO_NOT_TRACK=1).
if [ "${BUN_NODE_TELEMETRY:-1}" != "0" ] && [ "${DO_NOT_TRACK:-0}" != "1" ]; then
  (
    BUN_VERSION_TELEMETRY=$(bun --version 2>/dev/null || echo unknown)
    NODE_VERSION_TELEMETRY=$(node --version 2>/dev/null || echo unknown)
    ARCH_TELEMETRY=$(uname -m 2>/dev/null || echo unknown)
    ID_TELEMETRY=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "$$-$(date +%s)")
    DAY_TELEMETRY=$(date -u +%F 2>/dev/null || date +%F)
    PAYLOAD_TELEMETRY="{\"v\":1,\"id\":\"$ID_TELEMETRY\",\"bun\":\"$BUN_VERSION_TELEMETRY\",\"node\":\"$NODE_VERSION_TELEMETRY\",\"arch\":\"$ARCH_TELEMETRY\",\"d\":\"$DAY_TELEMETRY\"}"
    curl -fsS -m 3 --proto '=https' --proto-redir '=https' -X POST -H "Content-Type: application/json" -d "$PAYLOAD_TELEMETRY" \
      https://bun-node.imbios.dev/telemetry/ping >/dev/null 2>&1
  ) &
fi

if [ "${1#-}" != "${1}" ] || [ -z "$(command -v "${1}")" ] || { [ -f "${1}" ] && ! [ -x "${1}" ]; }; then
  set -- /usr/local/bin/bun "$@"
fi

exec "$@"
