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
- `DOCKER_USERNAME`
- `DOCKER_PASSWORD`

npm packages use npm Trusted Publishing through GitHub Actions OIDC instead of
an `NPM_TOKEN`. Each already-published npm package must have a trusted publisher entry
for repository `idmcalculus/fortressauth`, workflow `publish.yml`, and the
`npm publish` allowed action.

Configure those entries with npm CLI after logging in as an npm account with
write access to every package:

```bash
npm install -g 'npm@^11.10.0'
npm login
npm trust github @fortressauth/core \
  --file publish.yml \
  --repo idmcalculus/fortressauth \
  --allow-publish \
  --dry-run
```

Run the same `npm trust github <package>` command for each existing package in the
publish set below, removing `--dry-run` once the command looks correct. The
first real run may require browser/2FA approval. If npm offers to skip
additional 2FA prompts for a short window, accept that prompt so the remaining
packages can be configured without repeated prompts. Run
the desktop SDK trust command only after the bootstrap below, because npm cannot
configure trust for a package name that does not yet exist.

### One-time `@fortressauth/desktop-sdk` publication bootstrap

npm does not allow an OIDC trusted publisher to bootstrap a package name that
has never been published. The first `@fortressauth/desktop-sdk` version is
therefore an explicit operator action. Do this from the exact clean release
commit after CI and the required production deployment have passed, but before
creating the GitHub Release that triggers the normal publish workflow.

```bash
test -z "$(git status --porcelain)" || {
  echo "Refusing to bootstrap from a dirty worktree" >&2
  exit 1
}
pnpm install --frozen-lockfile
pnpm --filter @fortressauth/desktop-sdk lint
pnpm --filter @fortressauth/desktop-sdk typecheck
pnpm --filter @fortressauth/desktop-sdk test
pnpm --filter @fortressauth/desktop-sdk build

PACK_DIR="$(mktemp -d)"
pnpm --filter @fortressauth/desktop-sdk pack --pack-destination "${PACK_DIR}"
tar -tzf "${PACK_DIR}"/fortressauth-desktop-sdk-*.tgz

npm login --auth-type=web
(cd packages/desktop-sdk && pnpm publish --access public --no-git-checks)
```

Complete the interactive authentication and 2FA prompts. Do not use
`--provenance` for this local bootstrap: provenance is supplied by the normal
GitHub OIDC workflow on subsequent versions.

If interactive authentication is impossible, a short-lived granular npm token
may be used only after explicit operator approval. Restrict it to the
`@fortressauth/desktop-sdk` package and publish permission, place it in a
temporary mode-0600 npmrc outside the repository, and delete the npmrc and
revoke the token immediately after the one publish. Never commit the token or
store it as a standing GitHub secret.

After the first version exists, configure and verify the trusted publisher:

```bash
npm trust github @fortressauth/desktop-sdk \
  --file publish.yml \
  --repo idmcalculus/fortressauth \
  --allow-publish \
  --dry-run

# Remove --dry-run only after reviewing the output.
npm view @fortressauth/desktop-sdk version
```

The release workflow will skip the manually bootstrapped desktop SDK version,
then publish `@fortressauth/electron-sdk` with its rewritten concrete desktop
dependency. On later releases, OIDC publishes desktop-sdk before electron-sdk.

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

FortressAuth uses lockstep release versions. Update the root manifest, every
workspace package (including private infra packages), examples, and landing in
the same release preparation. Keep internal dependencies as `workspace:*` in
source; `pnpm publish` rewrites them to the package's concrete release version.
Run `pnpm install --lockfile-only` after the bump and verify a packed dependent
package resolves its internal dependencies to the new version.

The native desktop release starts at `0.2.0` because the Electron wrapper intentionally replaces
the insecure 0.1 renderer/email-password surface with the required system-browser OAuth,
OS-protected storage, exact client/redirect, and native-transport contract. Treat this as a
consumer migration, not a patch upgrade; the package README lists removed and replacement APIs.

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

