#!/usr/bin/env bash
# scripts/aws-bootstrap.sh
#
# Idempotently bootstraps an AWS member account so GitHub Actions can deploy
# FortressAuth via OIDC federation (no static access keys).
#
# What this script creates:
#   - An IAM OpenID Connect (OIDC) provider for token.actions.githubusercontent.com
#   - An IAM role that GitHub Actions assumes via OIDC
#   - A trust policy scoped to a specific GitHub repo + branches + environments
#   - Attached managed policies wide enough for Pulumi to provision the stack
#
# Run this once per AWS account. Example:
#   AWS_PROFILE=fortressauth-dev  ./scripts/aws-bootstrap.sh
#   AWS_PROFILE=fortressauth-prod ./scripts/aws-bootstrap.sh
#
# Required env / CLI:
#   - aws CLI v2 logged in to the target account (AWS_PROFILE preferred)
#   - jq installed
#
# Optional env vars (with defaults):
#   GITHUB_REPO         Default: "idmcalculus/fortressauth"
#   ROLE_NAME           Default: "github-actions-fortressauth-deploy"
#   ENVIRONMENTS        Comma-separated GitHub environment names that may
#                       assume the role. Default: "aws-dev,aws-prod".
#   ALLOW_BRANCHES      Comma-separated branches that may assume the role from
#                       a workflow not running in a GitHub Environment.
#                       Default: "main".
#   PERMISSION_MODE     "broad" (default, attaches PowerUserAccess + IAM admin)
#                       or "narrow" (attaches a curated FortressAuthDeploy
#                       policy). Use "broad" for the initial Pulumi run-up.
#                       Tighten to "narrow" once the stack is stable.
#   POLICY_NAME         Inline IAM policy name. Default:
#                       "FortressAuthDeployIamScope".
#   EXPECTED_ACCOUNT_ID Required safety guard. The script refuses to run unless
#                       the resolved account ID matches this value, or unless
#                       FORCE=1 is set. Set this to the FortressAuth member
#                       account ID before running.
#   EXPECTED_ACCOUNT_ALIAS Optional. If set, the resolved account alias must
#                       match this value (case-insensitive substring match).
#   FORCE               Set to "1" to skip the EXPECTED_ACCOUNT_ID check.
#                       Strongly discouraged outside ad-hoc local testing.
#
# The script is idempotent. Re-running it updates the trust policy and
# re-attaches managed policies but does not duplicate resources.

set -euo pipefail

GITHUB_REPO="${GITHUB_REPO:-idmcalculus/fortressauth}"
ROLE_NAME="${ROLE_NAME:-github-actions-fortressauth-deploy}"
# Each AWS account should only trust the GitHub environment that targets it.
# By default we infer from EXPECTED_ACCOUNT_ALIAS (e.g. fortressauth-dev →
# aws-dev, fortressauth-prod → aws-prod). Override ENVIRONMENTS explicitly to
# trust additional environments from the same repo if needed.
DEFAULT_ENVIRONMENTS=""
case "${EXPECTED_ACCOUNT_ALIAS:-}" in
  *prod*) DEFAULT_ENVIRONMENTS="aws-prod" ;;
  *dev*) DEFAULT_ENVIRONMENTS="aws-dev" ;;
  *staging*) DEFAULT_ENVIRONMENTS="aws-staging" ;;
  *) DEFAULT_ENVIRONMENTS="aws-dev,aws-prod" ;;
esac
ENVIRONMENTS="${ENVIRONMENTS:-${DEFAULT_ENVIRONMENTS}}"
ALLOW_BRANCHES="${ALLOW_BRANCHES:-main}"
PERMISSION_MODE="${PERMISSION_MODE:-broad}"
POLICY_NAME="${POLICY_NAME:-FortressAuthDeployIamScope}"

OIDC_PROVIDER_HOST="token.actions.githubusercontent.com"
OIDC_PROVIDER_URL="https://${OIDC_PROVIDER_HOST}"
OIDC_AUDIENCE="sts.amazonaws.com"

