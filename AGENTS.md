# AGENTS.md

This file summarizes the FortressAuth platform specs in `.kiro/specs/fortressauth-platform/` for agents and contributors.

**Project Summary**
- FortressAuth is a secure-by-default, database-agnostic authentication library built with TypeScript.
- Architecture is hexagonal (ports-and-adapters) to keep core logic independent from infrastructure.
- The monorepo includes core auth, SQL and MongoDB adapters, OAuth providers, a standalone HTTP server, client SDKs, examples, the landing site, deployment automation, and marketing content.

**Architecture Overview**
- Domain layer: pure business logic in `packages/core/src/domain/`.
- Application layer: orchestrator in `packages/core/src/fortress.ts`.
- Ports layer: interfaces in `packages/core/src/ports/`.
- Adapters layer: infrastructure implementations in `packages/adapter-sql/`, `packages/adapter-mongodb/`, `packages/server/`, and `packages/email-*`.
- OAuth layer: shared primitives in `packages/oauth-core/` and concrete providers in `packages/provider-*`.
- Client SDKs: `packages/react-sdk/`, `packages/vue-sdk/`, `packages/angular-sdk/`, `packages/svelte-sdk/`, `packages/react-native-sdk/`, `packages/expo-sdk/`, and `packages/electron-sdk/`.
- Infrastructure automation: `packages/infra-hetzner/` and `packages/infra-netlify/`.
- Marketing and launch materials: `.kiro/specs/fortressauth-platform/marketing/`.

**Pulumi And Codex Workflow**
- Use the enabled `pulumi@local-plugins` Codex plugin for Pulumi authoring, migration, provider upgrades, Automation API work, ESC, and reusable components.
- Use the plugin-provided MCP server named `pulumi` for Pulumi Registry lookups and Pulumi Cloud stack/resource questions after authenticating with `codex mcp login pulumi`.
- Keep Pulumi code changes scoped to `packages/infra-hetzner/` and `packages/infra-netlify/` unless a broader infrastructure change is explicitly requested.
- Prefer `pulumi preview` for validation when the needed stack config and provider credentials are available.
- Do not run `pulumi up`, `pulumi destroy`, or delegate mutating work to Pulumi Neo without explicit user confirmation.
- When changing Pulumi behavior, update the relevant package README and GitHub Actions workflow docs if the operational process changes.

**Core Security Defaults**
- Split token pattern for sessions and verification/reset tokens.
- Raw token format is `selector:verifier`.
- Selector is 16 bytes (32 hex chars); verifier is 32 bytes (64 hex chars).
- Store only the SHA-256 hash of the verifier in the database.
- Argon2id password hashing with OWASP parameters: memoryCost 19456, timeCost 2, parallelism 1.
- Constant-time comparisons for secret values.
- Dummy hashing for non-existent emails to reduce timing attacks.
- Enforce account lockout on repeated failed attempts.
- Rate limiting with composite keys (IP, email, user agent) plus per-IP fallback.
- CSRF protection for state-changing endpoints.
- Sessions use HttpOnly, Secure, and SameSite cookies.

**Primary Flows and Requirements**
- Sign up creates User + Account, normalizes email to lowercase, creates session, sends verification email.
- Sign in returns session for valid credentials, rejects invalid credentials, respects account lockout and email verification.
- Session validation checks token, compares hashes in constant time, and deletes expired sessions.
- Email verification uses split token, expires by TTL, and marks user verified on success.
- Password reset uses split token, avoids email enumeration, invalidates sessions on reset, and deletes tokens after use.
- Email providers are pluggable via an EmailProvider port and configurable via environment variables.
- SQL adapter supports PostgreSQL, MySQL, and SQLite via Kysely with migrations and transactions.

**Testing and Quality Gates**
- Property-based tests validate correctness properties for critical flows.
- After each task, run `pnpm lint` and `pnpm typecheck` and fix all errors.
- Run relevant package tests when behavior changes; run broader test/build commands before release-sensitive changes.
- Do not modify `biome.json` without explicit user permission.
- Do not mark tasks as complete until the user has manually verified and approved the work.

**Examples and UI Consistency**
- Examples share a unified design system and validation utilities in `examples/shared/`.
- Environment variables for API URLs are required and documented per example.
- CORS configuration must allow credentials and support all examples.
- The `landing/` app and example apps should stay aligned with the server API and current deployment/docs workflow.

**Marketing and Content Guidance**
- Voice: security-first, developer-centric, technically credible, helpful, and inclusive.
- Avoid salesy language or exaggerated claims; explain trade-offs and cite authoritative sources when making security claims.
- Prefer TypeScript in code examples and include error handling.
- Key messaging pillars: security without compromise, developer experience first, flexibility and control, production ready.
- Platform tone adjustments: professional on LinkedIn, conversational on Twitter, educational on Substack, demonstrative on YouTube.

**Contributor Tips**
- Keep core domain logic free of infrastructure dependencies.
- Favor interface-driven changes in ports before adapter updates.
- Keep security behavior consistent across server and SDK layers.
- When adding features, update tests and documentation in the same PR when reasonable.
- When changing release, deploy, or versioned runtime behavior, update the relevant root docs (`README.md`, `CONTRIBUTING.md`, `PUBLISHING.md`) and package docs.
