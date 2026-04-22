# Contributing to FortressAuth

This repository is a TypeScript monorepo with a hexagonal core, multiple adapters, SDKs, frontend examples, and deployment automation. Contributions need to keep the core security model and package boundaries intact.

## Before You Start

### Prerequisites

- Node.js 20+
- pnpm 10+
- Git

### Setup

```bash
git clone https://github.com/idmcalculus/fortressauth.git
cd fortressauth
pnpm install
```

Run the standard validation suite before you begin a larger change so you know the baseline is clean:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

## Repository Expectations

### Architecture

- Keep core business logic in `packages/core`
- Keep infrastructure concerns in adapters, the server, or deployment packages
- Add or change ports before coupling core logic to a concrete implementation
- Keep security-sensitive behaviour consistent across server and SDK layers

### Tests and quality gates

Every code change should leave these green:

```bash
pnpm lint
pnpm typecheck
```

Also run the narrowest relevant package tests while iterating, then the broader suite before opening a PR:

```bash
pnpm --filter @fortressauth/server test
pnpm --filter @fortressauth/core test
pnpm test
```

If your change touches examples, frontend apps, or build tooling, run the affected package builds as well.

### Documentation

Update docs in the same PR when behaviour, setup, deployment, or release steps change.

Typical places to update are:

- `README.md` for repo-level navigation and workflow changes
- package-specific READMEs for package-specific usage
- `PUBLISHING.md` for release workflow changes
- `packages/infra-hetzner/README.md` for Hetzner deploy changes

## Branches and commits

Use a short-lived branch off `main`.

Commit messages should follow Conventional Commits where practical:

- `feat:`
- `fix:`
- `docs:`
- `refactor:`
- `test:`
- `chore:`

Examples:

```text
feat: add microsoft oauth provider support
fix: normalize postgres sslmode handling
docs: update release workflow
```

## Pull Requests

A pull request should include:

- a clear summary of the change
- why the change is needed
- the commands you ran to validate it
- screenshots or recordings for UI changes, if relevant
- any follow-up work or known limitations

Keep PRs scoped. If a change spans core logic, SDKs, docs, and infra, explain that coupling explicitly.

## Contributor Checklist

Before opening a PR, make sure you have done the following:

- [ ] updated or added tests where behaviour changed
- [ ] run `pnpm lint`
- [ ] run `pnpm typecheck`
- [ ] run relevant package tests or `pnpm test`
- [ ] updated the affected docs
- [ ] verified examples or deploy flows if your change touches them

## Release Notes for Contributors

Maintainers own the final release process, but contributors should call out any release-sensitive changes in the PR description, especially when a change affects:

- published package APIs
- Docker image contents
- OpenAPI or health version strings
- environment variables
- CI, deploy, or publish workflows
