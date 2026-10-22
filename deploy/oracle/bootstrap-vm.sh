#!/usr/bin/env bash
# deploy/oracle/bootstrap-vm.sh
#
# One-time setup for an Ubuntu 24.04 VM (Oracle Cloud Ampere A1) that runs
# the FortressAuth Docker Compose stack. Safe to re-run.
#
# What it does:
#   - Opens TCP 80, TCP 443 and UDP 443 in the host firewall. Oracle's Ubuntu
#     images reject all inbound traffic except SSH by default.
#   - Installs Docker Engine and the Compose plugin from Docker's apt repo.
#   - Creates a "deploy" user for GitHub Actions: docker group, no sudo.
#     Membership of the docker group is still root-equivalent, so guard the
#     deploy key like a root key.
#   - Creates /opt/fortressauth (and backups/), owned by the deploy user.
#   - Installs a systemd timer that runs /opt/fortressauth/backup.sh nightly.
#
# packages/infra-oracle passes this script to cloud-init, which runs it on
# the VM's first boot. To run it by hand instead, from your machine, passing
# the CI deploy key's public half:
#   ssh ubuntu@<vm-ip> "sudo bash -s -- '$(cat ~/.ssh/fortressauth-deploy.pub)'" \
#     < deploy/oracle/bootstrap-vm.sh
#
# Env overrides:
#   DEPLOY_USER   Defaults to "deploy".

set -euo pipefail

DEPLOY_PUBLIC_KEY="${1:-}"
DEPLOY_USER="${DEPLOY_USER:-deploy}"
APP_DIR=/opt/fortressauth
RULES_FILE=/etc/iptables/rules.v4

log() {
  printf '[bootstrap] %s\n' "$*" >&2
}

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root, e.g. through sudo." >&2
  exit 1
fi

case "${DEPLOY_PUBLIC_KEY}" in
  ssh-ed25519\ * | ssh-rsa\ * | ecdsa-sha2-*) ;;
  *)
    echo "Pass the deploy SSH public key as the first argument." >&2
    exit 1
    ;;
esac

# shellcheck disable=SC1091
. /etc/os-release
if [ "${ID}" != "ubuntu" ]; then
  echo "Expected Ubuntu, found ${ID}." >&2
  exit 1
fi
if [ "$(uname -m)" != "aarch64" ]; then
  log "Warning: expected aarch64 (Ampere A1), found $(uname -m)."
  log "The deploy workflow builds linux/arm64 images only."
fi

export DEBIAN_FRONTEND=noninteractive
# On first boot (cloud-init) Ubuntu's own updates may hold the dpkg lock.
# Wait up to 10 minutes for it instead of failing.
APT_GET=(apt-get -o DPkg::Lock::Timeout=600)

# --- Host firewall -----------------------------------------------------------
# Insert ACCEPT rules just above the INPUT chain's final REJECT, both live and
# in the saved rules file. Neither step reloads the whole rule set, so the
# chains Docker adds are left alone.
open_port() {
  local proto="$1"
  local port="$2"
  local rule=(-p "${proto}" -m state --state NEW -m "${proto}" --dport "${port}" -j ACCEPT)

  if ! iptables -C INPUT "${rule[@]}" 2>/dev/null; then
    local reject_line
    reject_line="$(iptables -L INPUT --line-numbers -n | awk '$2 == "REJECT" { print $1; exit }')"
    if [ -n "${reject_line}" ]; then
      iptables -I INPUT "${reject_line}" "${rule[@]}"
    else
      iptables -A INPUT "${rule[@]}"
    fi
    log "Opened ${proto}/${port} in the live firewall."
  fi

  if [ ! -f "${RULES_FILE}" ]; then
    log "No ${RULES_FILE}; ${proto}/${port} will not survive a reboot unless you persist it."
    return
  fi
  if grep -qxF -- "-A INPUT ${rule[*]}" "${RULES_FILE}"; then
    return
  fi
  if grep -q '^-A INPUT -j REJECT' "${RULES_FILE}"; then
    sed -i "0,/^-A INPUT -j REJECT/s//-A INPUT ${rule[*]}\n&/" "${RULES_FILE}"
    log "Saved ${proto}/${port} in ${RULES_FILE}."
  else
    log "No INPUT REJECT line in ${RULES_FILE}; left it unchanged."
  fi
}

open_port tcp 80
open_port tcp 443
open_port udp 443

# --- Docker --------------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  log "Installing Docker Engine and the Compose plugin..."
  "${APT_GET[@]}" update
  "${APT_GET[@]}" install -y ca-certificates curl
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu %s stable\n' \
    "$(dpkg --print-architecture)" "${UBUNTU_CODENAME:-${VERSION_CODENAME}}" \
    >/etc/apt/sources.list.d/docker.list
  "${APT_GET[@]}" update
  "${APT_GET[@]}" install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker

# --- Deploy user -----------------------------------------------------------------
if ! id "${DEPLOY_USER}" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "${DEPLOY_USER}"
  log "Created user ${DEPLOY_USER}."
fi
usermod -aG docker "${DEPLOY_USER}"

ssh_dir="/home/${DEPLOY_USER}/.ssh"
authorized_keys="${ssh_dir}/authorized_keys"
install -d -m 700 -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" "${ssh_dir}"
touch "${authorized_keys}"
if ! grep -qxF "${DEPLOY_PUBLIC_KEY}" "${authorized_keys}"; then
  printf '%s\n' "${DEPLOY_PUBLIC_KEY}" >>"${authorized_keys}"
  log "Added the deploy key for ${DEPLOY_USER}."
fi
chown "${DEPLOY_USER}:${DEPLOY_USER}" "${authorized_keys}"
chmod 600 "${authorized_keys}"

install -d -m 750 -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" "${APP_DIR}"
install -d -m 700 -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" "${APP_DIR}/backups"

# --- Nightly backup timer ----------------------------------------------------------
cat >/etc/systemd/system/fortressauth-backup.service <<EOF
[Unit]
Description=FortressAuth PostgreSQL backup
ConditionPathExists=${APP_DIR}/backup.sh
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
User=${DEPLOY_USER}
WorkingDirectory=${APP_DIR}
ExecStart=/usr/bin/env bash ${APP_DIR}/backup.sh
EOF

cat >/etc/systemd/system/fortressauth-backup.timer <<EOF
[Unit]
Description=Nightly FortressAuth PostgreSQL backup

[Timer]
OnCalendar=*-*-* 02:30:00 UTC
RandomizedDelaySec=15m
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now fortressauth-backup.timer

cat >&2 <<EOF

[bootstrap] Done.

Next, as ${DEPLOY_USER} in ${APP_DIR}:
  1. Create .env and app.env from the examples in deploy/oracle/ (chmod 600).
  2. Run the "Deploy Oracle" GitHub workflow. It copies the Compose files
     here and starts the stack.
EOF
