#!/usr/bin/env bash
# scripts/aws-ecs-shell.sh
#
# Opens an interactive shell inside a running FortressAuth Fargate task via
# ECS Exec (Session Manager under the hood). Useful for ad-hoc operations:
# verifying env vars, checking the file system, hand-running one-off node
# scripts, debugging connectivity to RDS/SES, etc.
#
# Usage:
#   scripts/aws-ecs-shell.sh <env>                    Open /bin/sh as default.
#   scripts/aws-ecs-shell.sh <env> --command "<cmd>"  Run a one-shot command.
#   scripts/aws-ecs-shell.sh <env> --task <task-id>   Target a specific task.
#
# Args:
#   <env>    Stack name. dev | prod | staging | etc.
#
# Env overrides:
#   AWS_PROFILE  Defaults to "fortressauth-<env>".
#   AWS_REGION   Defaults to "eu-west-1".
#   CLUSTER      Defaults to "fortressauth-<env>-cluster".
#   CONTAINER    Defaults to "app".

set -euo pipefail

usage() {
  cat >&2 <<EOF
Usage: $0 <env> [--command "<cmd>"] [--task <task-id>]

Examples:
  $0 dev
  $0 dev --command "node -v"
  $0 dev --command "node -e 'console.log(Object.keys(process.env).filter(k => k.startsWith(\"SES_\")))'"
  $0 prod --task 0a1b2c3d
EOF
  exit 1
}

if [ $# -lt 1 ]; then
  usage
fi

ENV="$1"
shift

COMMAND="/bin/sh"
TASK_OVERRIDE=""

while [ $# -gt 0 ]; do
  case "$1" in
    --command)
      COMMAND="$2"
      shift 2
      ;;
    --task)
      TASK_OVERRIDE="$2"
      shift 2
      ;;
    *)
      usage
      ;;
  esac
done

if [[ ! "${ENV}" =~ ^[a-z][a-z0-9-]{0,30}$ ]]; then
  echo "Invalid env: ${ENV}" >&2
  exit 1
fi

NAME_PREFIX="fortressauth-${ENV}"
AWS_PROFILE="${AWS_PROFILE:-${NAME_PREFIX}}"
AWS_REGION="${AWS_REGION:-eu-west-1}"
CLUSTER="${CLUSTER:-${NAME_PREFIX}-cluster}"
CONTAINER="${CONTAINER:-app}"

export AWS_PROFILE
export AWS_REGION

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    if [ "$1" = "session-manager-plugin" ]; then
      cat >&2 <<EOF
Missing required command: session-manager-plugin

Install with:
  brew install --cask session-manager-plugin
  sudo ln -sf /usr/local/sessionmanagerplugin/bin/session-manager-plugin /usr/local/bin/session-manager-plugin
EOF
    else
      echo "Missing required command: $1" >&2
    fi
    exit 1
  fi
}

require_cmd aws
require_cmd session-manager-plugin

log() {
  printf '[aws-ecs-shell] %s\n' "$*" >&2
}

log "Profile  : ${AWS_PROFILE}"
log "Region   : ${AWS_REGION}"
log "Cluster  : ${CLUSTER}"
log "Container: ${CONTAINER}"

if [ -n "${TASK_OVERRIDE}" ]; then
  TASK_ARN="$(aws ecs list-tasks \
    --cluster "${CLUSTER}" \
    --query "taskArns[?ends_with(@, '/${TASK_OVERRIDE}')] | [0]" \
    --output text 2>/dev/null || true)"
else
  TASK_ARN="$(aws ecs list-tasks \
    --cluster "${CLUSTER}" \
    --desired-status RUNNING \
    --query 'taskArns[0]' \
    --output text 2>/dev/null || true)"
fi

if [ -z "${TASK_ARN}" ] || [ "${TASK_ARN}" = "None" ]; then
  cat >&2 <<EOF
No running task in cluster ${CLUSTER}.

Bring tasks up first:
  pulumi config set fortressauth-aws:desiredCount 1 --stack idmcalculus/fortressauth-aws/${ENV}
  pulumi up --stack idmcalculus/fortressauth-aws/${ENV}
EOF
  exit 1
fi

log "Task     : ${TASK_ARN##*/}"
log "Command  : ${COMMAND}"

exec aws ecs execute-command \
  --cluster "${CLUSTER}" \
  --task "${TASK_ARN}" \
  --container "${CONTAINER}" \
  --interactive \
  --command "${COMMAND}"
