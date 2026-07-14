import * as pulumi from '@pulumi/pulumi';

type EnvRecord = Record<string, string>;

function assertHostname(value: string, name: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes(' ')) {
    throw new Error(`Invalid ${name} config value.`);
  }
  return trimmed;
}

function normalizeBaseUrl(value: URL): string {
  return value.toString().replace(/\/$/, '');
}

function assertBaseUrl(value: string, name: string): string {
  const trimmed = value.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Invalid ${name} config value.`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Invalid ${name} config value.`);
  }
  return normalizeBaseUrl(parsed);
}

function assertSameSite(value: string, name: string): 'strict' | 'lax' | 'none' {
  if (value !== 'strict' && value !== 'lax' && value !== 'none') {
    throw new Error(`Invalid ${name}. Expected one of: strict, lax, none.`);
  }
  return value;
}

function assertIdentifier(value: string, name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) {
    throw new Error(
      `Invalid ${name}. Use lowercase letters, numbers, and underscores; first character must be a letter or underscore.`,
    );
  }
  return value;
}

function assertEnvKey(key: string, name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    throw new Error(`Invalid env key "${key}" in ${name}.`);
  }
  return key;
}

function assertEnvValue(value: string, name: string, key: string): string {
  if (value.includes('\n') || value.includes('\r')) {
    throw new Error(`Invalid ${name}.${key}. Multiline values are not supported.`);
  }
  return value;
}

