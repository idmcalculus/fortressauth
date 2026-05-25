#!/usr/bin/env bash
# scripts/aws-env-power.sh
#
# Starts, stops, or reports status for a FortressAuth AWS environment.
#
# Usage:
#   scripts/aws-env-power.sh <dev|prod> status
#   scripts/aws-env-power.sh <dev|prod> stop [--yes] [--no-wait]
#   scripts/aws-env-power.sh <dev|prod> start [--desired-count N] [--yes] [--no-wait]
#
# What this controls:
#   - ECS service desired count (stop = 0, start = desired count)
#   - RDS DB instance stop/start
#
# What this does not control:
#   - Application Load Balancers cannot be stopped in AWS. The script reports
#     ALB status and DNS name, but leaves the Pulumi-managed ALB in place.
#
# Env overrides:
#   AWS_PROFILE      Defaults to "fortressauth-<env>".
#   AWS_REGION       Defaults to "eu-west-1".
#   CLUSTER          Defaults to "fortressauth-<env>-cluster".
#   SERVICE          Optional ECS service name or ARN. Auto-detected otherwise.
#   DB_INSTANCE_ID   Defaults to "fortressauth-<env>-db".
#   ALB_NAME         Defaults to "fortressauth-<env>-alb".
#   TARGET_GROUP     Defaults to "fortressauth-<env>-tg".
#   DESIRED_COUNT    Defaults to 1 for start.

set -euo pipefail

usage() {
  cat >&2 <<EOF
Usage: $0 <dev|prod> <status|stop|start> [options]

Options:
  --desired-count N   ECS desired count to use with start. Default: 1.
  --yes               Skip the production confirmation prompt.
  --wait              Wait for RDS and ECS transitions. Default.
  --no-wait           Return immediately after issuing AWS commands.

Examples:
  $0 dev status
  $0 dev stop
  $0 dev start --desired-count 1
  $0 prod stop --yes
EOF
  exit 1
}

if [ $# -lt 2 ]; then
  usage
fi

ENV="$1"
ACTION="$2"
shift 2

case "${ENV}" in
  dev)
    EXPECTED_ACCOUNT_ID="552072248716"
    ;;
  prod)
    EXPECTED_ACCOUNT_ID="437040615654"
    ;;
  *)
    echo "Invalid env: ${ENV}. Expected dev or prod." >&2
    exit 1
    ;;
esac

case "${ACTION}" in
  status | stop | start) ;;
  *) usage ;;
esac

ASSUME_YES="false"
WAIT="true"
DESIRED_COUNT="${DESIRED_COUNT:-1}"

while [ $# -gt 0 ]; do
  case "$1" in
    --desired-count)
      if [ $# -lt 2 ] || [[ ! "$2" =~ ^[0-9]+$ ]]; then
        echo "--desired-count requires a non-negative integer." >&2
        exit 1
      fi
      DESIRED_COUNT="$2"
      shift 2
      ;;
    --yes)
      ASSUME_YES="true"
      shift
      ;;
    --wait)
      WAIT="true"
      shift
      ;;
    --no-wait)
      WAIT="false"
      shift
      ;;
    *)
      usage
      ;;
  esac
done

NAME_PREFIX="fortressauth-${ENV}"
AWS_PROFILE="${AWS_PROFILE:-${NAME_PREFIX}}"
AWS_REGION="${AWS_REGION:-eu-west-1}"
CLUSTER="${CLUSTER:-${NAME_PREFIX}-cluster}"
DB_INSTANCE_ID="${DB_INSTANCE_ID:-${NAME_PREFIX}-db}"
ALB_NAME="${ALB_NAME:-${NAME_PREFIX}-alb}"
TARGET_GROUP="${TARGET_GROUP:-${NAME_PREFIX}-tg}"

export AWS_PROFILE
export AWS_REGION

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

log() {
  printf '[aws-env-power] %s\n' "$*" >&2
}

require_cmd aws

log "Profile : ${AWS_PROFILE}"
log "Region  : ${AWS_REGION}"
log "Env     : ${ENV}"
log "Action  : ${ACTION}"

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text 2>/dev/null || true)"
if [ -z "${ACCOUNT_ID}" ] || [ "${ACCOUNT_ID}" = "None" ]; then
  cat >&2 <<EOF
Could not get AWS caller identity. Likely an SSO session expired.

Try:
  aws sso login --profile ${AWS_PROFILE}
