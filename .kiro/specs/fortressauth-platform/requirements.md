# Requirements Document

## Introduction

FortressAuth is a secure-by-default, database-agnostic authentication library built with TypeScript and hexagonal architecture. This document captures the comprehensive requirements for the platform, including existing functionality and planned improvements.

The project is structured as a monorepo containing:
- Core authentication library (`packages/core`)
- Database adapters (`packages/adapter-sql`)
- HTTP server (`packages/server`)
- Framework SDKs (`packages/react-sdk`, `packages/vue-sdk`, etc.)
- Landing/marketing website (`landing/`)
- Documentation, changelog, and about pages

## Glossary

- **FortressAuth**: The main authentication orchestration class that coordinates all authentication operations
- **User**: A registered entity with email, verification status, and optional account lockout
- **Account**: A credential record linking a User to an authentication provider (email/password or OAuth)
- **Session**: A time-limited authentication token allowing users to access protected resources
- **Split_Token**: A security pattern using selector:verifier format where only the hash is stored
- **Rate_Limiter**: A component that limits authentication attempts to prevent brute force attacks
- **Email_Provider**: A pluggable service for sending verification and password reset emails
- **Auth_Repository**: The persistence layer interface for storing users, accounts, sessions, and tokens
- **Adapter**: An implementation of a port interface for specific infrastructure (SQL, Redis, etc.)
- **SDK**: Software Development Kit providing framework-specific integrations (React, Vue, etc.)
- **Landing_Site**: The marketing website with documentation, changelog, and about pages

## Requirements

### Requirement 1: User Registration

**User Story:** As a new user, I want to create an account with my email and password, so that I can access the authentication system.

#### Acceptance Criteria

1. WHEN a user submits valid email and password, THE FortressAuth SHALL create a new User and Account record
2. WHEN a user submits an email that already exists, THE FortressAuth SHALL return an EMAIL_EXISTS error
3. WHEN a user submits a password shorter than the configured minimum length, THE FortressAuth SHALL return a PASSWORD_TOO_WEAK error
4. WHEN a user submits a password longer than the configured maximum length, THE FortressAuth SHALL return a PASSWORD_TOO_WEAK error
5. THE FortressAuth SHALL hash passwords using Argon2id with OWASP-recommended parameters
6. WHEN a user successfully registers, THE FortressAuth SHALL create a session and return a Split_Token
7. WHEN a user successfully registers, THE FortressAuth SHALL send a verification email with a time-limited token
8. THE FortressAuth SHALL normalize email addresses to lowercase before storage

### Requirement 2: User Authentication

**User Story:** As a registered user, I want to sign in with my credentials, so that I can access my account.

#### Acceptance Criteria

1. WHEN a user submits valid credentials, THE FortressAuth SHALL create a new Session and return a Split_Token
2. WHEN a user submits invalid credentials, THE FortressAuth SHALL return an INVALID_CREDENTIALS error
3. WHEN a user submits credentials for a non-existent email, THE FortressAuth SHALL perform a dummy hash operation to prevent timing attacks
4. WHEN a user's account is locked, THE FortressAuth SHALL return an ACCOUNT_LOCKED error before password verification
5. WHEN a user's email is not verified, THE FortressAuth SHALL return an EMAIL_NOT_VERIFIED error
6. THE FortressAuth SHALL record all login attempts with success/failure status and IP address
7. WHEN rate limiting is enabled, THE FortressAuth SHALL consume a rate limit token for every login attempt

### Requirement 3: Session Management

**User Story:** As an authenticated user, I want my session to be secure and manageable, so that my account remains protected.

#### Acceptance Criteria

1. THE Session SHALL use a Split_Token format with 32-byte cryptographic random selector and verifier
2. THE FortressAuth SHALL store only the SHA-256 hash of the verifier in the database
3. WHEN validating a session, THE FortressAuth SHALL use constant-time comparison for the verifier hash
4. WHEN a session has expired, THE FortressAuth SHALL return a SESSION_EXPIRED error and delete the session
5. WHEN a user signs out, THE FortressAuth SHALL delete the session from the database
6. THE Session SHALL store optional metadata including IP address and user agent

### Requirement 4: Email Verification

**User Story:** As a registered user, I want to verify my email address, so that I can prove ownership and enable full account access.

#### Acceptance Criteria

