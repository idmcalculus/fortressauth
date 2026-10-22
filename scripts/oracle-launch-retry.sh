#!/usr/bin/env bash
# scripts/oracle-launch-retry.sh
#
# Retries `pulumi up` for the Oracle Cloud stack until the A1 VM launches.
# Oracle often has no free A1 capacity and answers "Out of host capacity";
# slots open up at random, so this tries every availability domain in turn,
# waits, and repeats until one launch succeeds or time runs out.
#
# Usage:
#   scripts/oracle-launch-retry.sh [--interval MINUTES] [--hours HOURS] [--domains N]
#
# Options:
#   --interval MINUTES  Wait between rounds. Default: 10.
#   --hours HOURS       Give up after this long. Default: 24.
#   --domains N         Availability domains to cycle through. Default: 3.
#
# Env overrides:
#   PULUMI_STACK  Defaults to "idmcalculus/fortressauth-oracle/prod".
#
# Only "Out of host capacity", rate limiting, a busy stack and network
# failures (a dropped connection, a failed DNS lookup, a timeout or a 502/503
# from Oracle or Pulumi Cloud) are retried. Any other failure stops the
# script, so a real problem is not repeated for a day. Each try sets fortressauth-oracle:availabilityDomainIndex, so the
# stack config ends on the domain that worked. Every try also shows up as an
# update in the stack's Pulumi Cloud history.

set -euo pipefail

usage() {
  cat >&2 <<EOF
Usage: $0 [--interval MINUTES] [--hours HOURS] [--domains N]

Example:
  $0 --interval 10 --hours 24
EOF
  exit 1
}

INTERVAL_MINUTES=10
HOURS=24
DOMAINS=3

while [ $# -gt 0 ]; do
  case "$1" in
    --interval | --hours | --domains)
      if [ $# -lt 2 ] || [[ ! "$2" =~ ^[1-9][0-9]*$ ]]; then
        echo "$1 needs a positive whole number." >&2
        exit 1
      fi
      case "$1" in
        --interval) INTERVAL_MINUTES="$2" ;;
        --hours) HOURS="$2" ;;
        --domains) DOMAINS="$2" ;;
      esac
      shift 2
      ;;
    *)
      usage
      ;;
  esac
done

PULUMI_STACK="${PULUMI_STACK:-idmcalculus/fortressauth-oracle/prod}"
STACK_DIR="$(cd "$(dirname "$0")/../packages/infra-oracle" && pwd)"
export PULUMI_SKIP_UPDATE_CHECK=1

CAPACITY_ERRORS='Out of host capacity|TooManyRequests|429-|Another update is currently in progress|\[409\] Conflict'
NETWORK_ERRORS='no such host|dial tcp|i/o timeout|connection reset by peer|connection refused|network is unreachable|TLS handshake timeout|context deadline exceeded|unexpected EOF|Bad Gateway|Service Unavailable|Gateway Timeout'
RETRYABLE="${CAPACITY_ERRORS}|${NETWORK_ERRORS}"

log() {
  printf '[oracle-launch-retry %s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >&2
}

if ! command -v pulumi >/dev/null 2>&1; then
  echo "Missing required command: pulumi" >&2
  exit 1
fi

cd "${STACK_DIR}"
attempt_log="$(mktemp)"
trap 'rm -f "${attempt_log}"' EXIT

deadline=$(($(date +%s) + HOURS * 3600))
attempt=0
log "Stack ${PULUMI_STACK}: trying ${DOMAINS} domain(s) every ${INTERVAL_MINUTES} min for up to ${HOURS} h."

while :; do
  for ((index = 0; index < DOMAINS; index++)); do
    attempt=$((attempt + 1))
    pulumi config set --stack "${PULUMI_STACK}" \
      fortressauth-oracle:availabilityDomainIndex "${index}"

    if pulumi up --yes --stack "${PULUMI_STACK}" --non-interactive >"${attempt_log}" 2>&1; then
      log "Attempt ${attempt}: launched in availability domain $((index + 1))."
      pulumi stack output --stack "${PULUMI_STACK}" instancePublicIp |
        sed 's/^/Public IP: /'
      exit 0
    fi

    if grep -qE "${RETRYABLE}" "${attempt_log}"; then
      reason="$(grep -oE "${RETRYABLE}" "${attempt_log}" | head -n 1)"
      log "Attempt ${attempt}: domain $((index + 1)): ${reason}."
      continue
    fi

    log "Attempt ${attempt}: domain $((index + 1)) failed for a reason that retrying will not fix:"
    grep -vE '^\s*$' "${attempt_log}" | tail -n 25 >&2
    exit 1
  done

  if [ "$(date +%s)" -ge "${deadline}" ]; then
    log "Gave up after ${HOURS} h and ${attempt} attempt(s). Run this script again to keep trying."
    exit 2
  fi
  sleep "$((INTERVAL_MINUTES * 60))"
done
