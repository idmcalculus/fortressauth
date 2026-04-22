# FortressAuth Hetzner Pulumi

Pulumi stack to provision:

- `app` VM (Docker + Caddy + FortressAuth server image)
- `db` VM (PostgreSQL, private-only)
- private network/subnet
- app and db firewalls
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

## Files

- `Pulumi.yaml` - Pulumi project definition
- `Pulumi.dev.example.yaml` - stack config template
- `src/index.ts` - infrastructure and bootstrap logic

## Bootstrap

```bash
cd /Users/idmcalculus/Downloads/fortressauth/packages/infra-hetzner
pnpm install
pulumi login
pulumi stack init dev
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
pulumi config set fortressauth-hetzner:enableAppDeploy true
pulumi config set fortressauth-hetzner:dbName fortressauth
pulumi config set fortressauth-hetzner:dbUser fortressauth
pulumi config set --path 'fortressauth-hetzner:appEnv.CORS_ORIGINS' 'https://fortressauth.com,https://react-demo.fortressauth.com,https://vue-demo.fortressauth.com,https://svelte-demo.fortressauth.com,https://angular-demo.fortressauth.com'
pulumi config set --path 'fortressauth-hetzner:appEnv.EMAIL_PROVIDER' console
pulumi config set --path --secret 'fortressauth-hetzner:appSecretEnv.SMTP_PASS' '<smtp-password>'
```

Update a single env value later:

```bash
pulumi config set --path 'fortressauth-hetzner:appEnv.EMAIL_PROVIDER' ses
```


Preview + apply:

```bash
pulumi preview
pulumi up
```

Destroy:

```bash
pulumi destroy
```

## DNS

After `pulumi up`, point your DNS `A` record for `appDomain` to output `appPublicIpv4`.
If you publish an `AAAA` record, point it to `appPublicIpv6`.

## Notes

- DB is private-only (no public IPv4/IPv6).
- Access DB host using jump host output: `sshDbViaApp`.
- Hetzner server backups can be enabled with `enableBackups=true` (default).
- Server delete/rebuild protection defaults to `true` only for `prod`/`production` stacks; non-production stacks default to `false` so replacements do not require a manual protection toggle. Override with `fortressauth-hetzner:protectServers` if needed.
- PostgreSQL includes a daily local `pg_dump` backup job (`/usr/local/bin/pg_daily_backup.sh`).
- For production-grade recovery (PITR/offsite), add WAL archiving to external object storage.
- App deploys are performed by Pulumi over SSH whenever `appImage` changes.
- `frontendBaseUrl` controls `BASE_URL` for email verification/reset links separately from the API hostname.
- Cookie defaults now assume the recommended shared top-level domain topology and use `SameSite=lax`. Override with `fortressauth-hetzner:cookieSameSite` and `fortressauth-hetzner:csrfCookieSameSite` only if your frontend/API are on different top-level domains.

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
- `HETZNER_DEPLOY_SSH_PRIVATE_KEY` (private key matching a configured admin SSH key)

Required repository variable:

- `PULUMI_STACK` (example: `idmcalculus/fortressauth-hetzner/dev`)
