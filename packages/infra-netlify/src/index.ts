import * as netlify from '@pulumi/netlify';
import * as pulumi from '@pulumi/pulumi';

type EnvScope = 'builds' | 'functions' | 'runtime' | 'post_processing';
type EnvValueSpec = {
  scopes: EnvScope[];
  value: pulumi.Input<string>;
};

interface FrontendSiteSpec {
  buildCommand: string;
  deployPreviews: boolean;
  domain: string;
  domainAliases?: string[];
  env: Record<string, EnvValueSpec>;
  key: string;
  packageDirectory: string;
  publishDirectory: string;
  siteId: pulumi.Input<string>;
}

const BUILD_SCOPES: EnvScope[] = ['builds'];
const NEXT_RUNTIME_SCOPES: EnvScope[] = ['builds', 'functions', 'runtime'];

function requireNonEmpty(value: string | undefined, name: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`Missing required config value: ${name}`);
  }

  return trimmed;
}

function normalizeDomain(value: string | undefined, name: string): string {
  const trimmed = requireNonEmpty(value, name)
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');

  if (!/^[A-Za-z0-9.-]+$/.test(trimmed)) {
    throw new Error(`Invalid ${name} "${value}". Expected a bare domain name.`);
  }

  return trimmed.toLowerCase();
}

function normalizeHttpUrl(value: string | undefined, name: string): string {
  const trimmed = requireNonEmpty(value, name);

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Invalid ${name} "${value}". Use an absolute http(s) URL.`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Invalid ${name} "${value}". Use an absolute http(s) URL.`);
  }

  return parsed.toString();
}

function getExistingSiteId(config: pulumi.Config, key: string, fallbackName: string) {
  const explicitSiteId = config.get(`${key}SiteId`)?.trim();
  if (explicitSiteId) {
    return pulumi.output(explicitSiteId);
  }

  const teamSlug = requireNonEmpty(
    config.get('teamSlug') ?? process.env.NETLIFY_TEAM_SLUG,
    'teamSlug',
  );
  const siteName = requireNonEmpty(config.get(`${key}SiteName`) ?? fallbackName, `${key}SiteName`);

  return netlify
    .getSiteOutput({
      name: siteName,
      teamSlug,
    })
    .id.apply((id) => requireNonEmpty(id, `${key}SiteId`));
}

function createEnvironmentVariables(
  siteKey: string,
  teamId: string,
  siteId: pulumi.Input<string>,
  env: Record<string, EnvValueSpec>,
) {
  return Object.entries(env)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([key, spec]) =>
        new netlify.EnvironmentVariable(`${siteKey}-${key}`, {
          key,
          scopes: spec.scopes,
          siteId,
          teamId,
          values: [
            {
              context: 'all',
              value: spec.value,
            },
          ],
        }),
    );
}

function createFrontendSite(spec: FrontendSiteSpec, teamId: string, productionBranch: string) {
  const buildSettings = new netlify.SiteBuildSettings(`${spec.key}-build-settings`, {
    branchDeployAllBranches: false,
    branchDeployBranches: [],
    buildCommand: spec.buildCommand,
    deployPreviews: spec.deployPreviews,
    packageDirectory: spec.packageDirectory,
    prettyUrls: true,
    productionBranch,
    publishDirectory: spec.publishDirectory,
    siteId: spec.siteId,
    stopBuilds: false,
  });

  const domainSettings = new netlify.SiteDomainSettings(`${spec.key}-domain-settings`, {
    customDomain: spec.domain,
    domainAliases: spec.domainAliases ?? [],
    siteId: spec.siteId,
  });

  const environmentVariables = createEnvironmentVariables(spec.key, teamId, spec.siteId, spec.env);

  return {
    buildSettings,
    domainSettings,
    environmentVariables,
  };
}

const config = new pulumi.Config();
const teamId = requireNonEmpty(config.get('teamId') ?? process.env.NETLIFY_TEAM_ID, 'teamId');
const productionBranch = requireNonEmpty(
  config.get('productionBranch') ?? 'main',
  'productionBranch',
);
const authApiUrl = normalizeHttpUrl(
  config.get('authApiUrl') ?? 'https://api.fortressauth.com/',
  'authApiUrl',
);

const landingDomain = normalizeDomain(
  config.get('landingDomain') ?? 'fortressauth.com',
  'landingDomain',
);
const wwwLandingDomain = normalizeDomain(
  config.get('wwwLandingDomain') ?? 'www.fortressauth.com',
  'wwwLandingDomain',
);
const reactDemoDomain = normalizeDomain(
  config.get('reactDemoDomain') ?? 'react-demo.fortressauth.com',
  'reactDemoDomain',
);
const vueDemoDomain = normalizeDomain(
  config.get('vueDemoDomain') ?? 'vue-demo.fortressauth.com',
  'vueDemoDomain',
);
const svelteDemoDomain = normalizeDomain(
  config.get('svelteDemoDomain') ?? 'svelte-demo.fortressauth.com',
  'svelteDemoDomain',
);
const angularDemoDomain = normalizeDomain(
  config.get('angularDemoDomain') ?? 'angular-demo.fortressauth.com',
  'angularDemoDomain',
);

