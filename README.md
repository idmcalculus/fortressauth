# FortressAuth

FortressAuth is a security-first authentication platform built as a TypeScript monorepo. The core auth engine stays infrastructure-agnostic, while the repository ships the HTTP server, SDKs, OAuth providers, examples, landing site, and deployment automation around it.

## What Is In This Repo

### Core platform

- `packages/core` - domain logic, configuration schema, ports, and the `FortressAuth` application service
- `packages/adapter-sql` - Kysely-backed adapter for PostgreSQL, MySQL, and SQLite
- `packages/adapter-mongodb` - MongoDB adapter
- `packages/server` - standalone HTTP server with OpenAPI docs at `/docs`
- `packages/oauth-core` - shared OAuth primitives

### OAuth providers

- `packages/provider-google`
- `packages/provider-github`
- `packages/provider-apple`
- `packages/provider-discord`
- `packages/provider-linkedin`
- `packages/provider-twitter`
- `packages/provider-microsoft`

### Client SDKs

- `packages/react-sdk`
- `packages/vue-sdk`
- `packages/angular-sdk`
- `packages/svelte-sdk`
- `packages/react-native-sdk`
- `packages/expo-sdk`
- `packages/electron-sdk`

### Email providers

- `packages/email-ses`
- `packages/email-sendgrid`
- `packages/email-smtp`

### Product surfaces

- `landing` - marketing site and product pages
- `examples/web-react`
- `examples/web-vue`
- `examples/web-svelte`
- `examples/web-angular`
- `examples/basic-usage`

### Infrastructure

- `packages/infra-hetzner` - Pulumi stack for the current Hetzner deployment workflow
- `packages/infra-netlify` - Pulumi stack for Netlify frontend site settings, domains, and env configuration

## Security Defaults

- Argon2id password hashing with the configured OWASP-aligned parameters
- Split-token design for sessions, email verification, and password reset flows
- SHA-256 hashing of token verifiers at rest
- Constant-time comparisons for secrets
- Email-enumeration resistance and dummy hashing paths
- CSRF protection for state-changing HTTP endpoints
- Account lockout and rate limiting
- Secure cookie defaults for browser-based flows

## Local Development

### Prerequisites

- Node.js 20+
- pnpm 10+

### Install and validate

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

### Run the API only

The standalone server has sensible local defaults:

```bash
pnpm --filter @fortressauth/server dev
```

That serves:

- API: `http://localhost:3000`
- OpenAPI JSON: `http://localhost:3000/openapi.json`
- Scalar docs: `http://localhost:3000/docs`

### Run the full local product workspace

This starts the landing app, API server, and frontend examples together:

```bash
pnpm run dev
# or
pnpm --filter landing dev
```

Use `pnpm run dev:turbo` only when you explicitly want Turbo to launch every package-level `dev` script independently. That will duplicate the server and demo processes because `landing` already orchestrates them.

## Working With The Packages

Use workspace filters when you only need one surface:

```bash
pnpm --filter @fortressauth/core test
pnpm --filter @fortressauth/server dev
pnpm --filter fortressauth-web-react build
```

## Frontend Deployment

The supported production topology is:

- `landing/` on Netlify at `https://fortressauth.com`
- `https://www.fortressauth.com` redirects to the apex domain
- API on its own domain such as `https://api.fortressauth.com`
- Each web demo deployed separately on its own subdomain:
  - `https://react-demo.fortressauth.com`
  - `https://vue-demo.fortressauth.com`
  - `https://svelte-demo.fortressauth.com`
  - `https://angular-demo.fortressauth.com`

`landing/` uses `AUTH_API_URL` everywhere it needs backend access and requires that env var in every environment. In local integrated dev, `pnpm dev` treats a loopback `AUTH_API_URL` port as the preferred starting point and will move to the next free local API port if needed while keeping the whole stack aligned. Demo links are driven by `NEXT_PUBLIC_*_DEMO_URL`.

Deployment ownership is split intentionally:

- **Netlify Git integration** performs frontend production deployments on merge to `main` and landing deploy previews
- **Pulumi (`packages/infra-netlify`)** manages existing Netlify site build settings, deploy preview flags, custom domains, and project environment variables
- **GitHub Actions** validates IaC, applies Netlify site-setting changes, and runs production smoke checks after frontend smoke is enabled

Landing previews remain enabled, but they are UI/docs previews only. Do not treat them as full auth-flow environments until a staging API exists. Demo previews are disabled because unstable preview origins should not be treated as valid auth origins.

## Documentation Map

The root docs are intentionally small. Use package docs for the details that belong with the code they describe.

- `packages/core/README.md` - core library usage and concepts
- `packages/server/README.md` - server configuration and HTTP surface
- `packages/infra-hetzner/README.md` - Hetzner/Pulumi deployment workflow
- `packages/infra-netlify/README.md` - Netlify/Pulumi frontend deployment workflow
- `CONTRIBUTING.md` - contributor workflow and quality gates
- `PUBLISHING.md` - release and publishing process

## CI, Deploys, and Releases

- `CI` runs on pushes and pull requests to `main`
- `Deploy Hetzner` runs after successful `CI` on `main`, or manually via `workflow_dispatch`
- `Deploy Netlify Infra` runs `pulumi preview`/`pulumi up` for `packages/infra-netlify`
- `Smoke Frontend` checks the deployed landing site, docs proxy, and demo URLs after production frontend changes once repository variable `FRONTEND_SMOKE_ENABLED=true` is set; manual dispatch runs the smoke check on demand
- `Deploy Hetzner` always builds a fresh Docker image from the deployed commit and smoke-tests `/health` and `/openapi.json`
- `Publish` runs from a GitHub Release and requires a successful `Deploy Hetzner` run for the same commit before it publishes npm packages and Docker images

## Contributing

See `CONTRIBUTING.md` before opening a pull request.
