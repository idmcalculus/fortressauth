# Publishing FortressAuth

This document describes the current release path for FortressAuth. The repository publishes npm packages and Docker images only after the target commit has been validated and deployed.

## Release Flow

1. Prepare the release commit on `main`
2. Let `CI` pass for that commit
3. Let `Deploy Hetzner` succeed for that same commit
4. Create a GitHub Release for that deployed commit
5. Let the `Publish` workflow publish npm packages and Docker images

The important constraint is step 3: `Publish` checks that the exact release commit already has a successful `Deploy Hetzner` run.

## Required Secrets and Variables

### GitHub Actions secrets

- `NPM_TOKEN`
- `DOCKER_USERNAME`
- `DOCKER_PASSWORD`
- `PULUMI_ACCESS_TOKEN`
- `HETZNER_DEPLOY_SSH_PRIVATE_KEY`

### GitHub Actions variables

- `PULUMI_STACK`

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

`Deploy Hetzner` is the gate before release publication. It now always builds a fresh Docker image from the commit being deployed and updates the stack to that image digest.

Manual deploys are available through `workflow_dispatch` if needed.

### 5. Verify the live deployment

Check the live API before cutting the release:

```bash
curl -fsS https://api.fortressauth.com/health
curl -fsS https://api.fortressauth.com/openapi.json
```

If you want to sync your local Pulumi stack file with the most recent deployment before manual infra work:

```bash
cd packages/infra-hetzner
pulumi stack select idmcalculus/fortressauth-hetzner/dev
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
- checks for a successful `Deploy Hetzner` run for that same SHA
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

It then merges them into multi-arch tags:

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

### Local `Pulumi.dev.yaml` is stale after CI deploys

That is expected. CI updates stack config in its own checkout. Use:

```bash
cd packages/infra-hetzner
pulumi config refresh --force
```

### npm publish skipped a package

The workflow intentionally skips any package version that is already on npm.