function assertEnvRecord(value: unknown, name: string): EnvRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Invalid ${name}. Expected an object map of KEY=VALUE pairs.`);
  }
  const record = value as Record<string, unknown>;
  const parsed: EnvRecord = {};
  for (const [key, raw] of Object.entries(record)) {
    const envKey = assertEnvKey(key, name);
    if (typeof raw !== 'string') {
      throw new Error(`Invalid ${name}.${envKey}. Expected a string value.`);
    }
    parsed[envKey] = assertEnvValue(raw, name, envKey);
  }
  return parsed;
}

const EXPLICIT_SECRET_ENV_KEYS = new Set([
  'DATABASE_URL',
  'DB_PASSWORD',
  'RESOURCE_SERVER_CREDENTIALS_JSON',
  'SMTP_PASS',
]);

export function isSecretOnlyEnvKey(key: string): boolean {
  return (
    EXPLICIT_SECRET_ENV_KEYS.has(key) ||
    /(?:_SECRET|_PRIVATE_KEY|_API_KEY|_PASSWORD|_ACCESS_KEY_ID|_SECRET_ACCESS_KEY|_SESSION_TOKEN)$/.test(
      key,
    )
  );
}

function assertSecretBoundary(appEnv: EnvRecord, secretEnvKeys: readonly string[]): void {
  const uniqueSecretKeys = new Set(secretEnvKeys);
  if (uniqueSecretKeys.size !== secretEnvKeys.length) {
    throw new Error('Invalid secretEnvKeys. Secret environment keys must be unique.');
  }

  for (const key of Object.keys(appEnv)) {
    if (uniqueSecretKeys.has(key)) {
      throw new Error(`Invalid appEnv.${key}. A key cannot be both public and secret.`);
    }
    if (isSecretOnlyEnvKey(key)) {
      throw new Error(`Invalid appEnv.${key}. Secret values must be declared in secretEnvKeys.`);
    }
  }
}

function assertGenericResourceSecretConfiguration(
  appEnv: EnvRecord,
  secretEnvKeys: readonly string[],
): void {
  if (!appEnv.RESOURCE_SERVERS_JSON) return;
  let resources: unknown;
  try {
    resources = JSON.parse(appEnv.RESOURCE_SERVERS_JSON);
  } catch {
    throw new Error('Invalid appEnv.RESOURCE_SERVERS_JSON. Expected valid JSON.');
  }
  if (!Array.isArray(resources)) {
    throw new Error('Invalid appEnv.RESOURCE_SERVERS_JSON. Expected an array.');
  }
  const hasEnabledResource = resources.some(
    (entry) =>
      typeof entry === 'object' &&
      entry !== null &&
      (!('enabled' in entry) || entry.enabled !== false),
  );
  if (hasEnabledResource && !new Set(secretEnvKeys).has('RESOURCE_SERVER_CREDENTIALS_JSON')) {
    throw new Error(
      'Enabled resource servers require RESOURCE_SERVER_CREDENTIALS_JSON in secretEnvKeys.',
    );
  }
}

function assertWraithCompatibilityConfiguration(
  appEnv: EnvRecord,
  secretEnvKeys: readonly string[],
  appDomain: string,
): void {
  const rawRegistry = appEnv.NATIVE_CLIENTS_JSON;
  if (!rawRegistry) return;

  let registry: unknown;
  try {
    registry = JSON.parse(rawRegistry);
  } catch {
    throw new Error('Invalid appEnv.NATIVE_CLIENTS_JSON. Expected valid JSON.');
  }
  if (!Array.isArray(registry)) {
    throw new Error('Invalid appEnv.NATIVE_CLIENTS_JSON. Expected an array.');
  }

  const wraith = registry.find(
    (
      entry,
    ): entry is {
      clientId: string;
      redirectUris: unknown;
      resourceAudiences?: unknown;
    } =>
      typeof entry === 'object' &&
      entry !== null &&
      'clientId' in entry &&
      entry.clientId === 'wraith',
  );
  if (!wraith) return;

  if (
    !Array.isArray(wraith.redirectUris) ||
    wraith.redirectUris.length !== 1 ||
    wraith.redirectUris[0] !== 'wraith://auth/callback'
  ) {
    throw new Error(
      'Invalid Wraith native redirect registry. Expected only wraith://auth/callback.',
    );
  }

  const secretKeys = new Set(secretEnvKeys);

  if (wraith.resourceAudiences !== undefined) {
    if (
      !Array.isArray(wraith.resourceAudiences) ||
      wraith.resourceAudiences.length !== 1 ||
      wraith.resourceAudiences[0] !== 'wraith-api'
    ) {
      throw new Error('Invalid Wraith resource audience fixture. Expected only wraith-api.');
    }

    let resources: unknown;
    try {
      resources = JSON.parse(appEnv.RESOURCE_SERVERS_JSON ?? '[]');
    } catch {
      throw new Error('Invalid appEnv.RESOURCE_SERVERS_JSON. Expected valid JSON.');
    }
    if (!Array.isArray(resources)) {
      throw new Error('Invalid appEnv.RESOURCE_SERVERS_JSON. Expected an array.');
    }
    const resource = resources.find(
      (entry): entry is { audience: string; enabled?: unknown; allowedClientIds?: unknown } =>
        typeof entry === 'object' &&
        entry !== null &&
        'audience' in entry &&
        entry.audience === 'wraith-api',
    );
    if (
      !resource ||
      resource.enabled === false ||
      !Array.isArray(resource.allowedClientIds) ||
      !resource.allowedClientIds.includes('wraith')
    ) {
      throw new Error(
        'Invalid Wraith resource-server fixture. Register enabled audience wraith-api for client wraith.',
      );
    }
    if (!secretKeys.has('RESOURCE_SERVER_CREDENTIALS_JSON')) {
      throw new Error(
        'Wraith resource introspection requires RESOURCE_SERVER_CREDENTIALS_JSON in secretEnvKeys.',
      );
    }
  }

  const googleReady =
    Boolean(appEnv.GOOGLE_CLIENT_ID) &&
    appEnv.GOOGLE_REDIRECT_URI === `https://${appDomain}/auth/oauth/google/callback` &&
    secretKeys.has('GOOGLE_CLIENT_SECRET');
  const appleReady =
    Boolean(appEnv.APPLE_CLIENT_ID) &&
    Boolean(appEnv.APPLE_TEAM_ID) &&
    Boolean(appEnv.APPLE_KEY_ID) &&
    appEnv.APPLE_REDIRECT_URI === `https://${appDomain}/auth/oauth/apple/callback` &&
    (secretKeys.has('APPLE_CLIENT_SECRET') || secretKeys.has('APPLE_PRIVATE_KEY'));

  if (!googleReady && !appleReady) {
    throw new Error(
      'Wraith native OAuth requires a complete Google or Apple provider configuration. Set the provider public client and callback values in appEnv and declare its secret in secretEnvKeys; see packages/infra-aws/README.md.',
    );
  }
}