1. WHEN a user registers, THE FortressAuth SHALL create an EmailVerificationToken with configurable TTL
2. THE EmailVerificationToken SHALL use the Split_Token format for security
3. WHEN a user submits a valid verification token, THE FortressAuth SHALL mark the user's email as verified
4. WHEN a user submits an expired verification token, THE FortressAuth SHALL return an EMAIL_VERIFICATION_EXPIRED error
5. WHEN a user submits an invalid verification token, THE FortressAuth SHALL return an EMAIL_VERIFICATION_INVALID error
6. THE Email_Provider SHALL send verification emails with a link containing the raw token

### Requirement 5: Password Reset

**User Story:** As a user who forgot my password, I want to reset it securely, so that I can regain access to my account.

#### Acceptance Criteria

1. WHEN a user requests a password reset for an existing email, THE FortressAuth SHALL create a PasswordResetToken and send an email
2. WHEN a user requests a password reset for a non-existent email, THE FortressAuth SHALL return success to prevent email enumeration
3. THE PasswordResetToken SHALL use the Split_Token format with configurable TTL
4. WHEN a user submits a valid reset token and new password, THE FortressAuth SHALL update the password hash
5. WHEN a user successfully resets their password, THE FortressAuth SHALL invalidate all existing sessions
6. WHEN a user submits an expired reset token, THE FortressAuth SHALL return a PASSWORD_RESET_EXPIRED error
7. WHEN a user submits a weak new password, THE FortressAuth SHALL return a PASSWORD_TOO_WEAK error

### Requirement 6: Rate Limiting

**User Story:** As a system administrator, I want to limit authentication attempts, so that brute force attacks are prevented.

#### Acceptance Criteria

1. THE Rate_Limiter SHALL implement a token bucket algorithm with configurable limits
2. WHEN rate limiting is enabled and the limit is exceeded, THE FortressAuth SHALL return a RATE_LIMIT_EXCEEDED error
3. THE Rate_Limiter SHALL support both memory-based and Redis-based backends
4. THE Rate_Limiter SHALL compute a composite key from multiple signals including IP address, email, and user agent fingerprint
5. WHILE rate limiting is enabled, THE FortressAuth SHALL check rate limits before processing authentication requests
6. THE Rate_Limiter SHALL apply rate limits to all endpoints except health checks and static documentation
7. THE Rate_Limiter SHALL support configurable limits per endpoint type (login, signup, password-reset, verify-email)
8. WHEN rate limiting by composite key, THE FortressAuth SHALL also maintain separate per-IP limits as a fallback
9. THE Rate_Limiter SHALL log rate limit violations with full request context for security monitoring

### Requirement 7: Account Lockout

**User Story:** As a system administrator, I want accounts to be locked after repeated failed attempts, so that credential stuffing attacks are mitigated.

#### Acceptance Criteria

1. WHEN lockout is enabled and failed attempts exceed the threshold, THE FortressAuth SHALL lock the account for a configurable duration
2. WHILE an account is locked, THE FortressAuth SHALL reject login attempts before password verification
3. WHEN the lockout duration expires, THE User SHALL be able to attempt login again
4. THE FortressAuth SHALL count failed attempts within a configurable time window

### Requirement 8: Database Abstraction

**User Story:** As a developer, I want to use FortressAuth with my preferred database, so that I can integrate it into my existing infrastructure.

#### Acceptance Criteria

1. THE Auth_Repository port SHALL define all persistence operations as an interface
2. THE SqlAdapter SHALL implement Auth_Repository for PostgreSQL, MySQL, and SQLite via Kysely
3. THE SqlAdapter SHALL provide automatic database migrations
4. THE Auth_Repository SHALL support transactions for atomic operations
5. WHEN creating a user within a transaction, THE Auth_Repository SHALL rollback on failure

### Requirement 9: Email Provider Abstraction

**User Story:** As a developer, I want to use my preferred email service, so that I can integrate FortressAuth with my existing email infrastructure.

#### Acceptance Criteria

1. THE Email_Provider port SHALL define sendVerificationEmail and sendPasswordResetEmail methods
2. THE FortressAuth SHALL support a console provider for development that logs to terminal
3. THE FortressAuth SHALL support Resend as a production email provider
4. THE FortressAuth SHALL support AWS SES as a production email provider
5. THE FortressAuth SHALL support SendGrid as a production email provider
6. THE FortressAuth SHALL support Nodemailer/SMTP as a production email provider (Planned)
7. THE FortressAuth SHALL support Postmark as a production email provider (Planned)
8. THE FortressAuth SHALL support Mailgun as a production email provider (Planned)
9. THE Email_Provider SHALL be configurable via environment variables
10. THE Email_Provider SHALL support customizable email templates
11. WHEN a developer needs a provider not built-in, THE Email_Provider port SHALL allow custom implementations

