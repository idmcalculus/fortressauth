# FortressAuth on Google Cloud Run (free tier)

This runs the FortressAuth API on Google Cloud Run with a free Neon Postgres
database and free Resend email. At a handful of users it costs nothing.

- **The server** is the existing image from `docker/Dockerfile`, with no
  code changes.
- **Cloud Run** scales it to zero when idle. A free UptimeRobot ping keeps it
  warm.
- **[`packages/infra-gcp`](../../packages/infra-gcp/README.md)** (Pulumi)
  creates the Google Cloud side.
- **[Deploy Cloud Run](../../.github/workflows/deploy-cloudrun.yml)** builds
  and deploys from GitHub.

It replaces the AWS stacks (ALB, Fargate and RDS), which cost about
$131 a month.

| Piece | Service | Free allowance |
|---|---|---|
| API | Cloud Run, `europe-west1` | 2M requests, 180k vCPU-seconds, 360k GiB-seconds a month |
| Database | Neon, Frankfurt | 0.5 GB storage, 100 compute-unit hours a month, sleeps after 5 idle minutes |
| Email | Resend | 3,000 emails a month, 100 a day, 1 domain |
| Images | Artifact Registry | 0.5 GB |
| Secrets | Secret Manager | 6 secret versions |
| Monitoring | UptimeRobot | 50 monitors at 5-minute intervals |

Google needs a card on file even for free-tier use. Set the budget alert
(step 4) so any charge reaches you at once.

## 1. Neon database

