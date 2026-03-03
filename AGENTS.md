# AGENTS.md

This file summarizes the FortressAuth platform specs in `.kiro/specs/fortressauth-platform/` for agents and contributors.

**Project Summary**
- FortressAuth is a secure-by-default, database-agnostic authentication library built with TypeScript.
- Architecture is hexagonal (ports-and-adapters) to keep core logic independent from infrastructure.
- The monorepo includes core auth, SQL adapter, HTTP server, framework SDKs, examples, landing site, and marketing content.

**Architecture Overview**
- Domain layer: pure business logic in `packages/core/src/domain/`.
- Application layer: orchestrator in `packages/core/src/fortress.ts`.
- Ports layer: interfaces in `packages/core/src/ports/`.
- Adapters layer: infrastructure implementations in `packages/adapter-sql/`, `packages/server/`, `packages/email-*`.
- Client SDKs: `packages/react-sdk/`, `packages/vue-sdk/`, `packages/angular-sdk/`, `packages/svelte-sdk/`.
- Marketing and launch materials: `.kiro/specs/fortressauth-platform/marketing/`.

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
- Do not modify `biome.json` without explicit user permission.
- Do not mark tasks as complete until the user has manually verified and approved the work.

**Examples and UI Consistency**
- Examples share a unified design system and validation utilities in `examples/shared/`.
- Environment variables for API URLs are required and documented per example.
- CORS configuration must allow credentials and support all examples.

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