log() {
  printf '[aws-bootstrap] %s\n' "$*"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd aws
require_cmd jq

if [[ "${PERMISSION_MODE}" != "broad" && "${PERMISSION_MODE}" != "narrow" ]]; then
  echo "Invalid PERMISSION_MODE='${PERMISSION_MODE}'. Expected 'broad' or 'narrow'." >&2
  exit 1
fi

log "Verifying AWS identity..."
CALLER_JSON="$(aws sts get-caller-identity --output json)"
ACCOUNT_ID="$(echo "${CALLER_JSON}" | jq -r '.Account')"
CALLER_ARN="$(echo "${CALLER_JSON}" | jq -r '.Arn')"

ACCOUNT_ALIAS="$(aws iam list-account-aliases --query 'AccountAliases[0]' --output text 2>/dev/null || true)"
if [[ "${ACCOUNT_ALIAS}" == "None" || -z "${ACCOUNT_ALIAS}" ]]; then
  ACCOUNT_ALIAS="(no alias set)"
fi

log "Account    : ${ACCOUNT_ID}"
log "Alias      : ${ACCOUNT_ALIAS}"
log "Caller     : ${CALLER_ARN}"
log "Repo       : ${GITHUB_REPO}"
log "Role       : ${ROLE_NAME}"
log "Mode       : ${PERMISSION_MODE}"

EXPECTED_ACCOUNT_ID="${EXPECTED_ACCOUNT_ID:-}"
EXPECTED_ACCOUNT_ALIAS="${EXPECTED_ACCOUNT_ALIAS:-}"
FORCE="${FORCE:-0}"

if [[ -z "${EXPECTED_ACCOUNT_ID}" && "${FORCE}" != "1" ]]; then
  cat >&2 <<EOF
Refusing to continue without an account guard.

This script will create IAM resources in the account above. To prevent
accidentally bootstrapping the wrong account (for example, a personal AWS
account that happens to be the current AWS_PROFILE), set EXPECTED_ACCOUNT_ID
to the 12-digit ID of the FortressAuth member account before running:

  EXPECTED_ACCOUNT_ID=<12-digit-id> AWS_PROFILE=<profile> ./scripts/aws-bootstrap.sh

If you really want to override this check (not recommended):

  FORCE=1 AWS_PROFILE=<profile> ./scripts/aws-bootstrap.sh
EOF
  exit 1
fi

if [[ -n "${EXPECTED_ACCOUNT_ID}" && "${EXPECTED_ACCOUNT_ID}" != "${ACCOUNT_ID}" ]]; then
  cat >&2 <<EOF
Account guard tripped.

  Expected account ID: ${EXPECTED_ACCOUNT_ID}
  Resolved account ID: ${ACCOUNT_ID}
  Caller             : ${CALLER_ARN}

Refusing to bootstrap. Switch your AWS_PROFILE to the FortressAuth member
account, then re-run.
EOF
  exit 1
fi

if [[ -n "${EXPECTED_ACCOUNT_ALIAS}" ]]; then
  expected_lc="$(printf '%s' "${EXPECTED_ACCOUNT_ALIAS}" | tr '[:upper:]' '[:lower:]')"
  alias_lc="$(printf '%s' "${ACCOUNT_ALIAS}" | tr '[:upper:]' '[:lower:]')"
  if [[ "${alias_lc}" != *"${expected_lc}"* ]]; then
    cat >&2 <<EOF
Account alias guard tripped.

  Expected alias contains: ${EXPECTED_ACCOUNT_ALIAS}
  Resolved alias         : ${ACCOUNT_ALIAS}

Refusing to bootstrap.
EOF
    exit 1
  fi
fi

if [[ "${FORCE}" == "1" && -z "${EXPECTED_ACCOUNT_ID}" ]]; then
  log "WARNING: FORCE=1 with no EXPECTED_ACCOUNT_ID. Proceeding without account guard."
fi

if [[ -t 0 && -t 1 ]]; then
  read -r -p "Bootstrap account ${ACCOUNT_ID} (${ACCOUNT_ALIAS}) for ${GITHUB_REPO}? Type the account ID to confirm: " confirm
  if [[ "${confirm}" != "${ACCOUNT_ID}" ]]; then
    echo "Confirmation did not match account ID. Aborting." >&2
    exit 1
  fi
fi

OIDC_PROVIDER_ARN="arn:aws:iam::${ACCOUNT_ID}:oidc-provider/${OIDC_PROVIDER_HOST}"

log "Ensuring GitHub OIDC provider exists..."
if aws iam get-open-id-connect-provider \
    --open-id-connect-provider-arn "${OIDC_PROVIDER_ARN}" >/dev/null 2>&1; then
  log "OIDC provider already present."
else
  # AWS validates the GitHub OIDC token chain against the trusted CA bundle, so
  # the thumbprint value is no longer security-critical, but the API still
  # requires one. Use the documented well-known thumbprint.
  THUMBPRINT="6938fd4d98bab03faadb97b34396831e3780aea1"
  aws iam create-open-id-connect-provider \
    --url "${OIDC_PROVIDER_URL}" \
    --client-id-list "${OIDC_AUDIENCE}" \
    --thumbprint-list "${THUMBPRINT}" >/dev/null
  log "Created OIDC provider."
fi

log "Building trust policy..."
TRUST_POLICY_FILE="$(mktemp)"
trap 'rm -f "${TRUST_POLICY_FILE}"' EXIT

ENV_SUBJECTS_JSON="$(printf '%s\n' "${ENVIRONMENTS}" \
  | tr ',' '\n' \
  | sed '/^$/d' \
  | jq -R -s --arg repo "${GITHUB_REPO}" '
      split("\n")
      | map(select(length > 0))
      | map("repo:\($repo):environment:\(.)")
    ')"

BRANCH_SUBJECTS_JSON="$(printf '%s\n' "${ALLOW_BRANCHES}" \
  | tr ',' '\n' \
  | sed '/^$/d' \
  | jq -R -s --arg repo "${GITHUB_REPO}" '
      split("\n")
      | map(select(length > 0))
      | map("repo:\($repo):ref:refs/heads/\(.)")
    ')"

ALL_SUBJECTS_JSON="$(jq -n \
  --argjson envs "${ENV_SUBJECTS_JSON}" \
  --argjson branches "${BRANCH_SUBJECTS_JSON}" \
  '$envs + $branches | unique')"

jq -n \
  --arg providerArn "${OIDC_PROVIDER_ARN}" \
  --arg audience "${OIDC_AUDIENCE}" \
  --argjson subjects "${ALL_SUBJECTS_JSON}" \
  '{
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { Federated: $providerArn },
        Action: "sts:AssumeRoleWithWebIdentity",
        Condition: {
          StringEquals: {
            "token.actions.githubusercontent.com:aud": $audience
          },
          StringLike: {
            "token.actions.githubusercontent.com:sub": $subjects
          }
        }
      }
    ]
  }' >"${TRUST_POLICY_FILE}"

