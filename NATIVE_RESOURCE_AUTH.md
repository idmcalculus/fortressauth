# Native Resource-Server Authentication

FortressAuth native resource introspection is framework-neutral and multi-client. A native opaque
session is useful only for the audiences granted when that session was issued; it is not a universal
API bearer credential. Native clients and resource servers are registered independently, and no
consumer is part of the core authorization model.

## Implementation checklist

- [x] Preserve system-browser OAuth, PKCE S256, exact redirects, one-time authorization codes,
  native bearer sessions, and browser cookie plus CSRF behavior.
- [x] Validate native-client allowed audiences; legacy entries default to no resource access.
- [x] Validate public resource policy separately from secret credential configuration.
- [x] Bind issued sessions to client, granted audiences, email snapshot, session id, expiry,
  revocation, and only provable authentication time.
- [x] Add SQL/SQLite/PostgreSQL/MySQL and MongoDB persistence contracts and migrations.
- [x] Add bounded, no-store, service-authenticated `POST /auth/resource/introspect`.
- [x] Add independent credential rotation, exact audience/client policy, layered rate limits, and
  append-only redacted audit evidence.
- [x] Bind requested audience and authentication age through stored state and one-time exchange.
- [x] Fail closed with typed errors when a provider cannot prove fresh authentication.
- [x] Update the desktop SDK, OpenAPI, operator docs, AWS secret wiring, and Wraith fixture.
- [x] Complete all repository, coverage, build, publishing, live PostgreSQL/MySQL/MongoDB, scan,
  and tarball gates recorded in the final verification checkpoint.

## Registration contract

`NATIVE_CLIENTS_JSON` is public registration data. `resourceAudiences` is an explicit allowlist;
omitting it preserves old native sessions but grants no resource-server access.

```json
[
  {
    "clientId": "desktop-app",
    "redirectUris": ["desktop-app://auth/callback"],
    "resourceAudiences": ["account-api"]
  }
]
```

`RESOURCE_SERVERS_JSON` is also public policy. Both sides of the client/audience relationship must
agree. Disabled resources cannot authenticate or introspect.

```json
[
  {
    "audience": "account-api",
    "enabled": true,
    "allowedClientIds": ["desktop-app"],
    "rateLimit": { "maxTokens": 120, "windowMs": 60000 }
  }
]
```

`RESOURCE_SERVER_CREDENTIALS_JSON` is secret configuration and must be injected as one secret value
by the production secret manager. Never place it in `appEnv`, YAML, source, a client bundle, logs,
or fixtures. Each audience has an independent credential set (one to four entries) for rotation.
Credential ids must be globally unique. Secrets must be 43-256 unpadded base64url/hexadecimal
characters (`A-Z`, `a-z`, `0-9`, `_`, `-`), and the server uses the same grammar for configuration
and Bearer authentication. It hashes secrets immediately while loading configuration. Plaintext
credentials are not persisted.

To create the first credential without printing it, generate at least 256 bits locally, assemble the
secret JSON in memory, and write the complete JSON value directly to the audience's approved secret
container. On AWS, `packages/infra-aws` provisions the
`RESOURCE_SERVER_CREDENTIALS_JSON` container declared by `secretEnvKeys`; operators then use
`aws secretsmanager put-secret-value` out of band. Do not pass the value through shell history or CI
logs.

Rotation is overlap-based:

1. Generate a new independent secret and add it as a second enabled credential with a new id.
2. Redeploy FortressAuth, distribute the new value through the resource server's secret manager,
   restart that resource server, and verify introspection with the new credential.
3. Mark the old credential disabled (or remove it), redeploy FortressAuth, and verify the old value
   receives `401 {"active":false}`.
4. Remove the retired value from every secret manager according to the retention policy.

Never reuse a credential across audiences. Startup rejects shared credential hashes, duplicate ids,
credentials for unknown audiences, and enabled resources without an active credential.

## Session and introspection contract

The native authorization request may include `audience=<registered-audience>`. FortressAuth binds it
into server-stored OAuth state, the one-time authorization grant, and the newly issued session. A
later configuration change cannot add an audience to an existing session. Legacy sessions with no
client/audience binding remain usable through the pre-existing native-session contract where safe,
but introspection returns inactive.

