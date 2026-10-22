import * as pulumi from '@pulumi/pulumi';

type EnvRecord = Record<string, string>;

/** Google's sample image. It only serves until the first real deploy. */
export const PLACEHOLDER_IMAGE = 'us-docker.pkg.dev/cloudrun/container/hello';

/**
 * Secret Manager's free tier covers 6 active secret versions. Each secret
 * env key here gets exactly one version, so this cap keeps secrets free.
 */
export const MAX_SECRET_ENV_KEYS = 6;

/**
 * Set by this stack for every revision: HTTPS only, production mode, no
 * Prometheus endpoint. Config validation rejects these keys in appEnv.
 */
export const FIXED_ENV: Readonly<EnvRecord> = Object.freeze({
  NODE_ENV: 'production',
  HOST: '0.0.0.0',
  COOKIE_SECURE: 'true',
  CSRF_COOKIE_SECURE: 'true',
  // Nothing scrapes Prometheus here; keep /metrics closed.
  METRICS_ENABLED: 'false',
});

/** Set from the `trustedProxyHopCount` stack setting, not from appEnv. */
export const PROXY_HOP_ENV_KEY = 'TRUSTED_PROXY_HOP_COUNT';

// Cloud Run sets PORT itself and rejects it as a user env var.
const RESERVED_ENV_KEYS = new Set(['PORT', 'K_SERVICE', 'K_REVISION', 'K_CONFIGURATION']);

function assertEnvKey(key: string, name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    throw new Error(`Invalid env key "${key}" in ${name}.`);
  }
  if (RESERVED_ENV_KEYS.has(key)) {
    throw new Error(`Invalid env key "${key}" in ${name}: Cloud Run reserves it.`);
  }
  if (key in FIXED_ENV) {
    throw new Error(`Invalid env key "${key}" in ${name}: this stack sets it.`);
  }
  if (key === PROXY_HOP_ENV_KEY) {
    throw new Error(`Invalid env key "${key}" in ${name}: set trustedProxyHopCount instead.`);
  }
  return key;
}