EOF
  exit 1
fi

if [ "${ACCOUNT_ID}" != "${EXPECTED_ACCOUNT_ID}" ]; then
  cat >&2 <<EOF
Account guard tripped. Refusing to operate on ${ENV}.

  Expected: ${EXPECTED_ACCOUNT_ID}
  Resolved: ${ACCOUNT_ID}

Fix:
  export AWS_PROFILE=${AWS_PROFILE}
  aws sts get-caller-identity
EOF
  exit 1
fi

log "Account : ${ACCOUNT_ID}"

confirm_prod() {
  if [ "${ENV}" != "prod" ] || [ "${ASSUME_YES}" = "true" ]; then
    return
  fi

  cat >&2 <<EOF

This will ${ACTION} production resources for api.fortressauth.com.
Type "prod" to continue:
EOF
  read -r answer
  if [ "${answer}" != "prod" ]; then
    echo "Cancelled." >&2
    exit 1
  fi
}

resolve_service() {
  if [ -n "${SERVICE:-}" ]; then
    SERVICE_REF="${SERVICE}"
    return
  fi

  local service_arns_text
  service_arns_text="$(aws ecs list-services \
    --cluster "${CLUSTER}" \
    --query 'serviceArns[]' \
    --output text 2>/dev/null || true)"

  if [ -z "${service_arns_text}" ] || [ "${service_arns_text}" = "None" ]; then
    echo "Could not find ECS services in cluster ${CLUSTER}." >&2
    exit 1
  fi

  local service_arns=()
  read -r -a service_arns <<<"${service_arns_text}"

  if [ "${#service_arns[@]}" -eq 1 ]; then
    SERVICE_REF="${service_arns[0]}"
    return
  fi

  local arn
  for arn in "${service_arns[@]}"; do
    local service_name="${arn##*/}"
    if [[ "${service_name}" == "${NAME_PREFIX}-service"* ]]; then
      SERVICE_REF="${arn}"
      return
    fi
  done

  cat >&2 <<EOF
Multiple ECS services found in ${CLUSTER}; set SERVICE to the target service name or ARN.

Services:
${service_arns_text}
EOF
  exit 1
}

ecs_status() {
  resolve_service

  read -r SERVICE_STATUS SERVICE_DESIRED SERVICE_RUNNING SERVICE_PENDING < <(
    aws ecs describe-services \
      --cluster "${CLUSTER}" \
      --services "${SERVICE_REF}" \
      --query 'services[0].[status,desiredCount,runningCount,pendingCount]' \
      --output text
  )

  SERVICE_NAME="${SERVICE_REF##*/}"
  cat <<EOF
ECS
  Cluster       : ${CLUSTER}
  Service       : ${SERVICE_NAME}
  Status        : ${SERVICE_STATUS}
  Desired       : ${SERVICE_DESIRED}
  Running       : ${SERVICE_RUNNING}
  Pending       : ${SERVICE_PENDING}
EOF
}

rds_status_value() {
  aws rds describe-db-instances \
    --db-instance-identifier "${DB_INSTANCE_ID}" \
    --query 'DBInstances[0].DBInstanceStatus' \
    --output text 2>/dev/null || true
}

rds_status() {
  local db_status
  local db_endpoint
  read -r db_status db_endpoint < <(
    aws rds describe-db-instances \
      --db-instance-identifier "${DB_INSTANCE_ID}" \
      --query 'DBInstances[0].[DBInstanceStatus,Endpoint.Address]' \
      --output text 2>/dev/null || echo "unknown -"
  )

  cat <<EOF
RDS
  Instance      : ${DB_INSTANCE_ID}
  Status        : ${db_status}
  Endpoint      : ${db_endpoint}
EOF
}

alb_status() {
  local alb_state
  local alb_dns
  read -r alb_state alb_dns < <(
    aws elbv2 describe-load-balancers \
      --names "${ALB_NAME}" \
      --query 'LoadBalancers[0].[State.Code,DNSName]' \
      --output text 2>/dev/null || echo "unknown -"
  )

  local target_health
  local target_group_arn
  target_group_arn="$(aws elbv2 describe-target-groups \
    --names "${TARGET_GROUP}" \
    --query 'TargetGroups[0].TargetGroupArn' \
    --output text 2>/dev/null || true)"

  if [ -n "${target_group_arn}" ] && [ "${target_group_arn}" != "None" ]; then
    target_health="$(aws elbv2 describe-target-health \
      --target-group-arn "${target_group_arn}" \
      --query 'TargetHealthDescriptions[].TargetHealth.State' \
      --output text 2>/dev/null || true)"
  else
    target_health=""
  fi

  cat <<EOF
ALB
  Name          : ${ALB_NAME}
  Status        : ${alb_state}
  DNS           : ${alb_dns}
  Target health : ${target_health:-none}
  Note          : AWS does not support stopping an Application Load Balancer.
EOF
}