1. Sign up at [neon.com](https://neon.com) on the Free plan.
2. Create a project on **Postgres 18** (Neon's default) in **AWS Europe
   Central 1 (Frankfurt)**, close to `europe-west1`, with a database named
   `fortressauth`. The server uses plain SQL through Kysely, so any supported
   version works; 18 is simply the newest.
3. Copy the **direct** connection string, not the `-pooler` one, and make sure
   it ends in `?sslmode=require`. It becomes the `DATABASE_URL` secret. The
   server runs its migrations against it on each cold start.

## 2. Resend email

1. Sign up at [resend.com](https://resend.com) on the Free plan.
2. Add the sending domain `fortressauth.com`. Resend lists the DKIM and SPF
   records to create. Add them at Namecheap (**Domain List → Manage →
   Advanced DNS**). Resend's records sit on their own names (`resend._domainkey`
   and the `send` subdomain), so they don't clash with the existing SES records.
3. Once Resend shows the domain as verified, create an API key with sending
   access. It becomes the `RESEND_API_KEY` secret.

## 3. Google Cloud project

1. Create a project in the [console](https://console.cloud.google.com) and
   link a billing account. New accounts also get a free-trial credit; the
   budget alert below counts spend before credits, so the trial can't hide a
   charge.
2. Install the [gcloud CLI](https://cloud.google.com/sdk/docs/install), then:

   ```bash
   gcloud auth login
   gcloud auth application-default login
   gcloud config set project <project-id>
   ```

3. Verify `fortressauth.com` in [Search
   Console](https://search.google.com/search-console) with a TXT record at
   Namecheap. Use the same Google account that runs Pulumi: Cloud Run only
   maps domains verified by the caller.

## 4. Create the stack

Follow "First run" in the
[`packages/infra-gcp` README](../../packages/infra-gcp/README.md):

1. Set `gcp:project` and `appEnv` in `Pulumi.prod.yaml`.
2. Set `DATABASE_URL` and `RESEND_API_KEY` with `pulumi config set --secret`.
3. Set `billingAccountId` (from `gcloud billing accounts list`) for the
   $1 budget alert.
4. Leave `appDomains` empty for now.
5. Run `pulumi preview`, then `pulumi up`.

The service starts on Google's sample `hello` image. The first deploy
replaces it.

## 5. Connect GitHub and deploy

GitHub only runs a workflow that exists on `main`, so merge
`deploy-cloudrun.yml` first. Then, from `packages/infra-gcp`:

```bash
gh api -X PUT repos/idmcalculus/fortressauth/environments/cloudrun-prod
gh variable set GCP_WORKLOAD_IDENTITY_PROVIDER --env cloudrun-prod --body "$(pulumi stack output workloadIdentityProvider)"
gh variable set GCP_DEPLOY_SERVICE_ACCOUNT --env cloudrun-prod --body "$(pulumi stack output deployServiceAccount)"
gh variable set GCP_REGION --env cloudrun-prod --body "$(pulumi stack output region)"
gh variable set CLOUDRUN_SERVICE --env cloudrun-prod --body "$(pulumi stack output serviceName)"
gh variable set CLOUDRUN_IMAGE --env cloudrun-prod --body "$(pulumi stack output imageName)"
gh variable set CLOUDRUN_APP_URL --env cloudrun-prod --body "$(pulumi stack output serviceUrl)"
gh workflow run deploy-cloudrun.yml --ref main
```

There are no secrets to add to GitHub: the workflow signs in to Google through
Workload Identity Federation. In the environment's settings on GitHub, limit
deployments to the `main` branch, because Google only accepts tokens from
this environment.

The workflow builds the amd64 image, pushes it, points the service at it, and
checks `/health` and `/openapi.json` on `CLOUDRUN_APP_URL`. Once a manual run
passes, turn on deploys after every green CI run on `main`:

```bash
gh variable set CLOUDRUN_DEPLOY_ENABLED --body true
```

## 6. Try it on a spare hostname

1. Add `gcp-api.fortressauth.com` to `appDomains` and run `pulumi up`.
2. `pulumi stack output dnsRecords` shows a CNAME. At Namecheap, add
   `gcp-api` → `ghs.googlehosted.com.`.
3. Google issues the certificate once DNS points at it. That takes from about
   15 minutes up to a day.
4. Check `https://gcp-api.fortressauth.com/health`, then sign up, sign in and
   request a password reset to see the email arrive.
5. Check that rate limits see each user's own address. The server reads it
   from `X-Forwarded-For` at the position set by `trustedProxyHopCount`
   (default 1). In Neon's SQL editor, run
   `select ip_address from login_attempts order by created_at desc limit 1;`
   and compare it with your own address (`curl -s https://ifconfig.me`).
   - If they match, nothing to do.
   - If the database shows a Google address instead, set
     `pulumi config set fortressauth-gcp:trustedProxyHopCount 2` and run
     `pulumi up`.

## 7. Move the data (optional)

With only test users, an empty database is fine. To keep the accounts, dump
RDS through the AWS tunnel script (`scripts/aws-db-tunnel.sh prod`) and
restore into Neon, ignoring the old owners. RDS runs Postgres 17 and Neon
18; a dump from an older server restores into a newer one, as long as the
tools are at least as new as Neon, so both commands use the 18 image:

```bash
docker run --rm -v "$PWD:/out" postgres:18-alpine pg_dump \
  "postgresql://fortressauth:<password>@host.docker.internal:15432/fortressauth?sslmode=require" \
  --format custom --no-owner --no-privileges --file /out/fortressauth-rds.dump
docker run --rm -v "$PWD:/in" postgres:18-alpine pg_restore \
  --dbname "<neon connection string>" --no-owner --no-privileges /in/fortressauth-rds.dump
```

Restore into an empty database, before the first deploy runs the migrations.
Otherwise drop and recreate the database in Neon's console first.

## 8. Move api.fortressauth.com over

1. A day ahead, lower the TTL on the `api` record at Namecheap to 5 minutes.
2. Add `api.fortressauth.com` to `appDomains` and run `pulumi up`.
3. At Namecheap, replace the `api` CNAME (it points at the AWS load balancer)
   with `api` → `ghs.googlehosted.com.`.
4. HTTPS on `api` fails until Google issues the new certificate, usually
   within the hour. Do this at a quiet time.
5. Set `CLOUDRUN_APP_URL` to `https://api.fortressauth.com`.
6. Sign in on fortressauth.com, try an OAuth sign-in, and send a password
   reset. The OAuth redirect URIs don't change, because the hostname stays
   the same.

Give it a few days before tearing down AWS. The AWS teardown steps are in
`packages/infra-aws/TEARDOWN.md` (added in PR idmcalculus/fortressauth#9).

## Keeping it warm

Cloud Run stops an idle instance. The next request then waits a few seconds
while the container starts and the server runs its migrations. Two free
[UptimeRobot](https://uptimerobot.com) monitors avoid most of that:

- **Keep-warm:** `GET https://api.fortressauth.com/docs` every 5 minutes.
  `/docs` is static HTML and never touches the database.
- **Health:** `GET https://api.fortressauth.com/health` every 60 minutes.

Don't point the 5-minute monitor at `/health`. It queries the database, so a
5-minute ping keeps Neon awake around the clock. That's about 182
compute-unit hours a month against Neon's free 100, and Neon would pause the
database around day 16. Hourly checks cost about 15 of those hours.

The keep-warm pings add about 8,600 requests a month, well under 1% of Cloud
Run's free CPU and memory. Google doesn't promise how long an idle instance
lives, so expect the occasional cold start after deploys and maintenance. The
first database query after 5 quiet minutes also waits for Neon to wake,
which takes under a second.

## Day to day

- **Logs:** `gcloud run services logs read fortressauth-api --region europe-west1`
- **Revisions:** `gcloud run revisions list --service fortressauth-api --region europe-west1`
- **Roll back:**
  `gcloud run services update-traffic fortressauth-api --region europe-west1 --to-revisions <revision>=100`,
  or re-run the workflow on an older commit.
- **Change a secret or env value:** set it in the stack, then run `pulumi up`
  (see the package README).
- **Rate limits** live in memory and reset when the instance stops. That's
  fine for test users. For limits that survive restarts at no cost, set
  `REDIS_URL` to an Upstash free Redis database.

## Costs to watch

- After the first week, the [billing
  report](https://console.cloud.google.com/billing) for the project should
  show $0.00. If it doesn't, the budget alert will already have emailed you.
- The [Neon console](https://console.neon.tech) shows compute-unit hours used
  this month. A few at most, unless something pings `/health` too often.
- Network egress is the only meter outside the free tier that this setup
  touches. API responses are small, so it should stay at a few cents at worst.
