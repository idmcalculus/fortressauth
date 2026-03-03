# Railway + Vercel Deployment Guide

This runbook covers:
- `@fortressauth/server` on Railway with Railway PostgreSQL
- `landing` and demo pages on Vercel
- production-safe cookie, CORS, and release checks

## 1) Environment Variable Sets

Use one of the Railway sets below.

### Railway API Set A (Recommended: Same Top-Level Domain)

Use this when you have custom domains such as:
- landing: `https://app.example.com`
- api: `https://api.example.com`

```bash
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
DATABASE_URL=<RAILWAY_POSTGRES_DATABASE_URL>
BASE_URL=https://app.example.com
COOKIE_SECURE=true
COOKIE_SAMESITE=lax
CSRF_COOKIE_SECURE=true
CSRF_COOKIE_SAMESITE=lax
CORS_ORIGINS=https://app.example.com
LOG_LEVEL=info
METRICS_ENABLED=true
EMAIL_PROVIDER=console
```

### Railway API Set B (Fallback: Different Top-Level Domains)

Use this when landing and API are on different sites such as:
- landing: `https://your-landing.vercel.app`
- api: `https://your-api.up.railway.app`

```bash
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
DATABASE_URL=<RAILWAY_POSTGRES_DATABASE_URL>
BASE_URL=https://your-landing.vercel.app
COOKIE_SECURE=true
COOKIE_SAMESITE=none
CSRF_COOKIE_SECURE=true
CSRF_COOKIE_SAMESITE=none
CORS_ORIGINS=https://your-landing.vercel.app
LOG_LEVEL=info
METRICS_ENABLED=true
EMAIL_PROVIDER=console
```

Notes:
- Keep `COOKIE_DOMAIN` and `CSRF_COOKIE_DOMAIN` unset unless you explicitly need shared-domain cookies.
- Add your custom production domain to `CORS_ORIGINS` if it differs from `BASE_URL`.

### Vercel Landing Project Set

Project root should be `landing`.

```bash
AUTH_API_URL=https://api.example.com
NEXT_PUBLIC_REACT_DEMO_URL=https://react-demo.example.com
NEXT_PUBLIC_VUE_DEMO_URL=https://vue-demo.example.com
NEXT_PUBLIC_SVELTE_DEMO_URL=https://svelte-demo.example.com
NEXT_PUBLIC_ANGULAR_DEMO_URL=https://angular-demo.example.com
```

If demos are hosted under the same landing domain/path, use:

```bash
AUTH_API_URL=https://api.example.com
NEXT_PUBLIC_REACT_DEMO_URL=/react-demo
NEXT_PUBLIC_VUE_DEMO_URL=/vue-demo
NEXT_PUBLIC_SVELTE_DEMO_URL=/svelte-demo
NEXT_PUBLIC_ANGULAR_DEMO_URL=/angular-demo
```

### Demo Project API Variables

If demos are separate Vercel projects, set these:

React (`examples/web-react`):
```bash
VITE_API_URL=https://api.example.com
```

Vue (`examples/web-vue`):
```bash
VITE_API_URL=https://api.example.com
```

Svelte (`examples/web-svelte`):
```bash
VITE_API_URL=https://api.example.com
```

Angular (`examples/web-angular/src/environments/environment.prod.ts`):
```ts
export const environment = {
  production: true,
  apiUrl: 'https://api.example.com',
};
```

## 2) Railway Service Setup

1. Create Railway project and connect this repository.
2. Add Railway PostgreSQL service.
3. Deploy API service from this repo using `docker/Dockerfile`.
4. Set API environment variables from Set A or Set B above.
5. Confirm health endpoint: `GET /health`.

## 3) Vercel Setup

1. Create Vercel project for landing with root directory `landing`.
2. Add Vercel landing env vars from the Landing set above.
3. Deploy each demo as static project (or host demos under landing paths).
4. Ensure demo URLs in landing point to deployed demo routes/domains.

## 4) Release Checklist (Railway + Vercel Topology)

### Build and Quality
- [ ] `pnpm lint` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm build` passes
- [ ] landing auth pages are reachable: `/verify-email` and `/reset-password`

### API Deployment (Railway)
- [ ] Railway PostgreSQL attached and `DATABASE_URL` set
- [ ] Railway env set copied from Set A or Set B
- [ ] API responds on `/health`
- [ ] API docs endpoint is reachable (`/docs` on API domain)

### Frontend Deployment (Vercel)
- [ ] landing project deployed from `landing` root
- [ ] `AUTH_API_URL` is set to Railway API domain
- [ ] `NEXT_PUBLIC_*_DEMO_URL` values point to valid demo routes
- [ ] all demo links from landing Examples section open correctly

### Auth and Security Verification
- [ ] Sign up works end-to-end
- [ ] Email verification works from `/verify-email?token=...`
- [ ] Password reset works from `/reset-password?token=...`
- [ ] Sign in and sign out work with cookies enabled
- [ ] No browser CORS errors in production
- [ ] CSRF-protected POST routes succeed without manual retries

### Post-Deploy Monitoring
- [ ] Railway logs show no repeated 4xx/5xx spikes on `/auth/*`
- [ ] Error rates are acceptable over first 24 hours
- [ ] Rollback plan confirmed (previous Railway/Vercel deployment available)