Resource servers call only the HTTPS endpoint:

```http
POST /auth/resource/introspect HTTP/1.1
Authorization: Bearer <resource-server-specific-credential>
Content-Type: application/x-www-form-urlencoded

token=<opaque-native-session>&audience=account-api
```

Only the exact media type is accepted (no charset parameter). The form must contain exactly one
`token` and one `audience`; extra or repeated fields are rejected. Headers, fields, and the complete
body are bounded. The resource server is authenticated before the repository session lookup, and
its audience must exactly equal the requested audience.

All inactive causes use the same body:

```json
{"active":false}
```

Successful responses have only these fields:

```json
{
  "active": true,
  "sub": "019...",
  "email": "user@example.com",
  "email_verified": true,
  "aud": "account-api",
  "client_id": "desktop-app",
  "exp": 1234567890,
  "sid": "019...",
  "auth_time": null
}
```

`email` may be null. `auth_time` is Unix seconds when proven and otherwise null. Identity, email
snapshot, client, audience, expiry, session id, and authentication time come only from server state;
callers cannot submit claims. The existing selector/verifier token is validated through the
repository with constant-time verifier comparison. Logout or explicit session deletion is atomic at
the repository boundary, and a subsequent lookup is inactive. Expiry, missing/deleted/disabled or
locked accounts, unverified email, legacy bindings, and policy mismatch are also inactive.

The endpoint returns `401` for resource-credential failure, `400`/`413`/`415` for strict request
failures, `429` for rate limits, and `503` if lookup or required audit persistence fails. It always
sends `Cache-Control: no-store`. Consumers must treat every non-200 response and every
`{"active":false}` response as unauthenticated without trying to distinguish the cause.

## Authentication age and step-up

Clients request a sensitive-operation ceremony by setting both `audience` and
`max_age=<seconds>` in the native authorization request. `DesktopAuthClient.signIn` accepts these as
`{ audience, maxAgeSeconds }`. FortressAuth binds client, exact redirect, PKCE challenge, desktop
state, audience, and max age into consumed server state; callback query values cannot replace them.

Provider SSO completion is not automatically fresh authentication. An OAuth provider adapter must
explicitly implement `supportsFreshAuthentication: true`, force the provider's supported ceremony,
validate signed provider evidence, and return an `authenticationEvidence.authenticatedAt` that
satisfies the bound max age. Otherwise FortressAuth fails closed with `STEP_UP_UNSUPPORTED` or
`STEP_UP_FAILED` and issues no falsely fresh session. The bundled providers do not currently claim
this capability.

For a sensitive resource operation, first require active introspection, then reject a null/future
`auth_time` or one older than the operation's own maximum age. `isAuthenticationFresh` from
`@fortressauth/core` implements this check for server code. Do not derive freshness from token
exchange, introspection, session restoration, or refresh time.

## Rate limits, audit, and privacy

Introspection has an independent limiter with global and trusted-source dimensions plus per-resource,
requested-audience, source, and combined dimensions. Public per-resource limits live in
`RESOURCE_SERVERS_JSON`; global defaults are controlled by
`RESOURCE_INTROSPECTION_GLOBAL_MAX_TOKENS` and
`RESOURCE_INTROSPECTION_GLOBAL_WINDOW_MS`. Redis operation fails closed for this security boundary.
`X-Forwarded-For` is used only when `TRUSTED_PROXY_HOP_COUNT` is configured for the actual proxy
chain.

Every decision appends an audit row/document before an identity response is released, except
rate-limit denial bursts, which are aggregated to one durable event per enforcement window and
scope. Evidence uses
hashes for resource, requested audience, token selector, client, and source identity; only the stable
internal session id and outcome remain directly visible. Request logging is disabled for the route.
Authorization headers, tokens, bodies, emails, identity claims, callback codes, provider details,
and credential values must never be logged.

SQL deployments prune audit evidence hourly using
`RESOURCE_INTROSPECTION_AUDIT_RETENTION_DAYS` (90 days by default). MongoDB installs an equivalent
TTL index and also exposes explicit pruning. Adjust retention only to an approved policy; it is
bounded to 1-3650 days.

## Migration and backward compatibility

