# FortressAuth on Oracle Cloud Always Free

This runs the FortressAuth API on one Oracle Cloud Ampere A1 VM with Docker
Compose: Caddy for HTTPS, the server, and PostgreSQL 17. It replaces the AWS
stacks in `packages/infra-aws` (ALB, Fargate and RDS for dev and prod), which
cost about $131 a month. Within Oracle's Always Free limits it costs nothing.

Oracle's Always Free tier gives each account 2 OCPUs and 12 GB of memory on
the `VM.Standard.A1.Flex` shape. Oracle cut this from 4 OCPUs and 24 GB in
June 2026. The tier also includes 200 GB of block storage and 20 GB of
Object Storage. You can only create Always Free A1 servers in your home
region, which you pick at sign-up and cannot change.

## Files

| File | Purpose |
| --- | --- |
| `docker-compose.yml` | The stack: `caddy`, `app`, `postgres`, and the optional `keepalive` |
| `Caddyfile` | HTTPS and reverse proxy for every name in `APP_DOMAIN` |
| `.env.example` | Compose settings: names, image, Postgres password, keep-alive, backups |
| `app.env.example` | Server settings and secrets |
| `keepalive.mjs` | Holds memory so Oracle does not reclaim the VM as idle |
| `bootstrap-vm.sh` | One-time VM setup: firewall, Docker, deploy user, backup timer |
| `deploy.sh` | Runs on the VM for each deploy |
| `backup.sh` | Nightly `pg_dump`, with an optional copy to Object Storage |
| `.github/workflows/deploy-oracle.yml` | Builds the arm64 image, pushes it to GHCR and deploys it |
| `scripts/aws-export-app-env.sh` | Copies secrets out of AWS Secrets Manager in `app.env` format |
| `packages/infra-oracle` | Pulumi stack for the network, the VM and the backup bucket |

When everything works here, tear down AWS with
[`packages/infra-aws/TEARDOWN.md`](../../packages/infra-aws/TEARDOWN.md).

## 1. Create the VM with Pulumi

[`packages/infra-oracle`](../../packages/infra-oracle/README.md) creates the
network, the VM and the backup bucket. It also runs `bootstrap-vm.sh` on the
VM's first boot. Follow that README to the end of "First run", then carry on
with section 3 here. The steps below call the VM's public IP `<vm-ip>`
(`pulumi stack output instancePublicIp`).

The bootstrap script opens ports 80 and 443 in the host firewall, installs
Docker, and creates a `deploy` user that can run Docker but not `sudo`. It
also creates `/opt/fortressauth` and adds a nightly backup timer. Anyone
with the deploy key can control Docker, which amounts to root on the VM, so
guard the key like a root key.

## 2. Or create the VM by hand

Skip this section if you used Pulumi.

