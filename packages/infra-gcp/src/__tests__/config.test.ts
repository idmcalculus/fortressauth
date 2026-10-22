import * as pulumi from '@pulumi/pulumi';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { checkSecretEnv, FIXED_ENV, MAX_SECRET_ENV_KEYS, PLACEHOLDER_IMAGE } from '../config';

const PROJECT = 'fortressauth-gcp';

/**
 * Drives loadConfig() against the Pulumi runtime: primes project + stack via
 * setMocks, then writes the stack config through setAllConfig. Keys without
 * a namespace get the project's; cross-project keys (gcp:project) pass
 * through as written. Objects are JSON-encoded, as Pulumi stores them.
 */
async function loadWithConfig(
  values: Record<string, unknown>,
  stack = 'prod',
): Promise<typeof import('../config')> {
  await pulumi.runtime.setMocks(
    {
      newResource: (args) => ({ id: `${args.name}_id`, state: args.inputs }),
      call: (args) => args.inputs,
    },
    PROJECT,
    stack,
    /* preview */ false,
  );

  const namespaced: Record<string, string> = {};
  for (const [key, raw] of Object.entries(values)) {
    if (raw === undefined) continue;
    const fullKey = key.includes(':') ? key : `${PROJECT}:${key}`;
    namespaced[fullKey] =
      typeof raw === 'string' ? raw : typeof raw === 'object' ? JSON.stringify(raw) : String(raw);
  }
  pulumi.runtime.setAllConfig(namespaced);

  return await import('../config');
}

const REQUIRED_CONFIG: Record<string, unknown> = {
  'gcp:project': 'fortressauth-prod-123',
};

async function expectInvalid(extra: Record<string, unknown>, message: RegExp): Promise<void> {
  const { loadConfig } = await loadWithConfig({ ...REQUIRED_CONFIG, ...extra });
  expect(() => loadConfig()).toThrow(message);
}

