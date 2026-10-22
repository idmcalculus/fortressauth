# FortressAuth AWS Pulumi

Pulumi stack to provision FortressAuth on AWS using:

- ECS Fargate service with rolling deployments and ECS Exec
- Application Load Balancer with ACM certificate (TLS 1.3)
- RDS PostgreSQL 17 (Multi-AZ optional, automated backups + PITR)
- ECR private repository for the FortressAuth server image
- Externally managed DNS records for the API hostname and ACM validation
- Secrets Manager containers for DB password, DATABASE_URL, and configurable
  app secret env vars (e.g. RESEND_API_KEY, OAuth client secrets)
- SES configuration set + SNS topic for bounce/complaint events
- CloudWatch Logs with configurable retention
- Dual-AZ VPC with public + private subnets, no NAT gateway

## Account and region

- Member account: `fortressauth-prod` (`437040615654`) and `fortressauth-dev`
  (`552072248716`) under the Jaydeetech AWS Organization.
- Region: `eu-west-1`.

The SES domain identity (DKIM, SPF, MAIL FROM) for `fortressauth.com` is
provisioned outside Pulumi to keep DKIM keys stable across stack rebuilds.
Pulumi only manages the configuration set, SNS topic, and event destination
that route bounce/complaint events to operators.

## Files

- `Pulumi.yaml` - Pulumi project definition
- `Pulumi.dev.example.yaml`, `Pulumi.prod.example.yaml` - stack config templates
- `Pulumi.<stack>.yaml` - local stack settings file, ignored from git
- `src/index.ts` - composes the stack
- `src/config.ts` - typed config loader and shared tag helpers
- `src/network.ts` - VPC, subnets, security groups
- `src/secrets.ts` - Secrets Manager + RDS master password generation
- `src/ecr.ts` - ECR repository with lifecycle policy
- `src/email.ts` - SES configuration set + SNS bounce topic
- `src/dns.ts` - ACM certificate + external DNS record outputs
- `src/database.ts` - RDS PostgreSQL instance, parameter group, subnet group
- `src/container.ts` - ECS cluster, task definition, Fargate service, ALB

## Bootstrap

```bash
cd packages/infra-aws
pnpm install
pulumi login
pulumi stack init dev
cp Pulumi.dev.example.yaml Pulumi.dev.yaml
```

Adjust `Pulumi.dev.yaml` for your environment, then:

```bash
pulumi config set aws:region eu-west-1
pulumi config set fortressauth-aws:appDomain dev-api.fortressauth.com
pulumi config set fortressauth-aws:bounceNotificationEmail damilola.ige+ses-bounces-dev@jaydeetechltd.com
```

Bootstrap order:

1. Run `pulumi up` once with the placeholder `appImage` to create ECR, VPC,
   RDS, ALB, ACM certificate, and DNS record outputs.
2. Create the output CNAME records in the authoritative external DNS provider.
3. Build and push the FortressAuth image to the new ECR repository.
4. Set `fortressauth-aws:bootstrap` to `false` and run `pulumi up` again with
   the real image digest. This is what the
   GitHub Actions deploy workflow does end-to-end on every commit to `main`.

## Required config

| Key | Description |
| --- | --- |
| `aws:region` | Always `eu-west-1`. |
| `fortressauth-aws:appDomain` | API hostname (e.g. `api.fortressauth.com`). |
| `fortressauth-aws:appImage` | ECR image reference (digest preferred). |
| `fortressauth-aws:bounceNotificationEmail` | Recipient for SES bounces/complaints. |

Optional config (see `Pulumi.dev.example.yaml` for full list):

- `fortressauth-aws:taskCpu`, `taskMemoryMib`, `desiredCount`
- `fortressauth-aws:dbInstanceClass`, `dbAllocatedStorageGb`, `dbBackupRetentionDays`, `dbMultiAz`
- `fortressauth-aws:cookieSameSite`, `csrfCookieSameSite`
- `fortressauth-aws:appEnv` (non-secret env vars)
- `fortressauth-aws:secretEnvKeys` (env keys provisioned as Secrets Manager containers)

