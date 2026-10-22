#!/usr/bin/env bash
# deploy/oracle/deploy.sh
#
# Runs on the VM, from /opt/fortressauth. Points .env at a new app image,
# pulls the images and restarts the stack, then waits until every service
# reports healthy.
#
# The "Deploy Oracle" GitHub workflow calls this after copying the Compose
# files over. To roll back by hand, pass an older image:
#   ./deploy.sh ghcr.io/idmcalculus/fortressauth-server:sha-<older-commit>
#
# Usage:
#   ./deploy.sh <image-ref>

set -euo pipefail

cd "$(dirname "$0")"

image="${1:-}"
# Image refs only ever contain these characters. Checking keeps quotes,
# spaces and sed metacharacters out of the rewrite below.
if [[ ! "${image}" =~ ^[A-Za-z0-9][A-Za-z0-9._:/@-]*$ ]]; then
  echo "Usage: $0 <image-ref>" >&2
  exit 1
fi

for file in .env app.env docker-compose.yml Caddyfile; do
  if [ ! -f "${file}" ]; then
    echo "Missing $(pwd)/${file}. See deploy/oracle/README.md." >&2
    exit 1
  fi
done

if grep -q '^FORTRESS_IMAGE=' .env; then
  sed -i.bak "s|^FORTRESS_IMAGE=.*|FORTRESS_IMAGE=${image}|" .env
  rm -f .env.bak
else
  printf 'FORTRESS_IMAGE=%s\n' "${image}" >>.env
fi

echo "Deploying ${image}"
docker compose pull --quiet
docker compose up --detach --wait --wait-timeout 300 --remove-orphans
docker image prune --force >/dev/null
docker compose ps