describe('loadConfig', () => {
  beforeEach(() => {
    pulumi.runtime.setAllConfig({});
  });

  afterEach(() => {
    pulumi.runtime.setAllConfig({});
  });

  it('applies the documented defaults when only gcp:project is set', async () => {
    const { loadConfig } = await loadWithConfig(REQUIRED_CONFIG);
    const cfg = loadConfig();

    expect(cfg.namePrefix).toBe('fortressauth-prod');
    expect(cfg.project).toBe('fortressauth-prod-123');
    expect(cfg.region).toBe('europe-west1');
    expect(cfg.serviceName).toBe('fortressauth-api');
    expect(cfg.initialImage).toBe(PLACEHOLDER_IMAGE);
    expect(cfg.containerPort).toBe(3000);
    expect(cfg.cpu).toBe('1');
    expect(cfg.memory).toBe('512Mi');
    expect(cfg.maxInstances).toBe(1);
    expect(cfg.trustedProxyHopCount).toBe(1);
    expect(cfg.appDomains).toEqual([]);
    expect(cfg.appEnv).toEqual({});
    expect(cfg.secretEnvKeys).toEqual([]);
    expect(cfg.deletionProtection).toBe(true);
    expect(cfg.repositoryId).toBe('fortressauth');
    expect(cfg.keepImageCount).toBe(2);
    expect(cfg.githubRepository).toBe('idmcalculus/fortressauth');
    expect(cfg.githubEnvironment).toBe('cloudrun-prod');
    expect(cfg.budget).toBeUndefined();
  });

  it('reads overrides, lower-cases domains and parses the budget', async () => {
    const { loadConfig } = await loadWithConfig({
      ...REQUIRED_CONFIG,
      'gcp:region': 'us-central1',
      appDomains: ['GCP-API.fortressauth.com', 'api.fortressauth.com'],
      appEnv: { BASE_URL: 'https://fortressauth.com', EMAIL_PROVIDER: 'resend' },
      secretEnvKeys: ['DATABASE_URL', 'RESEND_API_KEY'],
      secretEnv: { DATABASE_URL: 'postgresql://x', RESEND_API_KEY: 're_x' },
      maxInstances: 2,
      memory: '1Gi',
      billingAccountId: '012345-6789AB-CDEF01',
      budgetAmount: 2,
      budgetCurrency: 'GBP',
    });
    const cfg = loadConfig();

    expect(cfg.region).toBe('us-central1');
    expect(cfg.appDomains).toEqual(['gcp-api.fortressauth.com', 'api.fortressauth.com']);
    expect(cfg.appEnv).toEqual({ BASE_URL: 'https://fortressauth.com', EMAIL_PROVIDER: 'resend' });
    expect(cfg.secretEnvKeys).toEqual(['DATABASE_URL', 'RESEND_API_KEY']);
    expect(cfg.maxInstances).toBe(2);
    expect(cfg.memory).toBe('1Gi');
    expect(cfg.budget).toEqual({
      billingAccountId: '012345-6789AB-CDEF01',
      amount: 2,
      currency: 'GBP',
    });
  });

  it('fails without gcp:project', async () => {
    const { loadConfig } = await loadWithConfig({});
    expect(() => loadConfig()).toThrow();
  });

  describe('validation', () => {
    it('rejects a malformed project ID', async () => {
      await expectInvalid({ 'gcp:project': 'Not A Project' }, /Invalid gcp:project/);
    });

    it('rejects a malformed region', async () => {
      await expectInvalid({ 'gcp:region': 'europe west' }, /Invalid gcp:region/);
    });

    it('rejects a domain that is not a hostname', async () => {
      await expectInvalid({ appDomains: ['https://api.fortressauth.com'] }, /not a hostname/);
    });

    it('rejects PORT, which Cloud Run sets itself', async () => {
      await expectInvalid({ appEnv: { PORT: '8080' } }, /Cloud Run reserves it/);
    });

    it('rejects keys this stack sets, such as COOKIE_SECURE', async () => {
      await expectInvalid({ appEnv: { COOKIE_SECURE: 'false' } }, /this stack sets it/);
    });

    it('sends TRUSTED_PROXY_HOP_COUNT to its own setting', async () => {
      await expectInvalid(
        { appEnv: { TRUSTED_PROXY_HOP_COUNT: '2' } },
        /set trustedProxyHopCount instead/,
      );
    });

    it('rejects non-string appEnv values', async () => {
      await expectInvalid({ appEnv: { BREACHED_PASSWORD_CHECK: true } }, /Expected a string/);
    });

    it(`rejects more than ${MAX_SECRET_ENV_KEYS} secret keys, to stay free`, async () => {
      const keys = Array.from({ length: MAX_SECRET_ENV_KEYS + 1 }, (_, i) => `SECRET_${i}`);
      await expectInvalid({ secretEnvKeys: keys }, /keep it to 6 or fewer/);
    });

    it('rejects duplicate secret keys', async () => {
      await expectInvalid({ secretEnvKeys: ['DATABASE_URL', 'DATABASE_URL'] }, /must be unique/);
    });

    it('rejects a key in both appEnv and secretEnvKeys', async () => {
      await expectInvalid(
        { appEnv: { DATABASE_URL: 'x' }, secretEnvKeys: ['DATABASE_URL'] },
        /in both appEnv and secretEnvKeys/,
      );
    });

    it.each([
      ['maxInstances', 0],
      ['maxInstances', 11],
      ['trustedProxyHopCount', 0],
      ['trustedProxyHopCount', 9],
      ['containerPort', 70000],
      ['keepImageCount', 0],
    ])('rejects %s = %s', async (key, value) => {
      await expectInvalid({ [key]: value }, new RegExp(`Invalid ${key} config value`));
    });

    it('rejects an unsupported cpu value', async () => {
      await expectInvalid({ cpu: '0.5' }, /Invalid cpu config value/);
    });

    it('rejects a malformed billing account ID', async () => {
      await expectInvalid({ billingAccountId: 'my-billing' }, /Invalid billingAccountId/);
    });

    it('rejects a malformed budget currency', async () => {
      await expectInvalid(
        { billingAccountId: '012345-6789AB-CDEF01', budgetCurrency: 'usd' },
        /Invalid budgetCurrency/,
      );
    });
  });
});

describe('checkSecretEnv', () => {
  it('returns the values when every key is set', () => {
    expect(checkSecretEnv({ DATABASE_URL: 'postgres://x' }, ['DATABASE_URL'])).toEqual({
      DATABASE_URL: 'postgres://x',
    });
  });

  it('names the missing keys and the command to set them', () => {
    expect(() =>
      checkSecretEnv({ DATABASE_URL: 'postgres://x' }, ['DATABASE_URL', 'RESEND_API_KEY']),
    ).toThrow(/Missing: RESEND_API_KEY.*--path 'secretEnv.RESEND_API_KEY'/);
  });

  it('treats a missing secretEnv map as empty', () => {
    expect(checkSecretEnv(undefined, [])).toEqual({});
    expect(() => checkSecretEnv(undefined, ['DATABASE_URL'])).toThrow(/Missing: DATABASE_URL/);
  });
});

describe('FIXED_ENV', () => {
  it('keeps cookies Secure and metrics off', () => {
    expect(FIXED_ENV).toMatchObject({
      NODE_ENV: 'production',
      COOKIE_SECURE: 'true',
      CSRF_COOKIE_SECURE: 'true',
      METRICS_ENABLED: 'false',
    });
    expect(FIXED_ENV).not.toHaveProperty('PORT');
    expect(FIXED_ENV).not.toHaveProperty('TRUSTED_PROXY_HOP_COUNT');
  });
});