log "Trust policy subjects:"
jq -r '.Statement[0].Condition.StringLike["token.actions.githubusercontent.com:sub"][] | "  - " + .' \
  "${TRUST_POLICY_FILE}"

log "Ensuring IAM role ${ROLE_NAME} exists..."
if aws iam get-role --role-name "${ROLE_NAME}" >/dev/null 2>&1; then
  log "Role exists. Updating trust policy."
  aws iam update-assume-role-policy \
    --role-name "${ROLE_NAME}" \
    --policy-document "file://${TRUST_POLICY_FILE}" >/dev/null
else
  aws iam create-role \
    --role-name "${ROLE_NAME}" \
    --assume-role-policy-document "file://${TRUST_POLICY_FILE}" \
    --description "OIDC role for GitHub Actions to deploy FortressAuth via Pulumi" \
    --max-session-duration 3600 \
    --tags \
        "Key=managed-by,Value=fortressauth-bootstrap" \
        "Key=project,Value=fortressauth" \
        "Key=purpose,Value=github-oidc-deploy" >/dev/null
  log "Created role."
fi

attach_managed_policy() {
  local arn="$1"
  log "Attaching managed policy: ${arn}"
  aws iam attach-role-policy --role-name "${ROLE_NAME}" --policy-arn "${arn}" >/dev/null
}

