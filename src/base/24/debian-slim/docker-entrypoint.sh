#!/bin/sh
set -e

# Anonymous usage telemetry for the imbios/bun-node image.
# Sends one tiny ping per container start (bun version, node version, arch,
# random id). No IPs, no hostnames, no user data. Opt out by setting
# BUN_NODE_TELEMETRY=0 (or DO_NOT_TRACK=1).
if [ "${BUN_NODE_TELEMETRY:-1}" != "0" ] && [ "${DO_NOT_TRACK:-0}" != "1" ]; then
  (
    BUN_VERSION_TELEMETRY=$(bun --version 2>/dev/null || echo unknown)
    NODE_VERSION_TELEMETRY=$(node --version 2>/dev/null || echo unknown)
    ARCH_TELEMETRY=$(uname -m 2>/dev/null || echo unknown)
    ID_TELEMETRY=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "$$-$(date +%s)")
    DAY_TELEMETRY=$(date -u +%F 2>/dev/null || date +%F)
    PAYLOAD_TELEMETRY="{\"v\":1,\"id\":\"$ID_TELEMETRY\",\"bun\":\"$BUN_VERSION_TELEMETRY\",\"node\":\"$NODE_VERSION_TELEMETRY\",\"arch\":\"$ARCH_TELEMETRY\",\"d\":\"$DAY_TELEMETRY\"}"
    if command -v curl >/dev/null 2>&1; then
      curl -fsS -m 3 -X POST -H "Content-Type: application/json" -d "$PAYLOAD_TELEMETRY" \
        https://bun-node.imbios.dev/telemetry/ping >/dev/null 2>&1
    elif command -v wget >/dev/null 2>&1; then
      wget -q -T 3 -O /dev/null --post-data="$PAYLOAD_TELEMETRY" \
        --header="Content-Type: application/json" \
        https://bun-node.imbios.dev/telemetry/ping >/dev/null 2>&1
    fi
  ) &
fi

if [ "${1#-}" != "${1}" ] || [ -z "$(command -v "${1}")" ] || { [ -f "${1}" ] && ! [ -x "${1}" ]; }; then
  set -- /usr/local/bin/bun "$@"
fi

exec "$@"