function assertEnvRecord(value: unknown, name: string): EnvRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Invalid ${name}. Expected an object map of KEY: value pairs.`);
  }
  const parsed: EnvRecord = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const envKey = assertEnvKey(key, name);
    if (typeof raw !== 'string') {
      throw new Error(`Invalid ${name}.${envKey}. Expected a string value.`);
    }
    parsed[envKey] = raw;
  }
  return parsed;
}

function assertHostname(value: string, name: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(trimmed)) {
    throw new Error(`Invalid ${name} config value: "${value}" is not a hostname.`);
  }
  return trimmed;
}

function assertPattern(value: string, pattern: RegExp, name: string, expected: string): string {
  const trimmed = value.trim();
  if (!pattern.test(trimmed)) {
    throw new Error(`Invalid ${name} config value: expected ${expected}.`);
  }
  return trimmed;
}

function assertIntegerInRange(value: number, min: number, max: number, name: string): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`Invalid ${name} config value: expected a whole number from ${min} to ${max}.`);
  }
  return value;
}

/**
 * Checks the decrypted `secretEnv` map: every key in `secretEnvKeys` needs a
 * value. Runs inside an apply, because Pulumi only decrypts secrets there.
 */
export function checkSecretEnv(raw: unknown, secretEnvKeys: readonly string[]): EnvRecord {
  const values = assertEnvRecord(raw ?? {}, 'secretEnv');
  const missing = secretEnvKeys.filter((key) => !values[key]);
  if (missing.length > 0) {
    throw new pulumi.RunError(
      `Set a value for each secretEnvKeys entry. Missing: ${missing.join(', ')}. ` +
        `Use: pulumi config set --secret --path 'secretEnv.${missing[0]}' '<value>'`,
    );
  }
  return values;
}

export interface BudgetConfig {
  readonly billingAccountId: string;
  /** Whole units of `currency` per month. */
  readonly amount: number;
  /** Must match the billing account's currency. */
  readonly currency: string;
}

export interface ResolvedConfig {
  readonly stack: string;
  readonly namePrefix: string;
  readonly project: string;
  readonly region: string;

  // Service
  readonly serviceName: string;
  readonly initialImage: string;
  readonly containerPort: number;
  readonly cpu: string;
  readonly memory: string;
  readonly maxInstances: number;
  readonly trustedProxyHopCount: number;
  readonly appDomains: readonly string[];
  readonly appEnv: Readonly<EnvRecord>;
  readonly secretEnvKeys: readonly string[];
  readonly secretEnv: pulumi.Output<EnvRecord>;
  readonly deletionProtection: boolean;

  // Images
  readonly repositoryId: string;
  readonly keepImageCount: number;

  // GitHub Actions deploy access
  readonly githubRepository: string;
  readonly githubEnvironment: string;

  // Optional spend alert
  readonly budget: BudgetConfig | undefined;
}

export function loadConfig(): ResolvedConfig {
  const config = new pulumi.Config();
  const gcpConfig = new pulumi.Config('gcp');
  const stack = pulumi.getStack();
  const namePrefix = config.get('namePrefix') ?? `fortressauth-${stack}`;

  const project = assertPattern(
    gcpConfig.require('project'),
    /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/,
    'gcp:project',
    'a Google Cloud project ID',
  );
  const region = assertPattern(
    gcpConfig.get('region') ?? 'europe-west1',
    /^[a-z]+-[a-z]+[0-9]+$/,
    'gcp:region',
    'a region such as europe-west1',
  );

  const serviceName = assertPattern(
    config.get('serviceName') ?? 'fortressauth-api',
    /^[a-z]([a-z0-9-]{0,47}[a-z0-9])?$/,
    'serviceName',
    'a lowercase Cloud Run service name',
  );
  const initialImage = (config.get('initialImage') ?? PLACEHOLDER_IMAGE).trim();
  const containerPort = assertIntegerInRange(
    config.getNumber('containerPort') ?? 3000,
    1,
    65535,
    'containerPort',
  );
  const cpu = assertPattern(config.get('cpu') ?? '1', /^(1|2|4|8)$/, 'cpu', '1, 2, 4 or 8');
  const memory = assertPattern(
    config.get('memory') ?? '512Mi',
    /^[0-9]+(Mi|Gi)$/,
    'memory',
    'a size such as 512Mi or 1Gi',
  );
  // One instance keeps the in-memory rate limiter consistent and caps cost.
  const maxInstances = assertIntegerInRange(
    config.getNumber('maxInstances') ?? 1,
    1,
    10,
    'maxInstances',
  );
  // How many X-Forwarded-For entries Google's front end adds. The server
  // takes the client address from that position, so a wrong value puts every
  // user in one rate-limit bucket. The runbook says how to check it.
  const trustedProxyHopCount = assertIntegerInRange(
    config.getNumber('trustedProxyHopCount') ?? 1,
    1,
    8,
    'trustedProxyHopCount',
  );
  const appDomains = (config.getObject<string[]>('appDomains') ?? []).map((domain) =>
    assertHostname(domain, 'appDomains'),
  );
  const appEnv = assertEnvRecord(config.getObject<unknown>('appEnv') ?? {}, 'appEnv');

  const secretEnvKeys = (config.getObject<string[]>('secretEnvKeys') ?? []).map((key) =>
    assertEnvKey(key, 'secretEnvKeys'),
  );
  if (new Set(secretEnvKeys).size !== secretEnvKeys.length) {
    throw new Error('Invalid secretEnvKeys config value: keys must be unique.');
  }
  if (secretEnvKeys.length > MAX_SECRET_ENV_KEYS) {
    throw new Error(
      `secretEnvKeys lists ${secretEnvKeys.length} keys; keep it to ${MAX_SECRET_ENV_KEYS} ` +
        'or fewer, the number of secret versions Secret Manager stores for free.',
    );
  }
  for (const key of secretEnvKeys) {
    if (key in appEnv) {
      throw new Error(`${key} is in both appEnv and secretEnvKeys; keep it in one place.`);
    }
  }
  const secretEnv = (config.getSecretObject<unknown>('secretEnv') ?? pulumi.secret({})).apply(
    (raw) => checkSecretEnv(raw, secretEnvKeys),
  );
  const deletionProtection = config.getBoolean('deletionProtection') ?? true;

  const repositoryId = assertPattern(
    config.get('repositoryId') ?? 'fortressauth',
    /^[a-z]([a-z0-9-]{0,61}[a-z0-9])?$/,
    'repositoryId',
    'a lowercase Artifact Registry repository ID',
  );
  // The Artifact Registry free tier is 0.5 GB; two images fit with room.
  const keepImageCount = assertIntegerInRange(
    config.getNumber('keepImageCount') ?? 2,
    1,
    20,
    'keepImageCount',
  );

  const githubRepository = assertPattern(
    config.get('githubRepository') ?? 'idmcalculus/fortressauth',
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/,
    'githubRepository',
    'owner/name',
  );
  const githubEnvironment = assertPattern(
    config.get('githubEnvironment') ?? 'cloudrun-prod',
    /^[A-Za-z0-9_.-]+$/,
    'githubEnvironment',
    'a GitHub environment name',
  );

  const billingAccountId = config.get('billingAccountId');
  const budget =
    billingAccountId === undefined
      ? undefined
      : {
          billingAccountId: assertPattern(
            billingAccountId,
            /^[A-F0-9]{6}-[A-F0-9]{6}-[A-F0-9]{6}$/,
            'billingAccountId',
            'an ID such as 012345-6789AB-CDEF01',
          ),
          amount: assertIntegerInRange(
            config.getNumber('budgetAmount') ?? 1,
            1,
            1000,
            'budgetAmount',
          ),
          currency: assertPattern(
            config.get('budgetCurrency') ?? 'USD',
            /^[A-Z]{3}$/,
            'budgetCurrency',
            'a currency code such as USD',
          ),
        };

  return {
    stack,
    namePrefix,
    project,
    region,
    serviceName,
    initialImage,
    containerPort,
    cpu,
    memory,
    maxInstances,
    trustedProxyHopCount,
    appDomains,
    appEnv,
    secretEnvKeys,
    secretEnv,
    deletionProtection,
    repositoryId,
    keepImageCount,
    githubRepository,
    githubEnvironment,
    budget,
  };
}

/** GCP label keys and values must be lowercase. */
export const COMMON_LABELS = (stack: string): Record<string, string> => ({
  managed_by: 'pulumi',
  project: 'fortressauth',
  stack: stack.toLowerCase(),
});
