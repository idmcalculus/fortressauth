#!/usr/bin/env bash
# scripts/npm-configure-trusted-publishing.sh
#
# Configures npm Trusted Publishing for every publishable FortressAuth package.
#
# Requirements:
#   - npm 11.10.0 or newer
#   - npm login with write access to every @fortressauth package
#   - account-level 2FA enabled
#
# Usage:
#   scripts/npm-configure-trusted-publishing.sh --dry-run
#   scripts/npm-configure-trusted-publishing.sh
#
# Notes:
#   - The first real run may require browser/2FA approval. npm may offer to
#     skip additional 2FA prompts for a short window; accept that to complete
#     the batch.
#   - This grants the GitHub Actions workflow publish.yml permission to run
#     npm publish for each package.

set -euo pipefail

DRY_RUN="false"

usage() {
  cat >&2 <<EOF
Usage: $0 [--dry-run]

Options:
  --dry-run   Print and validate trust commands without changing npm.
EOF
  exit 1
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    *)
      usage
      ;;
  esac
done

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd npm

NPM_VERSION="$(npm --version)"
case "${NPM_VERSION}" in
  11.* | 12.*) ;;
  *)
    cat >&2 <<EOF
npm ${NPM_VERSION} is too old for npm trust commands.

Install a supported version:
  npm install -g 'npm@^11.10.0'
EOF
    exit 1
    ;;
esac

PACKAGES=(
  @fortressauth/core
  @fortressauth/adapter-sql
  @fortressauth/adapter-mongodb
  @fortressauth/email-ses
  @fortressauth/email-sendgrid
  @fortressauth/email-smtp
  @fortressauth/oauth-core
  @fortressauth/provider-google
  @fortressauth/provider-github
  @fortressauth/provider-apple
  @fortressauth/provider-discord
  @fortressauth/provider-linkedin
  @fortressauth/provider-twitter
  @fortressauth/provider-microsoft
  @fortressauth/server
  @fortressauth/react-sdk
  @fortressauth/vue-sdk
  @fortressauth/angular-sdk
  @fortressauth/svelte-sdk
  @fortressauth/react-native-sdk
  @fortressauth/expo-sdk
  @fortressauth/electron-sdk
)

ARGS=(
  --file publish.yml
  --repo idmcalculus/fortressauth
  --allow-publish
  --yes
)

if [ "${DRY_RUN}" = "true" ]; then
  ARGS+=(--dry-run)
fi

for package_name in "${PACKAGES[@]}"; do
  echo "Configuring trusted publishing for ${package_name}"
  npm trust github "${package_name}" "${ARGS[@]}"
  if [ "${DRY_RUN}" != "true" ]; then
    sleep 2
  fi
done
