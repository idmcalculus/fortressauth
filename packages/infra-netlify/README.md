# FortressAuth Netlify Pulumi

Pulumi stack for the repeatable Netlify settings around FortressAuth frontend hosting:

- `landing` site on `fortressauth.com`
- `www.fortressauth.com` assigned as an alias and redirected to the apex by `landing/netlify.toml`
- `react-demo.fortressauth.com`
- `vue-demo.fortressauth.com`
- `svelte-demo.fortressauth.com`
- `angular-demo.fortressauth.com`

## Role Split

- **Netlify Git integration** creates and deploys the five sites from GitHub.
- **Pulumi** manages build settings, deploy preview flags, custom domains, and site environment variables for those existing sites.
- **GitHub Actions** validates the IaC package and runs `pulumi preview`/`pulumi up` for Netlify settings changes.

The current Pulumi Netlify provider manages existing site settings but does not create Git-connected Netlify sites. Bootstrap the sites in Netlify first, then point this stack at their site IDs or names.

## What You Need

- Netlify personal access token
- Netlify team ID and team slug
- Five Netlify sites connected to the GitHub repo
- Existing Pulumi backend access
- DNS control for `fortressauth.com` and the demo subdomains

## Files

- `Pulumi.yaml` - Pulumi project definition
- `Pulumi.prod.example.yaml` - stack config template
- `src/index.ts` - Netlify build settings, domains, and environment variables
- `sdks/netlify/` - local Pulumi SDK generated from the official Netlify Terraform provider

## Netlify Site Bootstrap

Create five Git-connected Netlify sites from the GitHub repo. For each site, leave the base directory as the repository root and set the package directory to the app directory:

| Site | Package directory | Build command | Publish directory |
| --- | --- | --- | --- |
| Landing | `landing` | `pnpm exec turbo run build --filter=landing` | `landing/.next` |
| React demo | `examples/web-react` | `pnpm exec turbo run build --filter=fortressauth-web-react` | `examples/web-react/dist` |
| Vue demo | `examples/web-vue` | `pnpm exec turbo run build --filter=fortressauth-web-vue` | `examples/web-vue/dist` |
| Svelte demo | `examples/web-svelte` | `pnpm exec turbo run build --filter=fortressauth-web-svelte` | `examples/web-svelte/build` |
| Angular demo | `examples/web-angular` | `pnpm exec turbo run build --filter=fortressauth-web-angular` | `examples/web-angular/dist/web-angular/browser` |

Each package directory has a `netlify.toml` with the same build settings. The demo configs include a defensive ignore command that skips deploy preview and branch deploy contexts if those get enabled before Pulumi applies.

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
pulumi config set fortressauth-netlify:vueDemoDomain vue-demo.fortressauth.com
pulumi config set fortressauth-netlify:svelteDemoDomain svelte-demo.fortressauth.com
pulumi config set fortressauth-netlify:angularDemoDomain angular-demo.fortressauth.com
```

Set either site IDs:

```bash
pulumi config set fortressauth-netlify:landingSiteId <landing-site-id>
pulumi config set fortressauth-netlify:reactSiteId <react-demo-site-id>
pulumi config set fortressauth-netlify:vueSiteId <vue-demo-site-id>
pulumi config set fortressauth-netlify:svelteSiteId <svelte-demo-site-id>
pulumi config set fortressauth-netlify:angularSiteId <angular-demo-site-id>
```

Or use site names with `teamSlug`:

```bash
pulumi config set fortressauth-netlify:landingSiteName fortressauth-landing
pulumi config set fortressauth-netlify:reactSiteName fortressauth-react-demo
pulumi config set fortressauth-netlify:vueSiteName fortressauth-vue-demo
pulumi config set fortressauth-netlify:svelteSiteName fortressauth-svelte-demo
pulumi config set fortressauth-netlify:angularSiteName fortressauth-angular-demo
```

Preview + apply:

```bash
NETLIFY_API_TOKEN=<token> pulumi preview
NETLIFY_API_TOKEN=<token> pulumi up
```

## Environment Variables Managed By Pulumi

Landing:

- `AUTH_API_URL=https://api.fortressauth.com/`
- `NEXT_PUBLIC_REACT_DEMO_URL=https://react-demo.fortressauth.com`
- `NEXT_PUBLIC_VUE_DEMO_URL=https://vue-demo.fortressauth.com`
- `NEXT_PUBLIC_SVELTE_DEMO_URL=https://svelte-demo.fortressauth.com`
- `NEXT_PUBLIC_ANGULAR_DEMO_URL=https://angular-demo.fortressauth.com`

Demo apps:

- React/Vue/Svelte: `VITE_API_URL=https://api.fortressauth.com/`, `DEMO_BASE_PATH=/`
- Angular: `ANGULAR_API_URL=https://api.fortressauth.com/`, `DEMO_BASE_PATH=/`

`AUTH_API_URL` must be configured as a Netlify site environment variable, not only in `netlify.toml`, because the landing app uses it from the Next.js route handler at runtime.

## Operational Notes

- Landing deploy previews stay enabled, but they are UI/docs previews only.
- Demo deploy previews and branch deploys are disabled in Pulumi. The demo `netlify.toml` files also skip those contexts defensively.
- The Svelte demo uses `@sveltejs/adapter-static` because it is a prerendered static demo.
- `.netlify/` linkage files are intentionally not committed.
- DNS records are managed outside this package. After domains are assigned, point apex and subdomain records at Netlify using the values Netlify provides.

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

During the initial bootstrap, pull request previews and push-to-main applies skip cleanly if the required repository variable or secrets are missing. After those values are configured, run the workflow manually from GitHub Actions to create or update the Netlify sites. Manual workflow runs fail when deployment configuration is incomplete, so they can be used as the explicit production deploy check after bootstrap.
