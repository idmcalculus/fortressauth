# FortressAuth Hetzner Pulumi

Pulumi stack to provision:

- default `dedicated-vm` topology: `app` VM (Docker + Caddy + FortressAuth server image) plus private `db` VM (PostgreSQL)
- optional `co-located-container` topology: a single `app` VM running FortressAuth, Caddy, and PostgreSQL in Docker Compose
- private network/subnet
- app firewall in all modes, plus db firewall in `dedicated-vm`
- spread placement group

## What You Need

- Hetzner API token
- Existing SSH key name(s) already uploaded in Hetzner Cloud
- Admin IP CIDR(s) for SSH access
- Public DNS hostname for API (for example `api.example.com`)
- Public frontend URL used for email links (for example `https://fortressauth.com`)
- Published server Docker image digest (for example `docker.io/<user>/fortressauth@sha256:<digest>`)
- PostgreSQL password
- Optional server env overrides (`appEnv`, `appSecretEnv`)
- SSH private key for remote app deploy updates (`deploySshPrivateKey`)
- Optional Tailscale auth key for private admin access (`tailscaleAuthKey`)

## Files

- `Pulumi.yaml` - Pulumi project definition
- `Pulumi.dev.example.yaml` - stack config template
- `Pulumi.<stack>.yaml` - local stack settings file, ignored from git
- `src/index.ts` - infrastructure and bootstrap logic

## Bootstrap

```bash
cd /Users/idmcalculus/Downloads/fortressauth/packages/infra-hetzner
pnpm install
pulumi login
pulumi stack init dev
cp Pulumi.dev.example.yaml Pulumi.dev.yaml
```

Set secrets and config:

```bash
pulumi config set hcloud:token --secret
pulumi config set fortressauth-hetzner:appDomain api.example.com
pulumi config set fortressauth-hetzner:frontendBaseUrl https://fortressauth.com
pulumi config set fortressauth-hetzner:appImage docker.io/your-user/fortressauth@sha256:<digest>
pulumi config set --path 'fortressauth-hetzner:sshKeyNames[0]' your-hetzner-ssh-key-name
pulumi config set --path 'fortressauth-hetzner:adminIpv4Cidrs[0]' 203.0.113.10/32
pulumi config set fortressauth-hetzner:dbPassword --secret
pulumi config set fortressauth-hetzner:deploySshUser admin
pulumi config set fortressauth-hetzner:deploySshPort 22
cat ~/.ssh/fortressauth_deploy_ci | pulumi config set fortressauth-hetzner:deploySshPrivateKey --secret
pulumi config set fortressauth-hetzner:deploySshPublicKey "$(cat ~/.ssh/fortressauth_deploy_ci.pub)"
```

Use the same deploy key material for the GitHub secret `HETZNER_DEPLOY_SSH_PRIVATE_KEY`.

Optional secrets and config:

```bash
pulumi config set fortressauth-hetzner:location nbg1
pulumi config set fortressauth-hetzner:appServerType cpx21
pulumi config set fortressauth-hetzner:dbServerType cpx31
pulumi config set fortressauth-hetzner:databaseTopology dedicated-vm
pulumi config set fortressauth-hetzner:postgresImage postgres:16-alpine
pulumi config set fortressauth-hetzner:enableTailscale false
pulumi config set fortressauth-hetzner:tailscaleAppHostname fortressauth-dev-app
pulumi config set fortressauth-hetzner:tailscaleDbHostname fortressauth-dev-db
pulumi config set fortressauth-hetzner:enableAppDeploy true
pulumi config set fortressauth-hetzner:dbName fortressauth
pulumi config set fortressauth-hetzner:dbUser fortressauth
pulumi config set --path 'fortressauth-hetzner:appEnv.CORS_ORIGINS' 'https://fortressauth.com,https://react-demo.fortressauth.com,https://vue-demo.fortressauth.com,https://svelte-demo.fortressauth.com,https://angular-demo.fortressauth.com'
pulumi config set --path 'fortressauth-hetzner:appEnv.EMAIL_PROVIDER' console
pulumi config set --path --secret 'fortressauth-hetzner:appSecretEnv.SMTP_PASS' '<smtp-password>'
pulumi config set fortressauth-hetzner:tailscaleAuthKey --secret '<tailscale-auth-key>'
```

Local stack settings files such as `Pulumi.dev.yaml` are ignored from git. Keep them local, and sync the current stack settings into the GitHub environment secret `PULUMI_STACK_SETTINGS_B64` whenever CI/CD should use the updated stack config.

Example sync command:

```bash
cd /Users/idmcalculus/Downloads/fortressauth/packages/infra-hetzner
base64 < Pulumi.dev.yaml | tr -d '\n'
```