### Requirement 10: HTTP Server

**User Story:** As a developer, I want a standalone HTTP server, so that I can deploy FortressAuth as a microservice.

#### Acceptance Criteria

1. THE Server SHALL expose RESTful endpoints for all authentication operations
2. THE Server SHALL set HttpOnly, Secure, and SameSite cookie attributes for session tokens
3. THE Server SHALL provide health check and metrics endpoints
4. THE Server SHALL generate OpenAPI documentation automatically
5. THE Server SHALL support CORS configuration for cross-origin requests
6. THE Server SHALL handle graceful shutdown on SIGTERM and SIGINT signals

### Requirement 11: Client SDKs

**User Story:** As a frontend developer, I want framework-specific SDKs, so that I can easily integrate authentication into my application.

#### Acceptance Criteria

1. THE React_SDK SHALL provide hooks and context for authentication state management
2. THE Vue_SDK SHALL provide composables and a provider for authentication state management
3. THE SDKs SHALL handle cookie-based session management automatically
4. THE SDKs SHALL provide TypeScript types for all authentication operations
5. THE SDKs SHALL support configurable API base URLs via environment variables

### Requirement 12: Security Best Practices

**User Story:** As a security-conscious developer, I want FortressAuth to follow security best practices, so that my users' data is protected.

#### Acceptance Criteria

1. THE FortressAuth SHALL use Argon2id with memory cost 19456 KB, time cost 2, parallelism 1
2. THE FortressAuth SHALL use 32-byte cryptographic random values for all tokens
3. THE FortressAuth SHALL use constant-time comparison for all secret comparisons
4. THE FortressAuth SHALL prevent timing attacks by performing dummy operations on invalid inputs
5. THE FortressAuth SHALL never expose password hashes or raw tokens in API responses
6. THE Server SHALL set security headers including Content-Security-Policy and X-Frame-Options
7. THE FortressAuth SHALL sanitize and validate all user inputs before processing
8. THE Server SHALL implement CSRF protection for state-changing operations
9. THE FortressAuth SHALL reject passwords that appear in common breach lists (optional configuration)

### Requirement 13: Configuration Management

**User Story:** As a developer, I want flexible configuration options, so that I can customize FortressAuth for my use case.

#### Acceptance Criteria

1. THE FortressAuth SHALL accept configuration via a typed schema with sensible defaults
2. THE FortressAuth SHALL validate configuration using Zod schemas
3. THE Server SHALL support configuration via environment variables
4. THE FortressAuth SHALL expose read-only configuration to host applications
5. THE configuration SHALL include session TTL, password requirements, rate limits, and lockout settings

### Requirement 14: OAuth Provider Support (Planned)

**User Story:** As a user, I want to sign in with my existing Google or GitHub account, so that I don't need to create another password.

#### Acceptance Criteria

1. WHEN a user initiates OAuth login, THE FortressAuth SHALL redirect to the provider's authorization endpoint
2. WHEN the OAuth provider returns an authorization code, THE FortressAuth SHALL exchange it for tokens
3. WHEN a user completes OAuth login for the first time, THE FortressAuth SHALL create a User and OAuth Account
4. WHEN a user completes OAuth login with an existing account, THE FortressAuth SHALL create a new Session
5. THE Account entity SHALL support Google and GitHub as OAuth providers
6. THE FortressAuth SHALL store only the provider user ID, not OAuth tokens

### Requirement 15: Multi-Factor Authentication (Planned)

**User Story:** As a security-conscious user, I want to enable two-factor authentication, so that my account has an additional layer of protection.

#### Acceptance Criteria

1. WHEN a user enables MFA, THE FortressAuth SHALL generate a TOTP secret and display a QR code
2. WHEN a user with MFA enabled signs in, THE FortressAuth SHALL require a valid TOTP code
3. THE FortressAuth SHALL support backup codes for account recovery
4. THE FortressAuth SHALL allow users to disable MFA with proper verification

### Requirement 16: Audit Logging (Planned)

**User Story:** As a system administrator, I want comprehensive audit logs, so that I can monitor and investigate security events.

