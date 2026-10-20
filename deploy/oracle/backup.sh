#!/usr/bin/env bash
# deploy/oracle/backup.sh
#
# Dumps the FortressAuth database. The fortressauth-backup systemd timer
# (installed by bootstrap-vm.sh) runs this nightly from /opt/fortressauth.
#
#   - Writes backups/fortressauth-<UTC time>.dump in pg_dump custom format.
#   - Deletes local dumps older than BACKUP_KEEP_DAYS (from .env, default 14).
#   - When BACKUP_PAR_URL is set in .env, uploads the dump to OCI Object
#     Storage through that write-only pre-authenticated request URL.
#
# Restore steps are in deploy/oracle/README.md.

set -euo pipefail

cd "$(dirname "$0")"
umask 077

# Reads one KEY=value line from .env, dropping one pair of surrounding quotes.
env_value() {
  local value
  value="$(sed -n "s/^$1=//p" .env | tail -n 1)"
  value="${value#[\"\']}"
  value="${value%[\"\']}"
  printf '%s' "${value}"
}

keep_days="$(env_value BACKUP_KEEP_DAYS)"
keep_days="${keep_days:-14}"
par_url="$(env_value BACKUP_PAR_URL)"

mkdir -p backups
file="backups/fortressauth-$(date -u +%Y%m%dT%H%M%SZ).dump"
trap 'rm -f "${file}.partial"' EXIT

docker compose exec -T postgres \
  pg_dump --username fortressauth --dbname fortressauth --format custom >"${file}.partial"
mv "${file}.partial" "${file}"
echo "Wrote ${file} ($(du -h "${file}" | cut -f1))"

find backups -name 'fortressauth-*.dump' -type f -mtime +"${keep_days}" -delete

if [ -n "${par_url}" ]; then
  curl --fail --silent --show-error --retry 3 \
    --upload-file "${file}" "${par_url%/}/$(basename "${file}")"
  echo "Uploaded $(basename "${file}") to Object Storage"
fi