Copy that output into the GitHub environment secret `PULUMI_STACK_SETTINGS_B64` for the Hetzner deployment environment.

Update a single env value later:

```bash
pulumi config set --path 'fortressauth-hetzner:appEnv.EMAIL_PROVIDER' ses
```

## Database Topologies

- `dedicated-vm` is the default and preserves the existing split-VM layout. Existing stacks do not change until `fortressauth-hetzner:databaseTopology` is explicitly switched.
- `co-located-container` skips the db VM and db firewall, sets `DATABASE_URL=postgresql://<dbUser>:<dbPassword>@postgres:5432/<dbName>?sslmode=disable`, and runs PostgreSQL in Docker Compose on the app VM.
- `fortressauth-hetzner:postgresImage` controls the PostgreSQL image in `co-located-container` mode and defaults to `postgres:16-alpine`.
- In `co-located-container` mode, PostgreSQL stores data in the named Docker volume `postgres_data`, initializes `pgcrypto` on first boot, and writes daily local `pg_dump -Fc` backups on the app VM, retaining 7 days in `/var/backups/postgresql`.
- Outputs stay stable across modes: `dbServerId` becomes `co-located` in single-node mode, `databaseUrlTemplate` reflects the active topology, and `sshDbViaApp` becomes an app-VM command pattern for `docker compose exec postgres psql`.

## Tailscale Admin Access

- Set `fortressauth-hetzner:enableTailscale=true` to install Tailscale during server bootstrap and join the node to your tailnet with `fortressauth-hetzner:tailscaleAuthKey`.
- `fortressauth-hetzner:tailscaleAppHostname` defaults to `${namePrefix}-app`; `fortressauth-hetzner:tailscaleDbHostname` defaults to `${namePrefix}-db`.
- When enabled, stack outputs `sshAppTailscale`, `sshDbTailscale`, `tailscaleAppHostnameOutput`, and `tailscaleDbHostnameOutput` provide the preferred admin endpoints.
- This package currently keeps public SSH/firewall behavior unchanged so existing `pulumi up` and GitHub Actions deploys continue to work. Use Tailscale for day-to-day admin SSH, but keep at least one break-glass public SSH path until the deploy workflow is also moved onto the tailnet.
- If you use a self-hosted control plane such as Headscale, set `fortressauth-hetzner:tailscaleControlUrl` as well.

Example Tailscale-enabled single-node config:

```bash
pulumi config set fortressauth-hetzner:databaseTopology co-located-container
pulumi config set fortressauth-hetzner:appServerType cx23
pulumi config set fortressauth-hetzner:enableBackups true
pulumi config set fortressauth-hetzner:enableTailscale true
pulumi config set fortressauth-hetzner:tailscaleAppHostname fortressauth-app
pulumi config set fortressauth-hetzner:tailscaleAuthKey --secret '<tailscale-auth-key>'
```

After deployment, your local SSH config can point at the MagicDNS hostname from the stack output:

```sshconfig
Host fortressauth-app
  Hostname fortressauth-app
  User admin
  IdentityFile ~/.ssh/fortressauth_deploy_ci
  IdentitiesOnly yes
```

If Tailscale shows a suffixed hostname such as `fortressauth-app-1`, that usually means an older offline node still exists with the original name. Remove the stale node in the Tailscale admin console, then run `sudo tailscale set --hostname=fortressauth-app` on the VM to reclaim the unsuffixed hostname.

## Recommended Low-Cost Single-Node Config

For low-traffic deployments that still want an always-on VM and the existing Docker/Pulumi flow:

```bash
pulumi config set fortressauth-hetzner:databaseTopology co-located-container
pulumi config set fortressauth-hetzner:appServerType cx23
pulumi config set fortressauth-hetzner:enableBackups true
```

Keep Redis disabled unless you scale to multiple app instances. Resend and the rest of the application env stay unchanged.


Preview first:

```bash
pulumi preview --diff
```

`pulumi up` and `pulumi destroy` make destructive or billable infrastructure changes. Do not run them until the preview has been reviewed and explicitly approved.

Apply or destroy only when approved:

```bash
pulumi up
pulumi destroy
```

## DNS

After `pulumi up`, point your DNS `A` record for `appDomain` to output `appPublicIpv4`.
If you publish an `AAAA` record, point it to `appPublicIpv6`.

## Notes