#### Acceptance Criteria

1. THE FortressAuth SHALL log all authentication events with timestamps and metadata
2. THE audit log SHALL include user ID, action type, IP address, and user agent
3. THE audit log SHALL be queryable by user ID and time range
4. THE FortressAuth SHALL support pluggable audit log destinations

### Requirement 17: Input Validation

**User Story:** As a developer, I want all user inputs to be validated and sanitized, so that injection attacks are prevented.

#### Acceptance Criteria

1. WHEN a user submits an email, THE FortressAuth SHALL validate it against RFC 5322 format
2. WHEN a user submits any input, THE FortressAuth SHALL sanitize it to prevent injection attacks
3. THE FortressAuth SHALL reject inputs containing null bytes or control characters
4. THE FortressAuth SHALL enforce maximum length limits on all string inputs


### Requirement 18: Example Applications

**User Story:** As a developer evaluating FortressAuth, I want consistent, well-designed example applications for each framework, so that I can quickly understand how to integrate authentication into my project.

#### Acceptance Criteria

1. THE example applications SHALL have a unified UI design across all frameworks (React, Svelte, Vue, Angular, Expo, Electron)
2. THE example applications SHALL use the React example as the design template/standard
3. THE example applications SHALL include proper form validation (email format, password length, password confirmation match)
4. THE example applications SHALL provide user feedback via alerts/dialogs for success and error states
5. THE example applications SHALL display loading states during async operations
6. THE example applications SHALL handle all authentication flows (sign up, sign in, sign out, email verification, password reset)
7. THE example applications SHALL connect to the FortressAuth server without CORS errors
8. THE example applications SHALL use environment variables for API base URL configuration
9. THE example applications SHALL sanitize user inputs before submission
10. THE example applications SHALL display email verification status for authenticated users
11. THE example applications SHALL include accessible form labels and error messages
12. THE example applications SHALL use consistent color scheme, typography, and spacing

### Requirement 19: Error Message Security

**User Story:** As a security-conscious developer, I want error messages to be safe for production, so that attackers cannot gain information about the system.

#### Acceptance Criteria

1. WHILE in production mode, THE FortressAuth SHALL return generic error messages that do not reveal internal system details
2. WHILE in development mode, THE FortressAuth SHALL return detailed error messages to aid debugging
3. THE Server SHALL distinguish between production and development modes via environment configuration
4. THE error responses SHALL include an error code that developers can reference in documentation
5. THE FortressAuth SHALL never include stack traces, database errors, or internal paths in production error responses
6. WHEN logging errors internally, THE FortressAuth SHALL include full details for debugging while sanitizing user-facing responses

### Requirement 20: Landing Site and Documentation

**User Story:** As a potential user, I want to access marketing materials and documentation, so that I can evaluate and learn how to use FortressAuth.

#### Acceptance Criteria

1. THE Landing_Site SHALL provide a marketing homepage explaining FortressAuth features and benefits
2. THE Landing_Site SHALL provide comprehensive API documentation
3. THE Landing_Site SHALL provide a changelog documenting version history and breaking changes
4. THE Landing_Site SHALL provide an about page with project information and team details
5. THE Landing_Site SHALL be accessible and follow WCAG 2.1 AA guidelines
6. THE Landing_Site SHALL support internationalization for multiple languages

### Requirement 21: Test Coverage

**User Story:** As a developer, I want comprehensive test coverage, so that I can be confident in the system's correctness.

#### Acceptance Criteria

1. THE codebase SHALL maintain greater than 95% test coverage across all packages
2. THE test suite SHALL include both unit tests and property-based tests
3. THE CI pipeline SHALL fail if coverage drops below the 95% threshold
4. THE test coverage SHALL be measured and reported for each package independently
5. THE test suite SHALL include integration tests for database adapters and HTTP endpoints

### Requirement 22: Secrets Management

**User Story:** As a developer deploying FortressAuth, I want secure secrets management, so that sensitive credentials are protected in all environments.

#### Acceptance Criteria