show_status() {
  echo
  ecs_status
  echo
  rds_status
  echo
  alb_status
  echo
}

wait_for_ecs() {
  if [ "${WAIT}" != "true" ]; then
    return
  fi
  log "Waiting for ECS service stability..."
  aws ecs wait services-stable --cluster "${CLUSTER}" --services "${SERVICE_REF}"
}

wait_for_rds() {
  local target_state="$1"
  if [ "${WAIT}" != "true" ]; then
    return
  fi
  log "Waiting for RDS ${DB_INSTANCE_ID} to become ${target_state}..."
  case "${target_state}" in
    available)
      aws rds wait db-instance-available --db-instance-identifier "${DB_INSTANCE_ID}"
      ;;
    stopped)
      aws rds wait db-instance-stopped --db-instance-identifier "${DB_INSTANCE_ID}"
      ;;
    *)
      echo "Unsupported RDS wait target: ${target_state}" >&2
      exit 1
      ;;
  esac
}

stop_env() {
  confirm_prod
  resolve_service

  log "Setting ECS service desired count to 0..."
  aws ecs update-service \
    --cluster "${CLUSTER}" \
    --service "${SERVICE_REF}" \
    --desired-count 0 >/dev/null
  wait_for_ecs

  local db_status
  db_status="$(rds_status_value)"
  case "${db_status}" in
    available)
      log "Stopping RDS instance ${DB_INSTANCE_ID}..."
      aws rds stop-db-instance --db-instance-identifier "${DB_INSTANCE_ID}" >/dev/null
      wait_for_rds stopped
      ;;
    stopped | stopping)
      log "RDS instance ${DB_INSTANCE_ID} is already ${db_status}."
      ;;
    *)
      cat >&2 <<EOF
RDS instance ${DB_INSTANCE_ID} is ${db_status:-unknown}; not issuing stop.
Wait for it to become available, then retry.
EOF
      exit 1
      ;;
  esac

  log "ALB ${ALB_NAME} remains provisioned; AWS has no stop API for ALBs."
  show_status
}

start_env() {
  confirm_prod
  resolve_service

  local db_status
  db_status="$(rds_status_value)"
  case "${db_status}" in
    stopped)
      log "Starting RDS instance ${DB_INSTANCE_ID}..."
      aws rds start-db-instance --db-instance-identifier "${DB_INSTANCE_ID}" >/dev/null
      wait_for_rds available
      ;;
    available)
      log "RDS instance ${DB_INSTANCE_ID} is already available."
      ;;
    starting)
      log "RDS instance ${DB_INSTANCE_ID} is already starting."
      wait_for_rds available
      ;;
    stopping)
      if [ "${WAIT}" != "true" ]; then
        echo "RDS is stopping. Re-run start after it reaches stopped, or omit --no-wait." >&2
        exit 1
      fi
      wait_for_rds stopped
      log "Starting RDS instance ${DB_INSTANCE_ID}..."
      aws rds start-db-instance --db-instance-identifier "${DB_INSTANCE_ID}" >/dev/null
      wait_for_rds available
      ;;
    *)
      cat >&2 <<EOF
RDS instance ${DB_INSTANCE_ID} is ${db_status:-unknown}; not issuing start.
Wait for it to become stopped or available, then retry.
EOF
      exit 1
      ;;
  esac

  log "Setting ECS service desired count to ${DESIRED_COUNT}..."
  aws ecs update-service \
    --cluster "${CLUSTER}" \
    --service "${SERVICE_REF}" \
    --desired-count "${DESIRED_COUNT}" >/dev/null
  wait_for_ecs

  log "ALB ${ALB_NAME} remains provisioned and should route once targets are healthy."
  show_status
}

case "${ACTION}" in
  status)
    show_status
    ;;
  stop)
    stop_env
    ;;
  start)
    start_env
    ;;
esac