## Wraith native OAuth and resource introspection fixture

The checked-in example stacks use Wraith as one compatibility fixture. It is not a core deployment
assumption and other clients/resources are registered independently. The public example is:

```yaml
NATIVE_CLIENTS_JSON: '[{"clientId":"wraith","redirectUris":["wraith://auth/callback"],"resourceAudiences":["wraith-api"]}]'
RESOURCE_SERVERS_JSON: '[{"audience":"wraith-api","enabled":true,"allowedClientIds":["wraith"]}]'
```

That custom-scheme URI is the callback from FortressAuth to the installed
Wraith application. It is not the callback registered with Google or Apple.
Before either stack can be previewed or deployed, configure at least one
complete upstream provider:

- Google public values in `appEnv`: `GOOGLE_CLIENT_ID` and
  `GOOGLE_REDIRECT_URI`. Register the redirect as
  `https://dev-api.fortressauth.com/auth/oauth/google/callback` for dev or
  `https://api.fortressauth.com/auth/oauth/google/callback` for prod.
- Apple public values in `appEnv`: `APPLE_CLIENT_ID` (the Services ID),
  `APPLE_TEAM_ID`, `APPLE_KEY_ID`, and `APPLE_REDIRECT_URI`. Register the
  redirect as `https://dev-api.fortressauth.com/auth/oauth/apple/callback` for
  dev or `https://api.fortressauth.com/auth/oauth/apple/callback` for prod.

Public client IDs, team IDs, key IDs, and callback URIs belong in `appEnv`.
OAuth client secrets and Apple private keys must never be committed or placed
in `appEnv`; declare `GOOGLE_CLIENT_SECRET`, `APPLE_CLIENT_SECRET`, or
`APPLE_PRIVATE_KEY` in `secretEnvKeys` and populate the generated Secrets
Manager entry out of band. The checked-in stack files intentionally contain no
invented provider IDs. `loadConfig()` fails with a Wraith-specific error until
the operator supplies a complete Google or Apple configuration, so a provider
cannot be silently omitted from a Wraith deployment.

The public resource policy is safe in `appEnv`, but its credential is not. Declare only the env key
in `secretEnvKeys`:

```yaml
secretEnvKeys:
  - RESOURCE_SERVER_CREDENTIALS_JSON
```

After Pulumi has created the secret container, generate an independent 32-byte-or-longer credential,
encode it as at least 43 unpadded base64url characters, and populate that Secrets Manager entry out
of band with the server's secret JSON contract. Use
audience `wraith-api`, a globally unique credential id, and the generated credential as its `secret`.
Do not copy the JSON value into Pulumi config, a repository file, a workflow input, or logs. Add a
second enabled credential for rotation, move Wraith to it, verify it, then disable/remove the old
entry. FortressAuth rejects a credential shared with another resource audience.

Wraith control-plane values after deployment are exactly:

```text
FORTRESS_VERIFIER_MODE=introspection
FORTRESS_CLIENT_ID=wraith
FORTRESS_AUDIENCE=wraith-api
FORTRESS_INTROSPECTION_URL=https://<dev-api-or-api-host>/auth/resource/introspect
FORTRESS_INTROSPECTION_SECRET=<wraith-api resource credential from the Wraith secret manager>
```

The secret value must be distributed separately to Wraith's server-side secret manager. It never
belongs in the desktop renderer. See the root `NATIVE_RESOURCE_AUTH.md` for rotation, smoke tests,
and the remaining production-readiness boundary.

## Secrets

Pulumi never stores app secret values. It creates Secrets Manager containers
for each declared key in `secretEnvKeys` and seeds them with the placeholder
`CHANGE_ME_AFTER_DEPLOY`. After the first apply, populate real values:

```bash
aws secretsmanager put-secret-value \
  --region eu-west-1 \
  --profile fortressauth-prod \
  --secret-id fortressauth-prod/app/RESEND_API_KEY \
  --secret-string 're_xxxxxxxxxxxxxxxxxxxx'
```