1. THE FortressAuth SHALL support loading secrets from environment variables as the default method
2. THE FortressAuth SHALL support loading secrets from .env files for local development
3. THE FortressAuth SHALL support AWS Secrets Manager for production deployments (Planned)
4. THE FortressAuth SHALL support HashiCorp Vault for enterprise deployments (Planned)
5. THE FortressAuth SHALL support Azure Key Vault for Azure deployments (Planned)
6. THE FortressAuth SHALL support Google Cloud Secret Manager for GCP deployments (Planned)
7. THE FortressAuth SHALL validate that all required secrets are present at startup
8. THE FortressAuth SHALL never log or expose secret values in error messages or stack traces
9. THE FortressAuth SHALL support secret rotation without service restart where possible
10. THE Server SHALL provide a secrets health check endpoint that reports missing secrets without exposing values
11. THE configuration SHALL clearly document which values are secrets vs regular configuration

### Requirement 23: Deployment and Infrastructure

**User Story:** As a developer, I want easy deployment options, so that I can quickly get FortressAuth running in production.

#### Acceptance Criteria

1. THE Server SHALL be deployable to Railway with one-click deployment
2. THE Server SHALL be deployable to AWS (ECS, Lambda, or EC2) for production scale (Planned)
3. THE Server SHALL provide Docker images for containerized deployments
4. THE Server SHALL support PostgreSQL as the primary production database
5. THE Server SHALL support Railway's managed PostgreSQL service
6. THE Server SHALL support Railway's managed Redis service for rate limiting
7. THE deployment SHALL include automatic database migrations on startup
8. THE deployment SHALL support health checks for container orchestration
9. THE deployment SHALL support graceful shutdown for zero-downtime deployments
10. THE repository SHALL include Railway configuration files (railway.json, railway.toml)
11. THE repository SHALL include infrastructure-as-code templates for AWS deployment (Planned)
12. THE Landing_Site SHALL be deployable to Vercel for the marketing/docs site

### Requirement 24: AI/LLM Developer Experience

**User Story:** As a developer using AI coding assistants, I want FortressAuth to be easily discoverable and usable by LLMs, so that AI can help me implement authentication correctly.

#### Acceptance Criteria

1. THE documentation SHALL include llms.txt file following the llms.txt standard for AI discoverability
2. THE repository SHALL include comprehensive JSDoc comments on all public APIs for LLM context
3. THE documentation SHALL provide copy-paste ready code examples for common use cases
4. THE error messages SHALL be descriptive enough for LLMs to suggest fixes
5. THE API design SHALL follow predictable patterns that LLMs can easily learn
6. THE package names SHALL be descriptive and searchable (e.g., @fortressauth/core, @fortressauth/react-sdk)
7. THE README SHALL include a "Quick Start" section optimized for LLM consumption
8. THE documentation SHALL include an "AI Integration Guide" explaining how to use FortressAuth with AI assistants
9. THE repository SHALL include .cursorrules or similar AI assistant configuration files
10. THE TypeScript types SHALL be comprehensive and self-documenting for AI code completion
11. THE examples/ directory SHALL contain working examples for each framework that LLMs can reference
12. THE FortressAuth SHALL provide an MCP (Model Context Protocol) server for direct AI assistant integration
13. THE MCP server SHALL expose tools for user management (create, read, update, delete users)
14. THE MCP server SHALL expose tools for session management (validate, invalidate sessions)
15. THE MCP server SHALL expose resources for reading auth configuration and system status
16. THE MCP server SHALL be published as @fortressauth/mcp-server package

### Requirement 25: Admin Dashboard

**User Story:** As a system administrator, I want a web-based dashboard to manage users, sessions, and authentication settings, so that I can monitor and administer the auth system without direct database access.

#### Acceptance Criteria

1. THE Dashboard SHALL provide a web interface for viewing and managing users
2. THE Dashboard SHALL allow administrators to view, search, and filter user accounts
3. THE Dashboard SHALL allow administrators to manually verify user emails
4. THE Dashboard SHALL allow administrators to lock/unlock user accounts
5. THE Dashboard SHALL allow administrators to invalidate user sessions
6. THE Dashboard SHALL display login attempt history and security events
7. THE Dashboard SHALL provide real-time metrics (active sessions, login rates, etc.)
8. THE Dashboard SHALL require authentication with admin-level permissions
9. THE Dashboard SHALL support role-based access control (viewer, editor, admin)
10. THE Dashboard SHALL provide a database table browser for auth-related tables
11. THE Dashboard SHALL allow administrators to export user data (GDPR compliance)
12. THE Dashboard SHALL be deployable as a separate service or embedded in the main server
13. THE Dashboard SHALL be located at dashboard/ in the repository root (similar to landing/)