1. Sign up at [cloud.oracle.com](https://cloud.oracle.com). Pick a home region
   near your users, such as UK South (London) or Germany Central (Frankfurt).
2. Go to **Networking → Virtual Cloud Networks → Start VCN Wizard → Create VCN
   with Internet Connectivity** and accept the defaults.
3. Open the new VCN's public subnet, then its **Default Security List**. Add
   ingress rules from `0.0.0.0/0` for TCP 80, TCP 443 and UDP 443 (UDP 443
   carries HTTP/3 and is optional). SSH on TCP 22 is already open.
4. Go to **Compute → Instances → Create instance**:
   - Image: Canonical Ubuntu 24.04. Oracle picks the aarch64 build for A1.
   - Shape: `VM.Standard.A1.Flex`, 2 OCPUs, 12 GB memory.
   - Networking: the public subnet, with a public IPv4 address.
   - SSH key: your own public key. It logs you in as `ubuntu`, the admin user.
   - Boot volume: the 50 GB default is plenty.

   "Out of host capacity" means the region has no free A1 space at that
   moment. Try another availability domain, a smaller shape (1 OCPU, 6 GB),
   or try again later.
5. Note the instance's public IP. The steps below call it `<vm-ip>`.
6. Make a key that only GitHub Actions uses, then run the bootstrap script as
   `ubuntu`, passing the new public key. You can run it again safely.

   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/fortressauth-deploy -N '' -C fortressauth-deploy
   ssh ubuntu@<vm-ip> "sudo bash -s -- '$(cat ~/.ssh/fortressauth-deploy.pub)'" < deploy/oracle/bootstrap-vm.sh
   ```

7. For off-VM backups, create a bucket and upload URL as described under
   [Backups](#backups).

## 3. Write the settings

Copy the current secrets out of AWS first, since AWS deletes them 7 days
after the teardown:

```bash
aws sso login --profile fortressauth-prod
scripts/aws-export-app-env.sh prod ./app.env.from-aws
```

Put the two example files on the VM and lock them down:

```bash
scp -i ~/.ssh/fortressauth-deploy deploy/oracle/.env.example deploy@<vm-ip>:/opt/fortressauth/.env
scp -i ~/.ssh/fortressauth-deploy deploy/oracle/app.env.example deploy@<vm-ip>:/opt/fortressauth/app.env
ssh -i ~/.ssh/fortressauth-deploy deploy@<vm-ip> 'chmod 600 /opt/fortressauth/.env /opt/fortressauth/app.env'
```

Then edit them on the VM (`ssh -i ~/.ssh/fortressauth-deploy deploy@<vm-ip>`):

- `.env`: set `APP_DOMAIN` to a spare name for now, such as
  `oci-api.fortressauth.com`. Set `POSTGRES_PASSWORD` to the output of
  `openssl rand -hex 32`. Set `KEEPALIVE_MEMORY_MB` to about a quarter of the
  VM's memory.
- `app.env`: merge in the lines from `app.env.from-aws`, add the SES key from
  the next section, and uncomment the OAuth providers you use. Then delete
  `app.env.from-aws` from your machine.

### SES access key

On AWS the server sent mail through the Fargate task's IAM role. The VM needs
an access key instead. Find the AWS account that owns the `fortressauth.com`
identity (`aws sesv2 list-email-identities`). In that account, create an IAM
user such as `fortressauth-ses-sender` with only this policy, then create an
access key for it:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["ses:SendEmail", "ses:SendRawEmail"],
      "Resource": "*",
      "Condition": { "StringEquals": { "ses:FromAddress": "noreply@fortressauth.com" } }
    }
  ]
}
```

Put the key in `SES_ACCESS_KEY_ID` and `SES_SECRET_ACCESS_KEY`. SES costs a
few cents a month at this volume. To leave AWS entirely, set
`EMAIL_PROVIDER=resend` and `RESEND_API_KEY` instead.

## 4. Point a spare name at the VM

At your DNS provider, add an A record for `oci-api.fortressauth.com` pointing
at `<vm-ip>`. Leave `api.fortressauth.com` on AWS for now.

## 5. Connect GitHub and deploy

GitHub only lets you run a workflow that is on `main`, so merge
`deploy-oracle.yml` first. Then create the `oracle-prod` environment and its
settings:

```bash
gh api -X PUT repos/idmcalculus/fortressauth/environments/oracle-prod
gh variable set ORACLE_SSH_HOST --env oracle-prod --body '<vm-ip>'
gh variable set ORACLE_SSH_USER --env oracle-prod --body deploy
gh variable set ORACLE_APP_URL --env oracle-prod --body 'https://oci-api.fortressauth.com'
gh secret set ORACLE_SSH_PRIVATE_KEY --env oracle-prod < ~/.ssh/fortressauth-deploy
ssh-keyscan -t ed25519 <vm-ip> | gh secret set ORACLE_SSH_KNOWN_HOSTS --env oracle-prod
```

Check that the host key from `ssh-keyscan` matches the VM's own:
`ssh ubuntu@<vm-ip> ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`. In the
environment's settings on GitHub, limit deployments to the `main` branch.

Run the first deploy:

```bash
gh workflow run deploy-oracle.yml --ref main
```

The build job runs on GitHub's arm64 runner, which is free for public
repositories. The deploy job copies the Compose files to the VM, pulls the
image and waits for every container to report healthy. Then it checks
`/health` and `/openapi.json` at `ORACLE_APP_URL`.

Once a manual run passes, turn on deploys after every green CI run on `main`:

```bash
gh variable set ORACLE_DEPLOY_ENABLED --body true
```

## 6. Move the data (optional)

With only test users, an empty database is fine. To keep the existing
accounts, dump RDS and restore it on the VM.

1. Open a tunnel to prod RDS. It needs a running Fargate task, and `--print`
   shows the password:

   ```bash
   scripts/aws-db-tunnel.sh prod
   ```

2. In another terminal, dump through the tunnel. This uses Docker so the
   `pg_dump` version matches PostgreSQL 17:

   ```bash
   docker run --rm -v "$PWD:/out" postgres:17-alpine pg_dump \
     "postgresql://fortressauth:<password>@host.docker.internal:15432/fortressauth?sslmode=require" \
     --format custom --no-owner --no-privileges --file /out/fortressauth-rds.dump
   ```

3. Copy the dump over and restore it into an empty database:

   ```bash
   scp -i ~/.ssh/fortressauth-deploy fortressauth-rds.dump deploy@<vm-ip>:/opt/fortressauth/backups/
   ssh -i ~/.ssh/fortressauth-deploy deploy@<vm-ip>
   cd /opt/fortressauth
   docker compose stop app
   docker compose exec -T postgres dropdb --username fortressauth --force fortressauth
   docker compose exec -T postgres createdb --username fortressauth fortressauth
   docker compose exec -T postgres pg_restore --username fortressauth --dbname fortressauth \
     --no-owner --no-privileges < backups/fortressauth-rds.dump
   docker compose start app
   ```

   The server applies any newer migrations when it starts. The same steps
   restore one of the nightly backups.

## 7. Move api.fortressauth.com over

1. A day ahead, lower the TTL on the `api.fortressauth.com` record to 300
   seconds.
2. On the VM, add the real name to `.env` and restart Caddy:

   ```bash
   sed -i 's/^APP_DOMAIN=.*/APP_DOMAIN=api.fortressauth.com,oci-api.fortressauth.com/' .env
   docker compose up -d caddy
   ```

   Caddy keeps retrying the certificate for `api.fortressauth.com` until DNS
   points at the VM.
3. Replace the `api.fortressauth.com` CNAME (it points at the ALB) with an A
   record for `<vm-ip>`.
4. When `curl -sI https://api.fortressauth.com/health` shows `via: 1.1 Caddy`,
   the VM is answering. Set `ORACLE_APP_URL` to
   `https://api.fortressauth.com`.
5. On fortressauth.com, sign in, sign in with an OAuth provider, and send a
   password reset email.

Give it a few days, then follow
[`packages/infra-aws/TEARDOWN.md`](../../packages/infra-aws/TEARDOWN.md).

## Keeping the VM from being reclaimed

Oracle reclaims an Always Free VM that it counts as idle. An A1 VM counts as
idle only when all three of these hold over 7 days:

- CPU use at the 95th percentile is under 20%
- Network use is under 20%
- Memory use is under 20%

FortressAuth with a handful of users would meet all three. The `keepalive`
service breaks the memory condition: it fills `KEEPALIVE_MEMORY_MB` of RAM
with random bytes and holds it, using no CPU. The `COMPOSE_PROFILES=keepalive`
line in `.env` turns it on.

To check it, open the instance in the OCI Console and go to **Metrics →
Memory Utilization**. The chart should stay above 20%. It needs the Oracle
Cloud Agent's Compute Instance Monitoring plugin, which Oracle's own images
turn on by default.

To turn it off, delete the `COMPOSE_PROFILES` line from `.env` and run
`docker compose --profile keepalive rm -sf keepalive`.

Oracle cut the free limits in June 2026 without notice and could change this
rule the same way, so look at that chart now and then. Upgrading the account
to Pay As You Go is widely reported to stop reclamation while Always Free
resources stay free, but Oracle's documentation does not say so.

## Backups

The `fortressauth-backup` timer runs `backup.sh` at 02:30 UTC each night. It
writes `backups/fortressauth-<time>.dump` and deletes local dumps older than
`BACKUP_KEEP_DAYS`.

- See when it last ran: `systemctl list-timers fortressauth-backup.timer`
- Run one now, as `deploy` in `/opt/fortressauth`: `./backup.sh`
- Restore: the steps in section 6, using a file from `backups/`

A dump that only lives on the VM is lost with the VM, so set
`BACKUP_PAR_URL` in `.env` to keep copies in OCI Object Storage. That URL can
write new objects but cannot read or list them.

- With Pulumi: the stack creates the bucket and URL. Get it with
  `pulumi stack output backupUploadUrl --show-secrets`.
- By hand: create a bucket in Object Storage, then **Create Pre-Authenticated
  Request → Bucket → Permit object writes**, with an expiry date well ahead.
  The URL ends in `/o/`.

## Day to day

As `deploy` in `/opt/fortressauth`:

- Logs: `docker compose logs -f app`
- Status: `docker compose ps`
- Restart the server: `docker compose restart app`
- Roll back: `./deploy.sh ghcr.io/idmcalculus/fortressauth-server:sha-<older-commit>`

Ubuntu installs security updates by itself. Reboot now and then with
`sudo reboot` as `ubuntu`; the containers start again on their own.

## Moving off Oracle later

The stack runs on any Linux host with Docker. For an x86 host, such as
Hetzner or AWS Lightsail, change `platforms` to `linux/amd64` and `runs-on`
to `ubuntu-latest` in the build job. Then bootstrap the new host, restore the
latest dump and move DNS.