put_inline_policy() {
  local name="$1"
  local file="$2"
  log "Putting inline policy: ${name}"
  aws iam put-role-policy \
    --role-name "${ROLE_NAME}" \
    --policy-name "${name}" \
    --policy-document "file://${file}" >/dev/null
}

case "${PERMISSION_MODE}" in
  broad)
    attach_managed_policy "arn:aws:iam::aws:policy/PowerUserAccess"

    # Pulumi creates IAM roles/policies for the ECS task and execution role.
    # PowerUserAccess does not include iam:* actions, so add a scoped inline
    # policy granting just enough for Pulumi-managed IAM resources.
    INLINE_POLICY_FILE="$(mktemp)"
    cat >"${INLINE_POLICY_FILE}" <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PulumiManagedIam",
      "Effect": "Allow",
      "Action": [
        "iam:CreateRole",
        "iam:DeleteRole",
        "iam:GetRole",
        "iam:PassRole",
        "iam:UpdateRole",
        "iam:UpdateRoleDescription",
        "iam:UpdateAssumeRolePolicy",
        "iam:TagRole",
        "iam:UntagRole",
        "iam:ListRoleTags",
        "iam:ListRoles",
        "iam:CreatePolicy",
        "iam:DeletePolicy",
        "iam:GetPolicy",
        "iam:GetPolicyVersion",
        "iam:CreatePolicyVersion",
        "iam:DeletePolicyVersion",
        "iam:ListPolicies",
        "iam:ListPolicyVersions",
        "iam:TagPolicy",
        "iam:UntagPolicy",
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy",
        "iam:ListAttachedRolePolicies",
        "iam:PutRolePolicy",
        "iam:GetRolePolicy",
        "iam:DeleteRolePolicy",
        "iam:ListRolePolicies",
        "iam:CreateInstanceProfile",
        "iam:DeleteInstanceProfile",
        "iam:GetInstanceProfile",
        "iam:AddRoleToInstanceProfile",
        "iam:RemoveRoleFromInstanceProfile",
        "iam:CreateServiceLinkedRole",
        "iam:DeleteServiceLinkedRole",
        "iam:GetServiceLinkedRoleDeletionStatus"
      ],
      "Resource": "*"
    }
  ]
}
EOF
    put_inline_policy "${POLICY_NAME}" "${INLINE_POLICY_FILE}"
    rm -f "${INLINE_POLICY_FILE}"
    ;;

  narrow)
    # Curated permission set for steady-state deploys. Tighten further per
    # service once the resource ARNs are known and stable.
    NARROW_POLICY_FILE="$(mktemp)"
    cat >"${NARROW_POLICY_FILE}" <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "VpcReadWrite",
      "Effect": "Allow",
      "Action": [
        "ec2:Describe*",
        "ec2:CreateVpc",
        "ec2:DeleteVpc",
        "ec2:ModifyVpcAttribute",
        "ec2:CreateSubnet",
        "ec2:DeleteSubnet",
        "ec2:ModifySubnetAttribute",
        "ec2:CreateRouteTable",
        "ec2:DeleteRouteTable",
        "ec2:AssociateRouteTable",
        "ec2:DisassociateRouteTable",
        "ec2:CreateRoute",
        "ec2:DeleteRoute",
        "ec2:CreateInternetGateway",
        "ec2:DeleteInternetGateway",
        "ec2:AttachInternetGateway",
        "ec2:DetachInternetGateway",
        "ec2:CreateSecurityGroup",
        "ec2:DeleteSecurityGroup",
        "ec2:AuthorizeSecurityGroupIngress",
        "ec2:AuthorizeSecurityGroupEgress",
        "ec2:RevokeSecurityGroupIngress",
        "ec2:RevokeSecurityGroupEgress",
        "ec2:CreateTags",
        "ec2:DeleteTags"
      ],
      "Resource": "*"
    },
    {
      "Sid": "EcsAndEcr",
      "Effect": "Allow",
      "Action": [
        "ecr:*",
        "ecs:*",
        "elasticloadbalancing:*",
        "application-autoscaling:*",
        "logs:*",
        "cloudwatch:*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "Rds",
      "Effect": "Allow",
      "Action": [
        "rds:*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "Acm",
      "Effect": "Allow",
      "Action": [
        "acm:*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "Route53",
      "Effect": "Allow",
      "Action": [
        "route53:*",
        "route53domains:*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "Secrets",
      "Effect": "Allow",
      "Action": [
        "secretsmanager:*",
        "kms:CreateKey",
        "kms:DescribeKey",
        "kms:ListKeys",
        "kms:ListAliases",
        "kms:CreateAlias",
        "kms:DeleteAlias",
        "kms:UpdateAlias",
        "kms:TagResource",
        "kms:UntagResource",
        "kms:ScheduleKeyDeletion",
        "kms:CancelKeyDeletion",
        "kms:EnableKey",
        "kms:DisableKey",
        "kms:GetKeyPolicy",
        "kms:PutKeyPolicy",
        "kms:GenerateDataKey*",
        "kms:Decrypt",
        "kms:Encrypt"
      ],
      "Resource": "*"
    },
    {
      "Sid": "Ses",
      "Effect": "Allow",
      "Action": [
        "ses:*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "Iam",
      "Effect": "Allow",
      "Action": [
        "iam:CreateRole",
        "iam:DeleteRole",
        "iam:GetRole",
        "iam:PassRole",
        "iam:UpdateRole",
        "iam:UpdateAssumeRolePolicy",
        "iam:TagRole",
        "iam:UntagRole",
        "iam:ListRoles",
        "iam:CreatePolicy",
        "iam:DeletePolicy",
        "iam:GetPolicy",
        "iam:GetPolicyVersion",
        "iam:CreatePolicyVersion",
        "iam:DeletePolicyVersion",
        "iam:ListPolicies",
        "iam:ListPolicyVersions",
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy",
        "iam:ListAttachedRolePolicies",
        "iam:PutRolePolicy",
        "iam:GetRolePolicy",
        "iam:DeleteRolePolicy",
        "iam:ListRolePolicies",
        "iam:CreateServiceLinkedRole",
        "iam:DeleteServiceLinkedRole",
        "iam:GetServiceLinkedRoleDeletionStatus"
      ],
      "Resource": "*"
    },
    {
      "Sid": "Sts",
      "Effect": "Allow",
      "Action": [
        "sts:GetCallerIdentity"
      ],
      "Resource": "*"
    }
  ]
}
EOF
    put_inline_policy "${POLICY_NAME}" "${NARROW_POLICY_FILE}"
    rm -f "${NARROW_POLICY_FILE}"
    ;;
esac

ROLE_ARN="$(aws iam get-role --role-name "${ROLE_NAME}" --query 'Role.Arn' --output text)"

cat <<SUMMARY

----------------------------------------------------------------------
Bootstrap complete.

Account ID : ${ACCOUNT_ID}
Role name  : ${ROLE_NAME}
Role ARN   : ${ROLE_ARN}
Repo       : ${GITHUB_REPO}
Branches   : ${ALLOW_BRANCHES}
Environments: ${ENVIRONMENTS}
Mode       : ${PERMISSION_MODE}

Next steps:
  1. In GitHub, open Settings > Environments for ${GITHUB_REPO}.
  2. Create the environments listed above (one per AWS account).
  3. For each environment, add these variables:
       AWS_REGION=eu-west-1
       AWS_ROLE_TO_ASSUME=${ROLE_ARN}
       PULUMI_STACK=idmcalculus/fortressauth-aws/<env>
  4. Add the secret PULUMI_ACCESS_TOKEN to each environment.
  5. The deploy workflow at .github/workflows/deploy-aws.yml will use
     aws-actions/configure-aws-credentials@v4 with role-to-assume to
     federate without static keys.

To re-run with tighter permissions later:
  PERMISSION_MODE=narrow AWS_PROFILE=${AWS_PROFILE:-<profile>} ./scripts/aws-bootstrap.sh
----------------------------------------------------------------------
SUMMARY