SQL migrations `006_native_authorization_grants` and `007_native_resource_auth` add the one-time
grant store, nullable legacy-safe session/user/state fields, and the introspection audit table.
MongoDB documents treat absent fields as null and add audit and lookup indexes. Run migrations
before enabling resource registration, then deploy application code, then inject credentials and
enable the resource. Migration re-runs are idempotent. Existing browser cookie/CSRF flows and native
session/logout endpoints are unchanged; old native-client entries and old sessions receive no
resource access.

## Wraith compatibility fixture (one consumer)

The checked-in AWS example files use this public registration only as an operator fixture:

```text
client id: wraith
redirect URI: wraith://auth/callback
allowed audience: wraith-api
```

Wraith's control plane environment is:

```text
FORTRESS_VERIFIER_MODE=introspection
FORTRESS_CLIENT_ID=wraith
FORTRESS_INTROSPECTION_URL=https://<fortressauth-host>/auth/resource/introspect
FORTRESS_AUDIENCE=wraith-api
FORTRESS_INTROSPECTION_SECRET=<the wraith-api credential from its secret manager>
```

The desktop must keep the opaque session in Rust and send it only to its own control plane; React
must never receive it. Because `DesktopAuthClient` is TypeScript, Wraith must implement the same
protocol in a Rust controller or separately trusted sidecar rather than instantiate it in the
WebView. A renderer-callable HTTP plugin avoids CORS but does not satisfy this token-ownership rule.

Remaining Wraith-side smoke tests are intentionally not performed in this repository:

- login through the packaged system-browser/deep-link flow and confirm the token stays Rust-owned;
- active control-plane introspection returns `aud=wraith-api` and `client_id=wraith`;
- wrong secret, wrong audience, another client's session, and post-logout reuse are rejected;
- a sensitive operation rejects null/stale `auth_time` and accepts only provider-proven freshness;
- no token, credential, email, callback code, or provider detail appears in desktop/control-plane logs.

## Verification checkpoint (2026-07-14)

Repository verification completed against the checked-out worktree after the final migration and
request-logging changes:

- `pnpm lint`: 31 tasks passed.
- `pnpm typecheck`: 50 tasks passed.
- `pnpm test`: 55 tasks passed; the unconfigured aggregate run intentionally skipped external
  MongoDB tests, which were run separately below.
- `pnpm build`: 30 tasks passed.
- `pnpm test:coverage`: 42 tasks passed; core coverage was 93.39% statements, 87.09% branches,
  95.74% functions, and 93.75% lines across 246 tests. Server coverage was 95.31% statements,
  92.82% branches, 95.60% functions, and 95.47% lines.
- `pnpm validate:publishing` and `git diff --check`: passed.
- SQL adapter suite: 138 tests passed against SQLite, PostgreSQL 17, and MySQL 8.4. This included
  concurrent migration locking, bounded indexed columns, MySQL `TEXT` redirect columns, and
  repeatable migration coverage for dialect-specific DDL behavior.
- MongoDB 8 adapter suite: 22 tests passed, including audit retention and TTL-index coverage.
- Server integration suite: 102 tests passed, including strict active/inactive response shapes,
  service credential rotation and isolation, malformed and oversized requests, logout revocation,
  rate limiting, browser CSRF regression, and absence of introspection request logs.
- Fresh `0.2.0` tarballs for core, SQL, MongoDB, server, desktop, and Electron packages contained
  only publishable output, no source/test/coverage/environment/key material, no `workspace:`
  dependencies, and only exact `0.2.0` internal dependency versions.
- Credential wiring scan found no `RESOURCE_SERVER_CREDENTIALS_JSON` value in checked-in AWS YAML;
  only documentation, source declarations, secret-key wiring, and synthetic tests reference it.
- Disposable PostgreSQL, MySQL, and MongoDB verification containers were removed after testing.

These checks do not exercise deployed secret-manager contents, cloud networking, a real provider
step-up ceremony, or a packaged Wraith/control-plane flow. Those remain operator and consumer
acceptance work, not evidence supplied by this checkpoint.

## Completion boundary

Passing local checks establishes only the reusable in-repository foundation. Production readiness
still requires operator registration, independent credentials in deployment and Wraith secret
managers, migration/deployment, real-provider proof testing, consumer sandbox tests, monitoring,
rotation practice, and independent security review.
