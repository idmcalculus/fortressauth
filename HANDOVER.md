# FortressAuth: Hetzner → AWS Migration Handover

**Status**: Migration complete. `https://api.fortressauth.com` is live on AWS, serving production traffic.

This document is for the next agent / continuation thread. Read it top to bottom before touching anything.

---

## 1. Where We Landed

### Production (`api.fortressauth.com`)

| Component | Choice |
| --- | --- |
| Region | `eu-west-1` (Ireland) |
| AWS account | `437040615654` (`fortressauth-prod`) |
| Compute | ECS Fargate, single task, 0.25 vCPU / 0.5 GB RAM |
| Edge/TLS | Application Load Balancer + ACM cert (TLS 1.3) |
| DNS | Route 53 hosted zone for `api.fortressauth.com` (subdomain delegation from Namecheap) |
| Database | RDS PostgreSQL 17.10, `db.t4g.micro`, single-AZ, gp3 20 GB, deletion protection ON, automated backups 7d |
| Image registry | ECR private (`437040615654.dkr.ecr.eu-west-1.amazonaws.com/fortressauth-prod/server`) |
| Secrets | AWS Secrets Manager, populated post-deploy via CLI |
| Email | Amazon SES via `fortressauth.com` domain identity (DKIM + SPF + DMARC + custom MAIL FROM at `send.fortressauth.com`) |
| Logs | CloudWatch `/ecs/fortressauth-prod` (30d retention) |
| Networking | 2-AZ VPC, public + private subnets, NO NAT Gateway (tasks in public subnets with `assignPublicIp=true`) |
| Pulumi stack | `idmcalculus/fortressauth-aws/prod` |
| Deploy | GitHub Actions OIDC → AWS, builds image to ECR, runs `pulumi up`, smoke tests `/health` and `/openapi.json` |

### Development (`dev-api.fortressauth.com`)

Same shape as prod, in account `552072248716` (`fortressauth-dev`). Deletion protection OFF, backup retention 1d, `EMAIL_PROVIDER=console` (logs verification URLs to CloudWatch instead of sending real email).

### What's Gone

- **Hetzner**: `pulumi destroy` ran successfully, stack removed, Hetzner servers terminated. `packages/infra-hetzner/` deleted from repo. `.github/workflows/deploy-hetzner.yml` deleted. All references cleaned out of README/CONTRIBUTING/AGENTS/PUBLISHING.
- **Docker Hub for deploy**: prod deploy now goes through ECR. Docker Hub is still used by the `Publish` workflow for public consumer images (`docker.io/<DOCKER_USERNAME>/fortressauth:vX.Y.Z`).

---

## 2. Architecture

```
                            ┌───────────────────────────────────┐
                            │  Namecheap DNS (apex + dev-api    │
                            │  + api NS delegation to Route 53) │
                            └─────────────────┬─────────────────┘
                                              │
                                              ▼
   ┌────────────────────────────────────────────────────────────────────┐
   │ AWS account fortressauth-prod (437040615654, eu-west-1)            │
   │                                                                    │
   │  Route 53 (api.fortressauth.com)  ─────►  ALB (HTTPS, ACM cert)    │
   │                                              │                     │
   │                                              ▼                     │
   │  ECS Fargate cluster (1 task)  ◄─── Image from ECR Private         │
   │      │                                                             │
   │      │ task role: SES SendEmail (scoped), SSM Exec channels        │
   │      │ exec role: read Secrets Manager                             │
   │      │ env vars: BASE_URL, COOKIE_SAMESITE, etc.                   │
   │      │ secrets:  DATABASE_URL, RESEND_API_KEY, OAuth secrets, ...  │
   │      ▼                                                             │
   │  RDS PostgreSQL 17.10 (private subnets, encrypted, automated bkup) │
   │                                                                    │
   │  SES configuration set "fortressauth-prod-events"                  │
   │      │ events: BOUNCE, COMPLAINT, REJECT, RENDERING_FAILURE, …     │
   │      ▼                                                             │
   │  SNS topic ─► email subscription to damilola.ige+ses-bounces@…     │
   │                                                                    │
   │  Secrets Manager:                                                  │
   │      fortressauth-prod/db/password    (auto-generated)             │
   │      fortressauth-prod/app/DATABASE_URL    (auto-assembled)        │
   │      fortressauth-prod/app/RESEND_API_KEY  (operator-populated)    │
   │      fortressauth-prod/app/<OAUTH>_CLIENT_SECRET  (operator)       │
   │                                                                    │
   │  ECR private repo "fortressauth-prod/server"                       │
   │  CloudWatch Logs "/ecs/fortressauth-prod"                          │
   └────────────────────────────────────────────────────────────────────┘

   Deploy path:
     git push origin main
       └─► CI (lint, typecheck, test, build, docker smoke test)
            └─► Deploy AWS workflow (auto for aws-dev, manual+approval for aws-prod)
                 └─► OIDC assume-role → ECR push → pulumi up → smoke /health
```