function assertCidr(value: string, name: string): string {
  if (!/^([0-9]{1,3}\.){3}[0-9]{1,3}\/[0-9]{1,2}$/.test(value)) {
    throw new Error(`Invalid ${name} CIDR.`);
  }
  return value;
}

function assertEmail(value: string, name: string): string {
  const trimmed = value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    throw new Error(`Invalid ${name}. Expected a valid email address.`);
  }
  return trimmed;
}

export interface ResolvedConfig {
  readonly stack: string;
  readonly namePrefix: string;

  // Application
  readonly appDomain: string;
  readonly frontendBaseUrl: string;
  readonly cookieSameSite: 'strict' | 'lax' | 'none';
  readonly csrfCookieSameSite: 'strict' | 'lax' | 'none';

  // Container
  readonly appImage: string;
  readonly taskCpu: number;
  readonly taskMemoryMib: number;
  readonly desiredCount: number;
  readonly containerPort: number;
  readonly logRetentionDays: number;

  // Database
  readonly dbName: string;
  readonly dbUser: string;
  readonly dbInstanceClass: string;
  readonly dbAllocatedStorageGb: number;
  readonly dbBackupRetentionDays: number;
  readonly dbMultiAz: boolean;
  readonly dbDeletionProtection: boolean;
  readonly dbSkipFinalSnapshot: boolean;
  readonly dbPostgresVersion: string;

  // Email (SES)
  readonly sesIdentityDomain: string;
  readonly sesFromAddress: string;
  readonly sesFromName: string;
  readonly sesReplyToAddress: string;
  readonly sesConfigurationSetName: string;
  readonly bounceNotificationEmail: string;
  readonly sesManageIdentity: boolean;

  // Network
  readonly vpcCidr: string;
  readonly availabilityZones: number;

  // Bootstrap
  readonly bootstrap: boolean;

  // Account guard
  readonly expectedAccountId: string | undefined;

  // Env vars
  readonly appEnv: EnvRecord;
  readonly secretEnvKeys: readonly string[];
}

