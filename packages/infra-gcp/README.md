# FortressAuth Google Cloud Pulumi

This Pulumi stack (`idmcalculus/fortressauth-gcp/prod`) runs the FortressAuth
API on Google Cloud Run. It is sized to stay inside Google's free tier.
[`deploy/cloudrun/README.md`](../../deploy/cloudrun/README.md) walks through
the whole setup: Neon, Google Cloud, GitHub, DNS and cutover.

It creates:

- A **Cloud Run service** running the existing server image
  (`docker/Dockerfile`, linux/amd64).
  - It scales to zero and runs at most one instance (`maxInstances`), which
    also keeps the in-memory rate limiter consistent.
  - It gets CPU only while serving a request (`cpuIdle`), so idle time costs
    nothing.
- **Secret Manager secrets** for the `secretEnvKeys`, each holding one
  version, read by a dedicated runtime service account with no other roles.
- An **Artifact Registry** Docker repository that keeps only the newest
  images (`keepImageCount`, default 2).
- **Workload Identity Federation** for GitHub Actions. The
  [Deploy Cloud Run](../../.github/workflows/deploy-cloudrun.yml) workflow
  pushes and deploys without a long-lived key, and only from the
  `cloudrun-prod` GitHub environment of this repository.
- Optional **domain mappings** for `appDomains`, with Google-managed
  certificates.
- An optional **budget alert** (`billingAccountId`).

The database is not in this stack. It lives on Neon's free Postgres, and its
connection string goes in the `DATABASE_URL` secret.

## Who owns what

Pulumi owns the service's configuration: scaling, env, secrets and the
runtime account. The deploy workflow owns the image. The stack ignores
changes to the image (and to gcloud's client fields), so `pulumi up` never
rolls back a deploy. Until the first deploy, the service runs Google's
sample `hello` image.

## Free-tier limits it is built around

| Item | Free each month | How the stack stays inside it |
|---|---|---|
| Cloud Run requests | 2 million | A handful of users plus a 5-minute keep-warm ping |
| Cloud Run CPU and memory | 180,000 vCPU-seconds, 360,000 GiB-seconds | CPU only during requests; at most one instance |
| Secret Manager | 6 active secret versions | At most 6 secret keys (checked in config), one version each, old versions destroyed |
| Artifact Registry | 0.5 GB | Cleanup keeps the 2 newest images |

## First run

You need the Google Cloud project with billing linked, and `gcloud` logged in
for both your user and application-default credentials. See the runbook.

```bash
cd packages/infra-gcp
pulumi stack init idmcalculus/fortressauth-gcp/prod
cp Pulumi.prod.example.yaml Pulumi.prod.yaml
# edit gcp:project and appEnv, then set each secret:
pulumi config set --secret --path 'secretEnv.DATABASE_URL' 'postgresql://...?sslmode=require'
pulumi config set --secret --path 'secretEnv.RESEND_API_KEY' 're_...'
pulumi preview --diff
pulumi up
```

The outputs the GitHub environment needs:

```bash
pulumi stack output workloadIdentityProvider
pulumi stack output deployServiceAccount
pulumi stack output imageName
pulumi stack output serviceName
pulumi stack output serviceUrl
```

After you add a hostname to `appDomains`, `pulumi stack output dnsRecords`
lists the records to create at Namecheap.

## Changing things

- **A secret's value:** run `pulumi config set --secret --path 'secretEnv.KEY' '<value>'`, then `pulumi up`. Pulumi adds the new version, moves the service onto it (a new revision), then destroys the old version.
- **Plain env or sizing:** edit `Pulumi.prod.yaml`, then `pulumi up`. Each change rolls out a new revision.
- **Client address:** the server takes it from `X-Forwarded-For` at position `trustedProxyHopCount` (default 1). Check it once after the first deploy, as described in step 6 of the runbook.
- **A new hostname:** add it to `appDomains`, run `pulumi up`, then create the records from `dnsRecords`. Google issues the certificate once DNS points at it, which can take from 15 minutes to a day.

## Tearing it down

```bash
pulumi config set fortressauth-gcp:deletionProtection false
pulumi up
pulumi destroy
```

The enabled Google APIs stay on, and the Neon database is untouched.

## Tests

```bash
pnpm --filter @fortressauth/infra-gcp test
```

The tests use Pulumi's mocks, so they need neither a Google account nor
network access. CI runs them, with lint and typecheck, whenever this package
or `deploy/cloudrun` changes.
