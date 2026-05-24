# Publishing FortressAuth

This document describes the current release path for FortressAuth. The repository publishes npm packages and Docker images only after the target commit has been validated and deployed.

## Release Flow

1. Prepare the release commit on `main`
2. Let `CI` pass for that commit
3. Let `Deploy AWS` succeed for that same commit (production environment)
4. Create a GitHub Release for that deployed commit
5. Let the `Publish` workflow publish npm packages and Docker images

The important constraint is step 3: `Publish` checks that the exact release commit already has a successful `Deploy AWS` run.

## Required Secrets and Variables

### GitHub Actions secrets (per environment)

`aws-dev` environment:
- `PULUMI_ACCESS_TOKEN`

`aws-prod` environment:
- `PULUMI_ACCESS_TOKEN`

Repository secrets (for `Publish`):
- `NPM_TOKEN`
- `DOCKER_USERNAME`
- `DOCKER_PASSWORD`

### GitHub Actions variables (per environment)

`aws-dev` environment:
- `AWS_REGION` (`eu-west-1`)
- `AWS_ROLE_TO_ASSUME` (OIDC role ARN in dev account, e.g. `arn:aws:iam::552072248716:role/github-actions-fortressauth-deploy`)
- `PULUMI_STACK` (`idmcalculus/fortressauth-aws/dev`)

`aws-prod` environment:
- `AWS_REGION` (`eu-west-1`)
- `AWS_ROLE_TO_ASSUME` (OIDC role ARN in prod account, e.g. `arn:aws:iam::437040615654:role/github-actions-fortressauth-deploy`)
- `PULUMI_STACK` (`idmcalculus/fortressauth-aws/prod`)

`aws-prod` environment also enforces required reviewers for production deploys.

## Release Preparation Checklist

### 1. Update versioned files

When bumping versions, update all relevant package manifests and any runtime/docs versions that are surfaced publicly.

At minimum, check:

- root `package.json`
- all publishable `packages/*/package.json`
- `packages/server/src/index.ts` (`VERSION`, used by `/health` and `/openapi.json`)
- `packages/server/README.md` if it shows example version output

### 2. Run the local validation suite

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

If the change is isolated, you can iterate with filtered package commands first, but do not cut a release without the full repo checks.

### 3. Merge the release commit to `main`

The release commit must be the one you intend to tag and publish.

### 4. Wait for deployment of that commit

`Deploy AWS` is the gate before release publication. The workflow:

- Authenticates to the target AWS account via OIDC federation (no static keys).
- Builds the server Docker image and pushes to the per-stack Amazon ECR repository.
- Runs `pulumi up` against the matching `fortressauth-aws/<stack>` stack so the ECS Fargate service rolls to the new image digest.
- Smoke-tests `/health` and `/openapi.json` once tasks become healthy.

Push to `main` deploys to `aws-dev` automatically. Production deploys (`aws-prod`) run via `workflow_dispatch` or after a `aws-dev` deploy succeeds, and require reviewer approval through GitHub Environments.

### 5. Verify the live deployment

Check the live API before cutting the release:

```bash
curl -fsS https://api.fortressauth.com/health
curl -fsS https://api.fortressauth.com/openapi.json
```

If you need to sync your local Pulumi stack file with the most recent deployment before manual infra work:

```bash
cd packages/infra-aws
pulumi stack select idmcalculus/fortressauth-aws/prod
pulumi config refresh --force
```

### 6. Create the GitHub Release

Tag the deployed commit and create the release from GitHub:

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

Then create a GitHub Release for that tag.

## What the Publish Workflow Does

The `Publish` workflow is triggered by `release.created` and does the following:

### Verify deploy status

- resolves the release tag to a commit SHA
- checks for a successful `Deploy AWS` run for that same SHA
- fails fast if the commit has not been deployed successfully

### Publish npm packages

The workflow builds and tests the repo, then publishes publishable workspace packages if that exact version is not already on npm.

Current publish set:

- `@fortressauth/core`
- `@fortressauth/adapter-sql`
- `@fortressauth/adapter-mongodb`
- `@fortressauth/oauth-core`
- `@fortressauth/server`
- `@fortressauth/react-sdk`
- `@fortressauth/vue-sdk`
- `@fortressauth/angular-sdk`
- `@fortressauth/svelte-sdk`
- `@fortressauth/react-native-sdk`
- `@fortressauth/expo-sdk`
- `@fortressauth/electron-sdk`
- `@fortressauth/email-ses`
- `@fortressauth/email-sendgrid`
- `@fortressauth/email-smtp`
- `@fortressauth/provider-google`
- `@fortressauth/provider-github`
- `@fortressauth/provider-apple`
- `@fortressauth/provider-discord`
- `@fortressauth/provider-linkedin`
- `@fortressauth/provider-twitter`
- `@fortressauth/provider-microsoft`

### Publish Docker images

The workflow builds architecture-specific images for:

- `linux/amd64`
- `linux/arm64`

It then merges them into multi-arch tags published to Docker Hub (the public distribution channel for self-hosters). This is separate from the private ECR images used by the AWS deployment:

- `docker.io/<DOCKER_USERNAME>/fortressauth:vX.Y.Z`
- `docker.io/<DOCKER_USERNAME>/fortressauth:latest`

## Post-Release Verification

After publishing, verify:

- the expected npm versions exist
- the Docker image for the release tag is available
- the release tag matches the commit that passed deploy
- the live `/health` and `/openapi.json` endpoints still match the release version

## Failure Modes

### Publish failed because deploy was missing

This means the release tag points to a commit that was never successfully deployed. Deploy that commit first, then rerun `Publish`.

### Local `Pulumi.<stack>.yaml` is stale after CI deploys

That is expected. CI updates stack config in its own checkout. Use:

```bash
cd packages/infra-aws
pulumi config refresh --force
```

### npm publish skipped a package

The workflow intentionally skips any package version that is already on npm.