---

## 3. Authoritative Resource IDs and Refs

### Pulumi
- Org: `idmcalculus`
- Stacks: `fortressauth-aws/dev`, `fortressauth-aws/prod`
- Pulumi access token stored in GitHub Environment secrets (`PULUMI_ACCESS_TOKEN`)

### AWS Accounts
| Account | ID | Purpose |
| --- | --- | --- |
| Jaydeetech (mgmt) | `275859940703` | AWS Organizations management. No workloads. |
| fortressauth-dev | `552072248716` | Dev workloads. |
| fortressauth-prod | `437040615654` | Production workloads. |

OU layout: `Root → Workloads → fortressauth-dev, fortressauth-prod`. Management account (Jaydeetech) stays at Root.

### IAM Identity Center
- Lives in `us-east-1` (cross-region; doesn't matter where workloads run).
- SSO start URL: `https://d-90660ff58c.awsapps.com/start`
- SSO session in `~/.aws/config`: `jaydeetech`
- Profiles: `fortressauth-dev`, `fortressauth-prod` (both with `AdministratorAccess` for now)

### GitHub
- Repo: `idmcalculus/fortressauth`
- Environments:
  - `aws-dev` → vars: `AWS_REGION=eu-west-1`, `AWS_ROLE_TO_ASSUME=arn:aws:iam::552072248716:role/github-actions-fortressauth-deploy`, `PULUMI_STACK=idmcalculus/fortressauth-aws/dev`. Secret: `PULUMI_ACCESS_TOKEN`.
  - `aws-prod` → same shape with prod ARN. Required reviewer: `idmcalculus`. Restricted to `main` branch.
  - `hetzner` → **delete this**, no longer used.
  - `netlify` → present but not yet wired up properly (see Next Steps §2).
- Per-account OIDC role: `github-actions-fortressauth-deploy` with broad permissions (PowerUserAccess + IAM scope inline policy). Created by `scripts/aws-bootstrap.sh`. **Plan**: tighten with `PERMISSION_MODE=narrow` later.

### DNS (at Namecheap, fortressauth.com)
| Host | Type | Value | Purpose |
| --- | --- | --- | --- |
| `@` | TXT | `v=spf1 include:amazonses.com ~all` | SPF on apex |
| `_dmarc` | TXT | `v=DMARC1; p=none; rua=mailto:damilola.ige+dmarc@jaydeetechltd.com` | DMARC |
| `send` | TXT | `v=spf1 include:amazonses.com ~all` | SES MAIL FROM SPF |
| `send` | MX | `feedback-smtp.eu-west-1.amazonses.com` priority 10 | SES bounces |
| `<3 SES tokens>._domainkey` | CNAME | `<token>.dkim.amazonses.com` | DKIM |
| `api` | NS | (4 AWS Route 53 nameservers, prod) | api subdomain delegation |
| `dev-api` | NS | (4 AWS Route 53 nameservers, dev) | dev-api subdomain delegation |

If migrating DNS later (e.g. to Cloudflare for proxying), be careful to keep all of those.

### Critical Outputs to Re-discover
```bash
# Get current Pulumi outputs for each stack:
pulumi stack output --stack idmcalculus/fortressauth-aws/dev --json
pulumi stack output --stack idmcalculus/fortressauth-aws/prod --json
```

Includes: `appUrl`, `albDnsName`, `dbEndpoint`, `databaseUrlSecretArn`, `ecrRepositoryUrl`, `hostedZoneNameServers`, `taskRoleArn`, etc.

---

## 4. Daily Operation Commands

### Local AWS auth
```bash
# Pick a profile per task. Always set this — the Pulumi account guard refuses
# wrong-account applies, but it's still good hygiene.
export AWS_PROFILE=fortressauth-dev   # or fortressauth-prod
aws sts get-caller-identity --query Account --output text
# Should return 552072248716 or 437040615654

# When SSO session expires (8h):
aws sso login --profile fortressauth-dev
aws sso login --profile fortressauth-prod
```

### Connect to RDS via TablePlus / psql / DBeaver
```bash
# Open SSM tunnel (foreground; leave running)
./scripts/aws-db-tunnel.sh dev          # or prod

# Variants:
./scripts/aws-db-tunnel.sh dev --psql   # tunnel + drop into psql
./scripts/aws-db-tunnel.sh dev --print  # just print connection details
```

Then in TablePlus: Host `127.0.0.1`, Port `15432`, SSL `require`. Password is printed by the script.

### Open a shell inside a running ECS task
```bash
./scripts/aws-ecs-shell.sh dev                                 # /bin/sh in app container
./scripts/aws-ecs-shell.sh dev --command 'env | grep SES_'     # one-shot command
./scripts/aws-ecs-shell.sh prod --task <task-id>               # specific task
```

### Tail CloudWatch logs
```bash
aws logs tail /ecs/fortressauth-dev --follow --region eu-west-1 --profile fortressauth-dev
aws logs tail /ecs/fortressauth-prod --follow --region eu-west-1 --profile fortressauth-prod
```

### Populate runtime secrets (post-deploy)
```bash
aws secretsmanager put-secret-value \
  --secret-id fortressauth-prod/app/RESEND_API_KEY \
  --secret-string 're_xxxxxxxxxxxxx' \
  --region eu-west-1 --profile fortressauth-prod

# Then force a new deployment so the running task picks up the value
aws ecs update-service \
  --cluster fortressauth-prod-cluster \
  --service "$(pulumi stack output ecsServiceName --stack idmcalculus/fortressauth-aws/prod)" \
  --force-new-deployment \
  --region eu-west-1 --profile fortressauth-prod
```

### Force a redeploy without code change
```bash
cd packages/infra-aws
export AWS_PROFILE=fortressauth-prod
pulumi up --stack idmcalculus/fortressauth-aws/prod
# If no diff is detected but you need to reroll the task, use update-service above
```

### Bootstrap a new AWS account for OIDC + IAM role
```bash
EXPECTED_ACCOUNT_ID=<12-digit-id> \
EXPECTED_ACCOUNT_ALIAS=<alias-substring> \
AWS_PROFILE=<profile> \
./scripts/aws-bootstrap.sh

# Tighten permissions later (post-stack-stable):
PERMISSION_MODE=narrow ./scripts/aws-bootstrap.sh
```

---

## 5. The Pulumi Stack: `packages/infra-aws/`

### Files
```
packages/infra-aws/
  Pulumi.yaml                  # project def
  Pulumi.dev.example.yaml      # template
  Pulumi.prod.example.yaml     # template
  Pulumi.dev.yaml              # ✅ committed; stack config for dev
  Pulumi.prod.yaml             # ✅ committed; stack config for prod
  src/
    index.ts                   # composes the stack + account guard
    config.ts                  # typed config loader, validation
    network.ts                 # VPC, subnets, security groups
    secrets.ts                 # Secrets Manager + RDS password generation
    ecr.ts                     # ECR repo + lifecycle policy
    email.ts                   # SES configuration set + SNS bounce topic + topic policy
    dns.ts                     # Route 53 zone + ACM cert (DNS-validated, bootstrap-aware)
    database.ts                # RDS PostgreSQL 17 instance, parameter group, subnet group
    container.ts               # ECS cluster, task def, Fargate service, ALB
```

### Critical config knobs
- `bootstrap: true|false` — first apply runs with `true` to create only the hosted zone (so NS records are knowable for delegation). Flip to `false` after delegation is in place; second apply provisions ACM + HTTPS listener + ALB alias.
- `desiredCount: 0|1` — start at 0, push image to ECR, then bump to 1.
- `expectedAccountId` — required. Pulumi program throws `pulumi.RunError` if `aws sts get-caller-identity` doesn't match. Prevents wrong-profile applies.
- `dbDeletionProtection` — defaults to `true` for `prod`/`production` stacks via name regex.
- `dbSkipFinalSnapshot` — independent of `dbDeletionProtection`. Prod: `false` (always take snapshot on destroy).

### Bootstrap order for a new stack
1. `pulumi stack init <stack>` and copy example yaml.
2. Initial `pulumi up` with `bootstrap: true, desiredCount: 0` → creates ECR, RDS, hosted zone, etc. but no cert, no HTTPS, no tasks.
3. Add NS records at Namecheap pointing to `hostedZoneNameServers` output.
4. Wait for delegation to propagate (`dig +short NS <subdomain>`).
5. `pulumi config set fortressauth-aws:bootstrap false`.
6. Build and push image to the new ECR repo (locally with `docker buildx build --push` or via the deploy workflow).
7. `pulumi config set fortressauth-aws:desiredCount 1` and the `appImage` to the ECR digest.
8. `pulumi up`.
9. Smoke test `/health` and `/openapi.json`.

---

## 6. CI/CD

### Workflows
| File | Purpose |
| --- | --- |
| `.github/workflows/ci.yml` | Lint, typecheck, test, build all packages. Docker job builds image and runs `/health` smoke test. Runs on PRs and pushes. |
| `.github/workflows/deploy-aws.yml` | OIDC → ECR push → `pulumi up`. Auto on push to main (uses `aws-dev` env). Manual via `workflow_dispatch` for `aws-prod`. |
| `.github/workflows/deploy-netlify-infra.yml` | **Currently broken (see Next Steps §2)**. Runs but doesn't actually create stacks. |
| `.github/workflows/publish.yml` | npm + Docker Hub publish. Triggered by GitHub Release. Gates on a successful `Deploy AWS` run for the same commit. |
| `.github/workflows/smoke-frontend.yml` | Smoke-tests landing + demos. Manual trigger. |

### CI change detection
Files in `packages/infra-aws/*` mark the run as "infra" and skip the `test` matrix. Files in `packages/*` (other) trigger the full test matrix.

### Image build pattern (Dockerfile)
**Lesson learned**: Dockerfile must build *before* `pnpm deploy --legacy`. Otherwise `pnpm deploy` copies empty `dist/` folders into nested `.pnpm/<provider>/...` paths and transitive workspace deps (like `@fortressauth/oauth-core`) fail at runtime with `ERR_MODULE_NOT_FOUND`. The current Dockerfile (`docker/Dockerfile`) has builder + deployer merged into one stage.

---

## 7. What Worked

- **Account-per-environment topology**: dev/prod isolation pays for itself the moment you have a stuck SSE state or want to test destructive operations.
- **OIDC instead of static keys**: zero credentials in the repo, every workflow run is short-lived and auditable in CloudTrail.
- **Pulumi account guard** (`expectedAccountId` config + `pulumi.RunError`): refused a wrong-profile apply once during testing. The error message includes the fix command. Worth keeping forever.
- **Bootstrap mode for DNS/ACM**: ACM `CertificateValidation` deadlocks on first apply if the subdomain isn't delegated yet. The two-phase pattern (zone first, get NS values, delegate at registrar, flip `bootstrap: false`, apply again) avoided this.
- **No NAT Gateway**: tasks in public subnets with `assignPublicIp=true`. Saved ~$32/mo. RDS in private subnets is unreachable from outside; we use SSM tunnels for DB access.
- **SSM tunnels** (`scripts/aws-db-tunnel.sh`): TablePlus/DBeaver/psql connect to `localhost:15432` while a tunnel is open. No bastion host, no inbound DB exposure, and traffic is encrypted end-to-end through SSM.
- **CI Docker smoke test**: caught a real `ERR_MODULE_NOT_FOUND` bug in the Dockerfile that would have shipped to prod with broken OAuth providers.
- **Post-audit fixes**: redacted `DATABASE_URL` in startup logs, gated migration 004 (sessions drop) on legacy column presence so it doesn't wipe sessions on every container restart, switched ALB from `dualstack` to `ipv4`, separated `dbDeletionProtection` from `dbSkipFinalSnapshot`, scoped SES IAM policy to specific from-address + configuration set, added SNS topic policy granting `ses.amazonaws.com` publish.

---

## 8. What Didn't Work (and why)

| Issue | Root cause | Fix |
| --- | --- | --- |
| First `pulumi up` failed with "Cannot find version 16.4 for postgres" | RDS dropped support for PG 16.4 in eu-west-1 | Bumped `dbPostgresVersion` to `17.10` (latest available) and `family: postgres17` derives from the major version |
| First `pulumi up` failed on SG description regex | Used `>` in description "HTTP→HTTPS redirect" | AWS rejects `<>'"?` etc. in SG descriptions. Rephrased without those chars. |
| SNS topic policy update failed with 403 | Lost `AWS_PROFILE`, fell back to personal account creds | Added Pulumi account guard via `expectedAccountId` config + `pulumi.RunError` |
| `aws-db-tunnel.sh` failed on first run | `session-manager-plugin` not installed | Added clear install instructions in `require_cmd` for missing plugin |
| Verification email landed at `https://fortressauth.com/verify-email` instead of dev frontend | `frontendBaseUrl` config wasn't pointing at local dev | One-shot config change for testing; revert before treating dev as stable |
| Cookies not flowing from `localhost:3001` to `dev-api.fortressauth.com` | Cross-site cookies need `SameSite=None; Secure` | Set `cookieSameSite: none` for the cross-site dev test, then revert to `lax` for normal use |
| `/auth/verify-email` returned 403 from raw curl | CSRF middleware requires header + cookie | Either curl with `/auth/csrf` first to get token + cookie, or update `users.email_verified` directly in DB |
| SES production access **DENIED** on first review | Use case description was too generic | Resubmitted with a stronger reply (templated in the conversation history). Awaiting re-review. |
| Ad-hoc `Pulumi.dev.yaml` not visible to CI | `.gitignore` (root + package-level) excluded `Pulumi.<stack>.yaml` | Updated both `.gitignore` files to commit them. They contain only non-secret config; real secrets live in AWS Secrets Manager. |
| Docker image started but failed at runtime with `ERR_MODULE_NOT_FOUND @fortressauth/oauth-core` | `pnpm deploy --legacy` ran before workspace was built; nested `.pnpm/<provider>/.../oauth-core/dist` was empty | Restructured Dockerfile to build before `pnpm deploy`. Also removed the 13 manual COPY lines that were a workaround for the same bug at the top-level path. |

---

## 9. Open Items (Next Steps)

### 9.1 npm Trusted Publishing
**Goal**: replace `NPM_TOKEN` with npm Trusted Publishers (OIDC).

npm now supports trusted publishing for GitHub Actions, similar to PyPI's. No long-lived tokens needed.

Tasks:
1. For each publishable package on npmjs.com, go to package settings → **Trusted Publishers** → add GitHub Actions publisher.
   - Repository: `idmcalculus/fortressauth`
   - Workflow filename: `publish.yml`
   - Environment name: leave blank or set to `npm-publish` (and create a matching GH env)
2. Update `.github/workflows/publish.yml`:
   - Add `id-token: write` permission to the publish-npm job
   - Replace `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` with `--provenance` flag and rely on OIDC
3. Remove the `NPM_TOKEN` repo secret once verified working.

Reference: https://docs.npmjs.com/trusted-publishers

There are 22 publishable packages; can do them in batches.

### 9.2 Netlify Frontend Deployment
**Goal**: figure out why `deploy-netlify-infra.yml` runs successfully but doesn't create the Pulumi-managed stack resources.

Symptoms reported by user:
- Workflow ran successfully
- Nothing showed up in Pulumi
- Expected the stack to be auto-created

Likely causes:
1. Workflow has bootstrap-safe skips when required env vars are missing (see `packages/infra-netlify/README.md`). The vars to check on the `netlify` GH environment:
   - `NETLIFY_PULUMI_STACK` (variable; example: `idmcalculus/fortressauth-netlify/prod`)
   - `NETLIFY_TEAM_ID` (variable, optional)
   - `NETLIFY_TEAM_SLUG` (variable, optional)
   - `PULUMI_ACCESS_TOKEN` (secret)
   - `NETLIFY_API_TOKEN` (secret)
2. The Netlify Pulumi provider does **not** create Git-connected sites; sites must exist in Netlify first, then this stack manages their settings.
3. Stack doesn't auto-init in CI; first `pulumi stack init` must happen locally.

**Recommended approach for next agent**:
1. Inspect the workflow run logs to see if it skipped due to missing config.
2. Check `packages/infra-netlify/README.md` for the bootstrap order (Netlify sites first, then Pulumi).
3. May need to run `pulumi stack init prod` locally first, then push.

### 9.3 Tighten CI Docker job for PRs
**Goal**: run the Docker build + smoke test on pull requests too, not just `push` to main.

Current code in `.github/workflows/ci.yml`:
```yaml
docker:
  if: >-
    ${{
      always() &&
      github.event_name == 'push' &&     # ← only push, not pull_request
      github.ref == 'refs/heads/main' && # ← only main
      ...
    }}
```

Tasks:
1. Drop `github.event_name == 'push'` and `github.ref` restrictions, or expand to include PRs.
2. Fix the cleanup logic — `docker stop` only runs on success path; container can leak on failure. Use `if: always()` or trap.
3. Consider running on a self-hosted runner if the Docker build becomes too slow on hosted runners (currently ~5 min).

Suggested patch shape:
```yaml
docker:
  runs-on: ubuntu-latest
  needs: [changes, infra, test, frontend]
  if: >-
    ${{
      always() &&
      needs.changes.outputs.docker == 'true' &&
      (needs.infra.result == 'success' || needs.infra.result == 'skipped') &&
      (needs.test.result == 'success' || needs.test.result == 'skipped') &&
      (needs.frontend.result == 'success' || needs.frontend.result == 'skipped')
    }}

  steps:
    - uses: actions/checkout@v5
    # ... existing build steps ...
    - name: Test Docker image
      run: |
        docker run -d -p 3000:3000 --name test-server fortressauth:latest
        # cleanup-on-exit pattern
        trap 'docker logs test-server 2>&1 | head -50; docker stop test-server >/dev/null 2>&1; docker rm test-server >/dev/null 2>&1' EXIT
        sleep 5
        curl -fsS http://localhost:3000/health
```

### 9.4 Things from the Audit That Were Deferred
Tracked but not blocking. From the original audit response:

- **Rate limiter**: Currently in-memory (process-local). Fine at `desiredCount: 1`. **Before scaling out**, provision ElastiCache Valkey (~$10/mo for `cache.t4g.micro`), set `REDIS_URL` env var, and add ECS service auto-scaling.
- **Trust proxy hop count**: `TRUSTED_PROXY_HOP_COUNT` env var added to server but not yet set in deployed config. To enable trusted client IP from `X-Forwarded-For` (ALB appends client IP at the rightmost position), set `TRUSTED_PROXY_HOP_COUNT=1` in the prod stack's `appEnv`. Defaults to 0 which uses the leftmost (attacker-controllable) entry — works for dev, but should be 1 in prod.
- **`/metrics` publicly reachable**: pre-existing in Hetzner deployment. Lock down behind auth or restrict via ALB listener rule.
- **No WAF, no ALB access logs, no CloudWatch alarms**: post-launch hardening. WAF web ACL ~$5/mo. CloudWatch alarms ~$0.10 each.
- **OIDC role still has `PowerUserAccess`**: tighten with `PERMISSION_MODE=narrow ./scripts/aws-bootstrap.sh`. The narrow mode is already implemented and tested in the script.
- **ECS Exec session logging**: turn on if/when audit is needed.
- **RDS Multi-AZ**: currently single-AZ. Switch when traffic justifies it (one-line config change, zero-downtime). Adds ~$13/mo.
- **CloudFront in front of ALB**: would help global users (Asia, Americas) by terminating TLS at edge and saving 50-150ms per request. Single Pulumi resource + alias change.

### 9.5 Application-Side: Bounce/Complaint Handler
The SES configuration set + SNS topic publish events. The application currently does not subscribe and act on them. Per AWS deliverability guidance, the app should:
1. Subscribe a Lambda or HTTPS endpoint to the SNS topic.
2. On hard bounce or complaint, mark `users.email_undeliverable = true` (column needs to be added).
3. Skip future sends to undeliverable addresses.

If volume stays low this isn't urgent, but ignoring bounces will eventually trigger SES throttling.

### 9.6 SES Production Access (Re-review pending)
At time of this handover, prod SES is in sandbox. A re-review reply was drafted in the original conversation but **may not have been submitted yet** — verify with:
```bash
aws sesv2 get-account --region eu-west-1 --profile fortressauth-prod \
  --query 'Details.ReviewDetails.{Status:Status,CaseId:CaseId}'
```

If still `DENIED` or `PENDING`, follow up. The reply text is in the conversation history.

**Fallback if SES stays denied**: switch prod to `EMAIL_PROVIDER=resend`, populate `RESEND_API_KEY` in Secrets Manager. Already supported by the stack via `secretEnvKeys`.

---

## 10. Useful References

- Architecture spec: `.kiro/specs/fortressauth-platform/`
- AWS infra README: `packages/infra-aws/README.md`
- Netlify infra README: `packages/infra-netlify/README.md`
- Server env reference: `packages/server/.env.example`
- Bootstrap script: `scripts/aws-bootstrap.sh`
- DB tunnel script: `scripts/aws-db-tunnel.sh`
- ECS shell script: `scripts/aws-ecs-shell.sh`
- Project guidance: `AGENTS.md`
- Release flow: `PUBLISHING.md`
- Contribution guide: `CONTRIBUTING.md`

---

## 11. Quick Sanity Checks for the Next Agent

Run these to confirm everything is still healthy:

```bash
# 1. Public health checks
curl -fsS https://api.fortressauth.com/health
curl -fsS https://dev-api.fortressauth.com/health

# 2. Pulumi stacks resolve
pulumi stack ls
pulumi stack output --stack idmcalculus/fortressauth-aws/prod --json

# 3. AWS profiles work
aws sts get-caller-identity --profile fortressauth-prod
aws sts get-caller-identity --profile fortressauth-dev

# 4. ECS tasks running
aws ecs list-tasks --cluster fortressauth-prod-cluster --region eu-west-1 --profile fortressauth-prod
aws ecs list-tasks --cluster fortressauth-dev-cluster --region eu-west-1 --profile fortressauth-dev

# 5. Lint, typecheck, test all green
pnpm lint
pnpm typecheck
pnpm test
```

If all five pass, the system is healthy. Then start on Next Steps.
