import * as netlify from '@pulumi/netlify';
import * as pulumi from '@pulumi/pulumi';

type EnvValueSpec = {
  value: pulumi.Input<string>;
};

interface FrontendSiteSpec {
  buildCommand: string;
  deployPreviews: boolean;
  domain?: string;
  domainAliases?: string[];
  env: Record<string, EnvValueSpec>;
  key: string;
  packageDirectory: string;
  publishDirectory: string;
  siteId: pulumi.Input<string>;
}

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

  const domainSettings = spec.domain
    ? new netlify.SiteDomainSettings(`${spec.key}-domain-settings`, {
        customDomain: spec.domain,
        domainAliases: spec.domainAliases ?? [],
        siteId: spec.siteId,
      })
    : undefined;

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

const sites: FrontendSiteSpec[] = [
  {
    buildCommand: 'pnpm exec turbo run build --filter=landing',
    deployPreviews: true,
    domain: landingDomain,
    domainAliases: wwwLandingDomain === landingDomain ? [] : [wwwLandingDomain],
    env: {
      AUTH_API_URL: {
        value: authApiUrl,
      },
      NEXT_PUBLIC_LIVE_DEMO_URL: {
        value: `https://${reactDemoDomain}`,
      },
    },
    key: 'landing',
    packageDirectory: 'landing',
    publishDirectory: 'landing/.next',
    siteId: getExistingSiteId(config, 'landing', 'fortressauth-landing'),
  },
  {
    buildCommand: 'pnpm exec turbo run build --filter=fortressauth-web-react...',
    deployPreviews: false,
    domain: reactDemoDomain,
    env: {
      DEMO_BASE_PATH: {
        value: '/',
      },
      VITE_API_URL: {
        value: authApiUrl,
      },
    },
    key: 'react',
    packageDirectory: 'examples/web-react',
    publishDirectory: 'examples/web-react/dist',
    siteId: getExistingSiteId(config, 'react', 'fortressauth-react-demo'),
  },
];

const managedSites = Object.fromEntries(
  sites.map((site) => [site.key, createFrontendSite(site, teamId, productionBranch)]),
);

export const netlifyTeamId = teamId;
export const repositorySetup = 'Git-connected Netlify sites are bootstrapped outside Pulumi.';
export const landingSiteId = pulumi.output(sites[0]?.siteId);
export const reactDemoSiteId = pulumi.output(sites[1]?.siteId);
export const landingHostname = landingDomain;
export const wwwLandingHostname = wwwLandingDomain;
export const reactDemoHostname = reactDemoDomain;
export const liveDemoPath = '/demo';
export const managedSiteKeys = Object.keys(managedSites);