- DB is private-only in `dedicated-vm` mode and co-located on the app VM in `co-located-container` mode.
- Use output `sshDbViaApp` for the active access pattern. In single-node mode it resolves to an app-VM command that opens `psql` inside the PostgreSQL container.
- If Tailscale is enabled, prefer `sshAppTailscale` and `sshDbTailscale` for admin access.
- Hetzner server backups can be enabled with `enableBackups=true` (default).
- Server delete/rebuild protection defaults to `true` only for `prod`/`production` stacks; non-production stacks default to `false` so replacements do not require a manual protection toggle. Override with `fortressauth-hetzner:protectServers` if needed.
- PostgreSQL includes a daily local `pg_dump` backup job (`/usr/local/bin/pg_daily_backup.sh`) on the db VM in `dedicated-vm` mode and on the app VM in `co-located-container` mode.
- For production-grade recovery (PITR/offsite), add WAL archiving to external object storage.
- App deploys are performed by Pulumi over SSH whenever `appImage` changes.
- `frontendBaseUrl` controls `BASE_URL` for email verification/reset links separately from the API hostname.
- Cookie defaults now assume the recommended shared top-level domain topology and use `SameSite=lax`. Override with `fortressauth-hetzner:cookieSameSite` and `fortressauth-hetzner:csrfCookieSameSite` only if your frontend/API are on different top-level domains.

## Dedicated-To-Co-Located Cutover Runbook

1. Merge the code/docs change while the live stack stays on `dedicated-vm`.
2. On the current db VM, create and verify a dump before changing topology:

```bash
ssh admin@<db-vm>
sudo /usr/local/bin/pg_daily_backup.sh
sudo ls -lh /var/backups/postgresql/fortressauth_*.dump
```

3. Copy the newest dump off the db VM and verify it is non-empty:

```bash
scp admin@<db-vm>:/var/backups/postgresql/fortressauth_<timestamp>.dump .
test -s fortressauth_<timestamp>.dump
```

4. Change the stack config:

```bash
pulumi config set fortressauth-hetzner:databaseTopology co-located-container
pulumi config set fortressauth-hetzner:appServerType cx23
pulumi config set fortressauth-hetzner:enableBackups true
```

5. Run `pulumi preview --diff`. The expected paid-resource reduction is removal of the db VM and db firewall. Do not apply the change unless that preview is explicitly approved.
6. After an approved `pulumi up`, copy the dump to the app VM, stop the app container, restore into the co-located PostgreSQL container, then start the app again:

```bash
scp fortressauth_<timestamp>.dump admin@<app-vm>:/tmp/
ssh admin@<app-vm>
cd /opt/fortressauth
sudo docker compose stop app
sudo docker compose exec -T postgres sh -lc 'pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' </tmp/fortressauth_<timestamp>.dump
sudo docker compose start app
```

7. Verify the deployment:

```bash
curl -fsS https://api.fortressauth.com/health
curl -fsS https://api.fortressauth.com/openapi.json
```

Also verify at least one auth flow or an existing-user lookup and confirm the migrated user/session tables exist in PostgreSQL.

## GitHub Actions CD

The workflow `.github/workflows/deploy-hetzner.yml` deploys automatically after CI passes on `main` (or manually via `workflow_dispatch`).

CI is change-aware:

- `.github/workflows/ci.yml` always publishes a stable `ci-status` result for branch protection.
- Package/example/docker jobs are skipped when the changed files do not affect them, so docs-only and infra-only changes do not burn the full matrix.
- `.github/workflows/deploy-hetzner.yml` always builds and pushes a fresh application image for each successful `main` deployment (and for `workflow_dispatch`) so the live stack cannot drift behind `main`.
- The deploy workflow temporarily allows the active GitHub runner IPv4 on SSH during `pulumi up`, then runs a cleanup `pulumi up` to remove that temporary firewall rule.
- The deploy workflow smoke-tests both `/health` and `/openapi.json` after deployment to catch stale docs/spec rollouts.

Required repository secrets:

- `DOCKER_USERNAME`
- `DOCKER_PASSWORD`
- `PULUMI_ACCESS_TOKEN`
- `PULUMI_STACK_SETTINGS_B64` (base64-encoded contents of the local `Pulumi.<stack>.yaml` file)
- `HETZNER_DEPLOY_SSH_PRIVATE_KEY` (private key matching a configured admin SSH key)

Required repository variable:

- `PULUMI_STACK` (example: `idmcalculus/fortressauth-hetzner/dev`)

Deployment process going forward:

1. Update local stack config with `pulumi config set ...` in `packages/infra-hetzner`.
2. Refresh the GitHub environment secret `PULUMI_STACK_SETTINGS_B64` from the current local `Pulumi.<stack>.yaml`.
3. Push code to `main` or trigger `workflow_dispatch`.
4. GitHub Actions writes the stack settings file at runtime, sets the deploy image and SSH key overrides, runs `pulumi preview --diff`, then `pulumi up`.
