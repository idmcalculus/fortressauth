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
- Published server Docker image (for example `ghcr.io/<org>/<image>:<tag>`)
- PostgreSQL password
- Optional server env overrides (`appEnv`, `appSecretEnv`)

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
pulumi config set fortressauth-hetzner:appImage ghcr.io/your-org/fortressauth-server:latest
pulumi config set --path 'fortressauth-hetzner:sshKeyNames[0]' your-hetzner-ssh-key-name
pulumi config set --path 'fortressauth-hetzner:adminIpv4Cidrs[0]' 203.0.113.10/32
pulumi config set fortressauth-hetzner:dbPassword --secret
```

Optional secrets and config:

```bash
pulumi config set fortressauth-hetzner:location nbg1
pulumi config set fortressauth-hetzner:appServerType cpx21
pulumi config set fortressauth-hetzner:dbServerType cpx31
pulumi config set fortressauth-hetzner:dbName fortressauth
pulumi config set fortressauth-hetzner:dbUser fortressauth
pulumi config set --path 'fortressauth-hetzner:appEnv.CORS_ORIGINS' https://landing.example.com
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

## Notes

- DB is private-only (no public IPv4/IPv6).
- Access DB host using jump host output: `sshDbViaApp`.
- Hetzner server backups can be enabled with `enableBackups=true` (default).
- PostgreSQL includes a daily local `pg_dump` backup job (`/usr/local/bin/pg_daily_backup.sh`).
- For production-grade recovery (PITR/offsite), add WAL archiving to external object storage.
