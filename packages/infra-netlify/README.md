# FortressAuth Netlify Pulumi

Pulumi stack for repeatable Netlify settings around FortressAuth frontend hosting:

- `landing` site on `fortressauth.com`
- `www.fortressauth.com` assigned as an alias and redirected to the apex by `landing/netlify.toml`
- one production live demo, the React app, embedded on `https://fortressauth.com/demo`
- React demo site on `react-demo.fortressauth.com`

Vue, Svelte, and Angular example projects may still exist in Netlify on their default
`.netlify.app` domains, but they are no longer production demo surfaces managed by this stack.

## Role Split

- **Netlify Git integration** creates and deploys the landing and React demo sites from GitHub.
- **Pulumi** manages build settings, deploy preview flags, custom domains, and site environment variables for those existing sites.
- **GitHub Actions** validates the IaC package and runs `pulumi preview`/`pulumi up` for Netlify settings changes.

The current Pulumi Netlify provider manages existing site settings but does not create Git-connected Netlify sites. Bootstrap the sites in Netlify first, then point this stack at their site IDs or names.

## What You Need

- Netlify personal access token
- Netlify team ID and team slug
- Landing and React demo Netlify sites connected to the GitHub repo
- Existing Pulumi backend access
- DNS control for `fortressauth.com` and `react-demo.fortressauth.com`

## Files

- `Pulumi.yaml` - Pulumi project definition
- `Pulumi.prod.example.yaml` - stack config template
- `src/index.ts` - Netlify build settings, domains, and environment variables
- `sdks/netlify/` - local Pulumi SDK generated from the official Netlify Terraform provider

## Netlify Site Bootstrap

Create Git-connected Netlify sites from the GitHub repo. For each site, leave the base directory as the repository root and set the package directory to the app directory:

| Site | Package directory | Build command | Publish directory |
| --- | --- | --- | --- |
| Landing | `landing` | `pnpm exec turbo run build --filter=landing` | `landing/.next` |
| React demo | `examples/web-react` | `pnpm exec turbo run build --filter=fortressauth-web-react...` | `examples/web-react/dist` |

The React demo builds with `DEMO_BASE_PATH=/` because it is served at the root of `https://react-demo.fortressauth.com`. The landing app serves `/demo` itself and embeds that stable demo subdomain in an iframe. Since both hosts are under `fortressauth.com`, the API can keep `COOKIE_SAMESITE=lax` and `CSRF_COOKIE_SAMESITE=lax`; `CORS_ORIGINS` must include both `https://fortressauth.com` and `https://react-demo.fortressauth.com`.

## Bootstrap Pulumi

```bash
cd /Users/idmcalculus/Downloads/fortressauth/packages/infra-netlify
pnpm install
pulumi login
pulumi stack init prod
```

Set config:

```bash
pulumi config set fortressauth-netlify:teamId <netlify-team-id>
pulumi config set fortressauth-netlify:teamSlug <netlify-team-slug>
pulumi config set fortressauth-netlify:productionBranch main
pulumi config set fortressauth-netlify:authApiUrl https://api.fortressauth.com/
pulumi config set fortressauth-netlify:landingDomain fortressauth.com
pulumi config set fortressauth-netlify:wwwLandingDomain www.fortressauth.com
pulumi config set fortressauth-netlify:reactDemoDomain react-demo.fortressauth.com
```

Set either site IDs:

```bash
pulumi config set fortressauth-netlify:landingSiteId <landing-site-id>
pulumi config set fortressauth-netlify:reactSiteId <react-demo-site-id>
```

Or use site names with `teamSlug`:

```bash
pulumi config set fortressauth-netlify:landingSiteName fortressauth-landing
pulumi config set fortressauth-netlify:reactSiteName fortressauth-react-demo
```

Preview + apply:

```bash
NETLIFY_API_TOKEN=<token> pulumi preview
NETLIFY_API_TOKEN=<token> pulumi up
```

## Environment Variables Managed By Pulumi

Landing:

- `AUTH_API_URL=https://api.fortressauth.com/`
- `NEXT_PUBLIC_LIVE_DEMO_URL=https://react-demo.fortressauth.com`

React demo:

- `VITE_API_URL=https://api.fortressauth.com/`
- `DEMO_BASE_PATH=/`

`AUTH_API_URL` must be configured as a Netlify site environment variable, not only in `netlify.toml`, because the landing app uses it from the Next.js route handler at runtime.

The Pulumi stack intentionally does not set Netlify's per-variable `scopes`
field. Netlify rejects custom environment-variable scopes on free plans with a
403 "Upgrade your Netlify account to set specific scopes" response. Omitting the
field lets Netlify apply the account-supported default scopes while still
keeping these values managed by Pulumi.

## Operational Notes

- Landing deploy previews stay enabled, but they are UI/docs previews only.
- React demo deploy previews and branch deploys are disabled in Pulumi. Its `netlify.toml` also skips those contexts defensively.
- Vue, Svelte, and Angular Netlify sites can remain on default domains for ad hoc checks, but do not add them to production auth origins unless they become supported public demos.
- `.netlify/` linkage files are intentionally not committed.
- DNS records are managed outside this package. After domains are assigned, point apex, `www`, and `react-demo` records at Netlify using the values Netlify provides.

## GitHub Actions

The workflow `.github/workflows/deploy-netlify-infra.yml` handles:

- `pulumi preview` on pull requests that touch `packages/infra-netlify`
- `pulumi up` on merges to `main`
- bootstrap-safe skips when the repository does not have Netlify/Pulumi deployment configuration yet

Required repository secrets:

- `PULUMI_ACCESS_TOKEN`
- `NETLIFY_API_TOKEN`

Required repository variable:

- `NETLIFY_PULUMI_STACK` (example: `idmcalculus/fortressauth-netlify/prod`)

Optional repository variables:

- `NETLIFY_TEAM_ID`
- `NETLIFY_TEAM_SLUG`

During the initial bootstrap, pull request previews and push-to-main applies skip cleanly if the required repository variable or secrets are missing. If `NETLIFY_PULUMI_STACK` is configured, the referenced Pulumi stack must exist before the workflow can run successfully.