The ECS task pulls them at start via the task execution role; subsequent
deploys do not overwrite the values. For OAuth secrets, use the same command
shape above with the provider secret ID and retrieve the value from the
approved secret manager. Verify that it is no longer
`CHANGE_ME_AFTER_DEPLOY` before deploying the server task. Do not paste the
value into Git, logs, issues, workflow inputs, or callback URLs.

The RDS master password is generated by Pulumi and stored at
`<namePrefix>/db/password`. The full `DATABASE_URL` is assembled from the
RDS endpoint + master password and stored at `<namePrefix>/app/DATABASE_URL`.

## External DNS

DNS is intentionally managed outside AWS. After the first `pulumi up`, add the
records from `externalDnsRecords` to the authoritative provider for
`fortressauth.com` (currently Namecheap). The app record points the API hostname
at the ALB. The validation records keep the ACM certificate renewable.

```bash
pulumi stack output externalDnsRecords --stack idmcalculus/fortressauth-aws/prod
```

For the current production stack this means a CNAME from `api.fortressauth.com`
to the ALB DNS name. For development it means a CNAME from
`dev-api.fortressauth.com` to the dev ALB DNS name. Do not create Route 53
hosted zones for these subdomains.

## Outputs

- `appUrl` - public HTTPS URL of the deployed app
- `albDnsName`, `albZoneId` - ALB endpoints (informational)
- `ecsClusterName`, `ecsServiceName` - for `aws ecs execute-command` access
- `ecrRepositoryUrl`, `ecrRepositoryName` - ECR push target
- `dbEndpoint`, `dbInstanceId` - RDS connection target (private)
- `databaseUrlSecretArn` - ARN of the connection-string secret
- `sesConfigurationSetName`, `sesBounceTopicArn` - SES wiring
- `logGroupName`, `taskRoleArn`, `executionRoleArn` - operational references
- `appDnsCnameRecord` - API CNAME record to create in external DNS
- `certificateDnsValidationRecords` - ACM validation CNAMEs to create in external DNS
- `externalDnsRecords` - combined DNS instructions and records

## GitHub Actions CD

`.github/workflows/deploy-aws.yml` builds and pushes the server image to ECR,
then runs `pulumi up`. It uses GitHub OIDC federation against the per-account
deploy role (`github-actions-fortressauth-deploy`).

Required GitHub environment variables (per environment `aws-dev`, `aws-prod`):

- `AWS_REGION` (`eu-west-1`)
- `AWS_ROLE_TO_ASSUME` (deploy role ARN in the matching account)
- `PULUMI_STACK` (e.g. `idmcalculus/fortressauth-aws/dev`)

Required GitHub environment secret:

- `PULUMI_ACCESS_TOKEN`

## Operations

```bash
# Live tail logs
aws logs tail /ecs/fortressauth-prod --follow --region eu-west-1 --profile fortressauth-prod
```

### Inspect runtime resources

Prefer GitHub Actions and Pulumi for deployment changes. For one-off production
inspection, use AWS CLI commands directly against the selected account/profile:

```bash
# Open a shell inside the running task (ECS Exec via SSM)
TASK_ARN="$(aws ecs list-tasks --cluster fortressauth-prod-cluster --service-name fortressauth-prod-service --query 'taskArns[0]' --output text --region eu-west-1 --profile fortressauth-prod)"
aws ecs execute-command \
  --cluster fortressauth-prod-cluster \
  --task "${TASK_ARN}" \
  --container app \
  --interactive \
  --command "/bin/sh" \
  --region eu-west-1 \
  --profile fortressauth-prod
```

Temporary start/stop of ECS or RDS is intentionally not documented as a
repository script workflow. Those changes mutate live resources outside Pulumi;
coordinate them explicitly and expect the next `pulumi up` to reconcile resource
state back to stack config.

`pulumi up` and `pulumi destroy` are destructive or billable. Always run
`pulumi preview --diff` first and only proceed with explicit user approval.
