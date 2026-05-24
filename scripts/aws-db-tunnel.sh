#!/usr/bin/env bash
# scripts/aws-db-tunnel.sh
#
# Opens an SSM port-forwarding session from your laptop to a private RDS
# instance, using a running Fargate task in the same VPC as the SSM target.
# Works with any Postgres client (TablePlus, DBeaver, psql, pgAdmin) — they
# connect to localhost:<localPort> while the tunnel is open.
#
# Usage:
#   scripts/aws-db-tunnel.sh <env>            Open a tunnel only.
#   scripts/aws-db-tunnel.sh <env> --psql     Open a tunnel and connect via psql.
#   scripts/aws-db-tunnel.sh <env> --print    Print connection details only.
#
# Args:
#   <env>    Stack name to target. dev | prod | staging | etc.
#
# Env overrides:
#   AWS_PROFILE       Defaults to "fortressauth-<env>".
#   AWS_REGION        Defaults to "eu-west-1".
#   LOCAL_PORT        Defaults to 15432.
#   CLUSTER           Defaults to "fortressauth-<env>-cluster".
#   DB_INSTANCE_ID    Defaults to "fortressauth-<env>-db".
#   DB_PASSWORD_ARN   Defaults to "fortressauth-<env>/db/password".
#   DB_NAME           Defaults to "fortressauth".
#   DB_USER           Defaults to "fortressauth".
#
# Requirements:
#   - aws CLI v2 (with sso login current for the profile)
#   - jq
#   - session-manager-plugin (brew install --cask session-manager-plugin)
#   - psql, only if --psql is passed
#
# Notes:
#   - The script picks the first running ECS task in the service cluster.
#   - It does not start a task; if the service has desiredCount=0, run
#     `pulumi config set fortressauth-aws:desiredCount 1 --stack ...` and
#     `pulumi up` first.
#   - SSM session usage is logged in CloudTrail. The tunnel is encrypted
#     end-to-end; no inbound RDS exposure is required.
#   - Forward the same DB_HOST you would use from inside the task. RDS
#     accepts TLS only; clients must connect with sslmode=require.

set -euo pipefail

usage() {
  cat >&2 <<EOF
Usage: $0 <env> [--psql | --print]

Examples:
  $0 dev
  $0 dev --psql
  $0 prod --print
EOF
  exit 1
}

if [ $# -lt 1 ]; then
  usage
fi

ENV="$1"
MODE="tunnel"
case "${2:-}" in
  --psql) MODE="psql" ;;
  --print) MODE="print" ;;
  '') MODE="tunnel" ;;
  *) usage ;;
esac

if [[ ! "${ENV}" =~ ^[a-z][a-z0-9-]{0,30}$ ]]; then
  echo "Invalid env: ${ENV}" >&2
  exit 1
fi

NAME_PREFIX="fortressauth-${ENV}"
AWS_PROFILE="${AWS_PROFILE:-${NAME_PREFIX}}"
AWS_REGION="${AWS_REGION:-eu-west-1}"
LOCAL_PORT="${LOCAL_PORT:-15432}"
CLUSTER="${CLUSTER:-${NAME_PREFIX}-cluster}"
DB_INSTANCE_ID="${DB_INSTANCE_ID:-${NAME_PREFIX}-db}"
DB_PASSWORD_ARN="${DB_PASSWORD_ARN:-${NAME_PREFIX}/db/password}"
DB_NAME="${DB_NAME:-fortressauth}"
DB_USER="${DB_USER:-fortressauth}"

export AWS_PROFILE
export AWS_REGION

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    case "$1" in
      session-manager-plugin)
        cat >&2 <<EOF
Missing required command: session-manager-plugin

Install via Homebrew:
  brew install --cask session-manager-plugin

If brew installs the binary at /usr/local/sessionmanagerplugin/bin but it is
not on PATH, symlink it once:
  sudo ln -sf /usr/local/sessionmanagerplugin/bin/session-manager-plugin /usr/local/bin/session-manager-plugin