With GitHub CLI:

```bash
TARGET_SHA="$(git rev-parse HEAD)"
gh workflow run deploy-aws.yml --ref main -f environment=aws-prod
gh run list --workflow deploy-aws.yml --commit "${TARGET_SHA}" --limit 5
```

Approve the `aws-prod` environment gate in GitHub when prompted, then watch the
run:

```bash
gh run watch <run-id> --compact --exit-status
```

### 5. Verify the live deployment

Check the live API before cutting the release:

```bash
curl -fsS https://api.fortressauth.com/health
curl -fsS https://api.fortressauth.com/openapi.json
curl -fsS https://api.fortressauth.com/docs
```

If you need to sync your local Pulumi stack file with the most recent deployment before manual infra work:

```bash
cd packages/infra-aws
pulumi stack select idmcalculus/fortressauth-aws/prod
pulumi config refresh --force
```

### 6. Create the GitHub Release

The preferred automation path is the GitHub CLI. The Codex GitHub connector is
useful for repository, PR, issue, and branch work, but the exposed connector
tools do not currently include a first-class GitHub Release creation tool.
`gh` is authenticated locally for this repo and can create releases, create
tags, and inspect workflow runs.

Tag the deployed commit and create the release with `gh`:

```bash
git checkout main
git pull --ff-only origin main

TAG=vX.Y.Z
TARGET_SHA="$(git rev-parse HEAD)"

# Confirm CI and Deploy AWS passed for the exact commit.
gh run list --workflow ci.yml --commit "${TARGET_SHA}" --status success --limit 1
gh run list --workflow deploy-aws.yml --commit "${TARGET_SHA}" --status success --limit 5

# Create a release. If the tag does not exist yet, gh creates it at TARGET_SHA.
gh release create "${TAG}" \
  --target "${TARGET_SHA}" \
  --title "${TAG}" \
  --generate-notes \
  --fail-on-no-commits
```

If you want to create and push an annotated tag first, use:

```bash
TAG=vX.Y.Z
git tag -a "${TAG}" -m "${TAG}"
git push origin "${TAG}"
gh release create "${TAG}" --verify-tag --title "${TAG}" --generate-notes
```

For lower-level automation, `gh api` can also call GitHub's Releases REST API:

```bash
gh api repos/{owner}/{repo}/releases \
  --method POST \
  -f tag_name="${TAG}" \
  -f target_commitish="${TARGET_SHA}" \
  -f name="${TAG}" \
  -F generate_release_notes=true
```

After the release is created, `release.created` triggers the `Publish` workflow.
Watch it with:

```bash
gh run list --workflow publish.yml --limit 5
gh run watch <run-id> --compact --exit-status
```

Do not create the release until the exact target commit has passed `Deploy AWS`.
The `Publish` workflow enforces this, but checking first avoids a failed release
publication run.

## What the Publish Workflow Does

The `Publish` workflow is triggered by `release.created` and does the following:

### Verify deploy status

- resolves the release tag to a commit SHA
- checks for a successful `Deploy AWS` run for that same SHA
- fails fast if the commit has not been deployed successfully

### Publish npm packages

The workflow builds and tests the repo, then publishes publishable workspace packages if that exact version is not already on npm. It publishes with npm provenance using GitHub Actions OIDC; no long-lived npm token is used.

The workflow runs on Node 24 and installs npm CLI `^11.5.1` before publishing,
which is the npm trusted-publishing prerequisite. It still uses `pnpm publish`
inside each package so `workspace:*` dependencies are rewritten to concrete
package versions before the publish request is sent.

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
- `@fortressauth/desktop-sdk`
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

The list is dependency ordered. In particular, `@fortressauth/desktop-sdk`
must publish before `@fortressauth/electron-sdk`, because pnpm rewrites the
Electron package's `workspace:*` dependency to the exact release version.

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