const sites: FrontendSiteSpec[] = [
  {
    buildCommand: 'pnpm exec turbo run build --filter=landing',
    deployPreviews: true,
    domain: landingDomain,
    domainAliases: wwwLandingDomain === landingDomain ? [] : [wwwLandingDomain],
    env: {
      AUTH_API_URL: {
        scopes: NEXT_RUNTIME_SCOPES,
        value: authApiUrl,
      },
      NEXT_PUBLIC_ANGULAR_DEMO_URL: {
        scopes: NEXT_RUNTIME_SCOPES,
        value: `https://${angularDemoDomain}`,
      },
      NEXT_PUBLIC_REACT_DEMO_URL: {
        scopes: NEXT_RUNTIME_SCOPES,
        value: `https://${reactDemoDomain}`,
      },
      NEXT_PUBLIC_SVELTE_DEMO_URL: {
        scopes: NEXT_RUNTIME_SCOPES,
        value: `https://${svelteDemoDomain}`,
      },
      NEXT_PUBLIC_VUE_DEMO_URL: {
        scopes: NEXT_RUNTIME_SCOPES,
        value: `https://${vueDemoDomain}`,
      },
    },
    key: 'landing',
    packageDirectory: 'landing',
    publishDirectory: 'landing/.next',
    siteId: getExistingSiteId(config, 'landing', 'fortressauth-landing'),
  },
  {
    buildCommand: 'pnpm exec turbo run build --filter=fortressauth-web-react',
    deployPreviews: false,
    domain: reactDemoDomain,
    env: {
      DEMO_BASE_PATH: {
        scopes: BUILD_SCOPES,
        value: '/',
      },
      VITE_API_URL: {
        scopes: BUILD_SCOPES,
        value: authApiUrl,
      },
    },
    key: 'react',
    packageDirectory: 'examples/web-react',
    publishDirectory: 'examples/web-react/dist',
    siteId: getExistingSiteId(config, 'react', 'fortressauth-react-demo'),
  },
  {
    buildCommand: 'pnpm exec turbo run build --filter=fortressauth-web-vue',
    deployPreviews: false,
    domain: vueDemoDomain,
    env: {
      DEMO_BASE_PATH: {
        scopes: BUILD_SCOPES,
        value: '/',
      },
      VITE_API_URL: {
        scopes: BUILD_SCOPES,
        value: authApiUrl,
      },
    },
    key: 'vue',
    packageDirectory: 'examples/web-vue',
    publishDirectory: 'examples/web-vue/dist',
    siteId: getExistingSiteId(config, 'vue', 'fortressauth-vue-demo'),
  },
  {
    buildCommand: 'pnpm exec turbo run build --filter=fortressauth-web-svelte',
    deployPreviews: false,
    domain: svelteDemoDomain,
    env: {
      DEMO_BASE_PATH: {
        scopes: BUILD_SCOPES,
        value: '/',
      },
      VITE_API_URL: {
        scopes: BUILD_SCOPES,
        value: authApiUrl,
      },
    },
    key: 'svelte',
    packageDirectory: 'examples/web-svelte',
    publishDirectory: 'examples/web-svelte/build',
    siteId: getExistingSiteId(config, 'svelte', 'fortressauth-svelte-demo'),
  },
  {
    buildCommand: 'pnpm exec turbo run build --filter=fortressauth-web-angular',
    deployPreviews: false,
    domain: angularDemoDomain,
    env: {
      ANGULAR_API_URL: {
        scopes: BUILD_SCOPES,
        value: authApiUrl,
      },
      DEMO_BASE_PATH: {
        scopes: BUILD_SCOPES,
        value: '/',
      },
    },
    key: 'angular',
    packageDirectory: 'examples/web-angular',
    publishDirectory: 'examples/web-angular/dist/web-angular/browser',
    siteId: getExistingSiteId(config, 'angular', 'fortressauth-angular-demo'),
  },
];

const managedSites = Object.fromEntries(
  sites.map((site) => [site.key, createFrontendSite(site, teamId, productionBranch)]),
);

export const netlifyTeamId = teamId;
export const repositorySetup = 'Git-connected Netlify sites are bootstrapped outside Pulumi.';
export const landingSiteId = pulumi.output(sites[0]?.siteId);
export const landingHostname = landingDomain;
export const wwwLandingHostname = wwwLandingDomain;
export const reactDemoHostname = reactDemoDomain;
export const vueDemoHostname = vueDemoDomain;
export const svelteDemoHostname = svelteDemoDomain;
export const angularDemoHostname = angularDemoDomain;
export const managedSiteKeys = Object.keys(managedSites);