Or download directly from AWS:
  https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html

Then verify:
  session-manager-plugin --version
EOF
        ;;
      jq)
        echo "Missing required command: jq" >&2
        echo "Install with: brew install jq" >&2
        ;;
      psql)
        echo "Missing required command: psql" >&2
        echo "Install with: brew install libpq && brew link --force libpq" >&2
        ;;
      aws)
        echo "Missing required command: aws" >&2
        echo "Install with: brew install awscli" >&2
        ;;
      *)
        echo "Missing required command: $1" >&2
        ;;
    esac
    exit 1
  fi
}

require_cmd aws
require_cmd jq
require_cmd session-manager-plugin

log() {
  printf '[aws-db-tunnel] %s\n' "$*" >&2
}

log "Profile : ${AWS_PROFILE}"
log "Region  : ${AWS_REGION}"
log "Env     : ${ENV}"
log "Cluster : ${CLUSTER}"
log "DB id   : ${DB_INSTANCE_ID}"
log "Mode    : ${MODE}"
log "Local   : 127.0.0.1:${LOCAL_PORT}"

log "Verifying caller identity..."
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text 2>/dev/null || true)"
if [ -z "${ACCOUNT_ID}" ] || [ "${ACCOUNT_ID}" = "None" ]; then
  cat >&2 <<EOF
Could not get AWS caller identity. Likely an SSO session expired.

Try:
  aws sso login --profile ${AWS_PROFILE}
EOF
  exit 1
fi
log "Account : ${ACCOUNT_ID}"

log "Locating running ECS task in cluster ${CLUSTER}..."
TASK_ARN="$(aws ecs list-tasks \
  --cluster "${CLUSTER}" \
  --desired-status RUNNING \
  --query 'taskArns[0]' \
  --output text 2>/dev/null || true)"

if [ -z "${TASK_ARN}" ] || [ "${TASK_ARN}" = "None" ]; then
  cat >&2 <<EOF
No running ECS tasks in cluster ${CLUSTER}.

Reasons this can happen:
  - The service has desiredCount=0. Bring tasks up first:
      pulumi config set fortressauth-aws:desiredCount 1 --stack idmcalculus/fortressauth-aws/${ENV}
      pulumi up --stack idmcalculus/fortressauth-aws/${ENV}
  - Tasks are still starting. Re-run after a minute.
  - The cluster name is wrong. Override via the CLUSTER env var.
EOF
  exit 1
fi
log "Task ARN: ${TASK_ARN}"

TASK_DETAILS_JSON="$(aws ecs describe-tasks \
  --cluster "${CLUSTER}" \
  --tasks "${TASK_ARN}" \
  --output json)"
TASK_ID="${TASK_ARN##*/}"
RUNTIME_ID="$(echo "${TASK_DETAILS_JSON}" | jq -r '.tasks[0].containers[0].runtimeId')"
ENABLE_EXEC="$(echo "${TASK_DETAILS_JSON}" | jq -r '.tasks[0].enableExecuteCommand')"

if [ "${ENABLE_EXEC}" != "true" ]; then
  cat >&2 <<EOF
Task ${TASK_ID} does not have ECS Exec enabled (enableExecuteCommand=${ENABLE_EXEC}).

The Pulumi stack should set enableExecuteCommand=true on the FargateService.
If you have just changed it, force a new deployment so the running task picks
up the change:
  aws ecs update-service --cluster ${CLUSTER} --service <service-name> --force-new-deployment --region ${AWS_REGION}
EOF
  exit 1
fi

if [ -z "${RUNTIME_ID}" ] || [ "${RUNTIME_ID}" = "null" ]; then
  echo "Could not resolve runtimeId for task ${TASK_ID}." >&2
  exit 1
fi

SSM_TARGET="ecs:${CLUSTER}_${TASK_ID}_${RUNTIME_ID}"
log "SSM     : ${SSM_TARGET}"