export function loadConfig(): ResolvedConfig {
  const config = new pulumi.Config();
  const stack = pulumi.getStack();
  const namePrefix = config.get('namePrefix') ?? `fortressauth-${stack}`;

  const appDomain = assertHostname(config.require('appDomain'), 'appDomain');
  const frontendBaseUrl = assertBaseUrl(
    config.get('frontendBaseUrl') ?? `https://${appDomain}`,
    'frontendBaseUrl',
  );
  const cookieSameSite = assertSameSite(config.get('cookieSameSite') ?? 'lax', 'cookieSameSite');
  const csrfCookieSameSite = assertSameSite(
    config.get('csrfCookieSameSite') ?? cookieSameSite,
    'csrfCookieSameSite',
  );

  const appImage = config.require('appImage').trim();
  if (!appImage) {
    throw new Error('Invalid appImage config value.');
  }
  const taskCpu = config.getNumber('taskCpu') ?? 256;
  const taskMemoryMib = config.getNumber('taskMemoryMib') ?? 512;
  const desiredCount = config.getNumber('desiredCount') ?? 1;
  const containerPort = config.getNumber('containerPort') ?? 3000;
  const logRetentionDays = config.getNumber('logRetentionDays') ?? 30;

  const dbName = assertIdentifier(config.get('dbName') ?? 'fortressauth', 'dbName');
  const dbUser = assertIdentifier(config.get('dbUser') ?? 'fortressauth', 'dbUser');
  const dbInstanceClass = config.get('dbInstanceClass') ?? 'db.t4g.micro';
  const dbAllocatedStorageGb = config.getNumber('dbAllocatedStorageGb') ?? 20;
  const dbBackupRetentionDays = config.getNumber('dbBackupRetentionDays') ?? 7;
  const dbMultiAz = config.getBoolean('dbMultiAz') ?? false;
  const defaultDeletionProtection = /^(prod|production)$/i.test(stack);
  const dbDeletionProtection =
    config.getBoolean('dbDeletionProtection') ?? defaultDeletionProtection;
  // skipFinalSnapshot is independent of deletionProtection: even when
  // deletion protection is intentionally turned off to allow a destroy,
  // production stacks must still take a final snapshot. Override only for
  // dev stacks where snapshot churn is unwanted.
  const defaultSkipFinalSnapshot = !/^(prod|production)$/i.test(stack);
  const dbSkipFinalSnapshot = config.getBoolean('dbSkipFinalSnapshot') ?? defaultSkipFinalSnapshot;
  const dbPostgresVersion = config.get('dbPostgresVersion') ?? '17.10';

  const sesIdentityDomain = assertHostname(
    config.get('sesIdentityDomain') ?? appDomain.split('.').slice(-2).join('.'),
    'sesIdentityDomain',
  );
  const sesFromAddress = assertEmail(
    config.get('sesFromAddress') ?? `noreply@${sesIdentityDomain}`,
    'sesFromAddress',
  );
  const sesFromName = config.get('sesFromName') ?? 'FortressAuth';
  const sesReplyToAddress = assertEmail(
    config.get('sesReplyToAddress') ?? sesFromAddress,
    'sesReplyToAddress',
  );
  const sesConfigurationSetName = config.get('sesConfigurationSetName') ?? `${namePrefix}-events`;
  const bounceNotificationEmail = assertEmail(
    config.require('bounceNotificationEmail'),
    'bounceNotificationEmail',
  );
  const sesManageIdentity = config.getBoolean('sesManageIdentity') ?? false;

  const vpcCidr = assertCidr(config.get('vpcCidr') ?? '10.30.0.0/16', 'vpcCidr');
  const availabilityZones = config.getNumber('availabilityZones') ?? 2;
  if (availabilityZones < 2 || availabilityZones > 3) {
    throw new Error('availabilityZones must be 2 or 3.');
  }

  // Bootstrap mode controls whether Pulumi waits for ACM validation and
  // creates the HTTPS listener. The first `pulumi up` runs with
  // bootstrap=true so the certificate validation CNAMEs can be copied into
  // external DNS. Operators flip this to false once those CNAMEs resolve.
  const bootstrap = config.getBoolean('bootstrap') ?? true;

  const expectedAccountId = config.get('expectedAccountId')?.trim();
  if (expectedAccountId !== undefined && !/^\d{12}$/.test(expectedAccountId)) {
    throw new Error('Invalid expectedAccountId. Expected a 12-digit AWS account ID.');
  }

  const appEnv = assertEnvRecord(config.getObject<unknown>('appEnv') ?? {}, 'appEnv');

  const secretEnvKeys = (config.getObject<string[]>('secretEnvKeys') ?? []).map((key) =>
    assertEnvKey(key, 'secretEnvKeys'),
  );
  assertSecretBoundary(appEnv, secretEnvKeys);
  assertGenericResourceSecretConfiguration(appEnv, secretEnvKeys);
  assertWraithCompatibilityConfiguration(appEnv, secretEnvKeys, appDomain);

  return {
    stack,
    namePrefix,
    appDomain,
    frontendBaseUrl,
    cookieSameSite,
    csrfCookieSameSite,
    appImage,
    taskCpu,
    taskMemoryMib,
    desiredCount,
    containerPort,
    logRetentionDays,
    dbName,
    dbUser,
    dbInstanceClass,
    dbAllocatedStorageGb,
    dbBackupRetentionDays,
    dbMultiAz,
    dbDeletionProtection,
    dbSkipFinalSnapshot,
    dbPostgresVersion,
    sesIdentityDomain,
    sesFromAddress,
    sesFromName,
    sesReplyToAddress,
    sesConfigurationSetName,
    bounceNotificationEmail,
    sesManageIdentity,
    vpcCidr,
    availabilityZones,
    bootstrap,
    expectedAccountId,
    appEnv,
    secretEnvKeys,
  };
}

export const COMMON_TAGS = (stack: string): Record<string, string> => ({
  ManagedBy: 'pulumi',
  Project: 'fortressauth',
  Stack: stack,
});