log "Resolving RDS endpoint for ${DB_INSTANCE_ID}..."
DB_HOST="$(aws rds describe-db-instances \
  --db-instance-identifier "${DB_INSTANCE_ID}" \
  --query 'DBInstances[0].Endpoint.Address' \
  --output text 2>/dev/null || true)"

if [ -z "${DB_HOST}" ] || [ "${DB_HOST}" = "None" ]; then
  echo "Could not resolve RDS endpoint for ${DB_INSTANCE_ID}." >&2
  exit 1
fi
log "DB host : ${DB_HOST}"

log "Fetching DB password from Secrets Manager..."
DB_PASSWORD="$(aws secretsmanager get-secret-value \
  --secret-id "${DB_PASSWORD_ARN}" \
  --query SecretString \
  --output text 2>/dev/null || true)"

if [ -z "${DB_PASSWORD}" ]; then
  echo "Could not retrieve DB password from secret ${DB_PASSWORD_ARN}." >&2
  exit 1
fi

print_connection_details() {
  cat <<EOF

----------------------------------------------------------------------
TablePlus / DBeaver / pgAdmin / Postico connection settings

  Host        : 127.0.0.1
  Port        : ${LOCAL_PORT}
  Database    : ${DB_NAME}
  User        : ${DB_USER}
  Password    : ${DB_PASSWORD}
  SSL Mode    : require

psql connection string (paste in another terminal):

  PGPASSWORD='${DB_PASSWORD//\'/\\\'}' psql \\
    -h 127.0.0.1 -p ${LOCAL_PORT} \\
    -U ${DB_USER} -d ${DB_NAME} \\
    --set=sslmode=require

The tunnel below stays open while this terminal is alive. Close with Ctrl-C.
----------------------------------------------------------------------

EOF
}

if [ "${MODE}" = "print" ]; then
  print_connection_details
  exit 0
fi

if [ "${MODE}" = "psql" ]; then
  require_cmd psql
fi

log "Opening SSM port-forwarding session..."

if [ "${MODE}" = "tunnel" ] || [ "${MODE}" = "psql" ]; then
  print_connection_details
fi

if [ "${MODE}" = "psql" ]; then
  # Run the tunnel in the background, wait for it to come up, then exec psql
  # in the foreground.
  TUNNEL_LOG="$(mktemp)"
  trap 'kill ${TUNNEL_PID:-} 2>/dev/null || true; rm -f "${TUNNEL_LOG}"' EXIT INT TERM

  aws ssm start-session \
    --target "${SSM_TARGET}" \
    --document-name AWS-StartPortForwardingSessionToRemoteHost \
    --parameters "host=${DB_HOST},portNumber=5432,localPortNumber=${LOCAL_PORT}" \
    >"${TUNNEL_LOG}" 2>&1 &
  TUNNEL_PID=$!

  log "Waiting for tunnel on 127.0.0.1:${LOCAL_PORT}..."
  for _ in $(seq 1 30); do
    if grep -q "Waiting for connections" "${TUNNEL_LOG}" 2>/dev/null; then
      break
    fi
    sleep 1
  done

  if ! grep -q "Waiting for connections" "${TUNNEL_LOG}" 2>/dev/null; then
    echo "Tunnel did not come up in time. Last output:" >&2
    cat "${TUNNEL_LOG}" >&2 || true
    exit 1
  fi

  log "Tunnel ready. Launching psql..."
  PGPASSWORD="${DB_PASSWORD}" psql \
    -h 127.0.0.1 -p "${LOCAL_PORT}" \
    -U "${DB_USER}" -d "${DB_NAME}" \
    --set=sslmode=require
  exit 0
fi

# Default: foreground tunnel, leave running until Ctrl-C
exec aws ssm start-session \
  --target "${SSM_TARGET}" \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters "host=${DB_HOST},portNumber=5432,localPortNumber=${LOCAL_PORT}"
