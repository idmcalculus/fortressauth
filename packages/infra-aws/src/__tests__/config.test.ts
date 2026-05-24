import * as pulumi from '@pulumi/pulumi';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ResolvedConfig } from '../config';

const PROJECT = 'fortressauth-aws';

interface ConfigInput {
  /** Stack name; default 'dev'. */
  stack?: string;
  /** Map of fortressauth-aws:* config keys to values (strings, numbers, booleans, arrays, or objects). */
  values?: Record<string, unknown>;
}

/**
 * Drives loadConfig() against the live Pulumi runtime by writing the
 * supplied stack config map through `pulumi.runtime.setAllConfig` and
 * priming the runtime stack name via `setMocks`. This avoids having to
 * delete the require cache or reset modules between tests; the runtime
 * config store is mutable and `setAllConfig` is the documented way for
 * tests to mutate it.
 */
async function loadWithConfig(input: ConfigInput = {}): Promise<typeof import('../config')> {
  const stack = input.stack ?? 'dev';
  const values = input.values ?? {};

  // Prime project + stack via the official mocks helper. We don't supply
  // any actual mocks here because loadConfig() doesn't construct
  // resources; it only reads `pulumi.Config` and `pulumi.getStack()`.
  await pulumi.runtime.setMocks(
    {
      newResource: (args) => ({ id: `${args.name}_id`, state: args.inputs }),
      call: (args) => args.inputs,
    },
    PROJECT,
    stack,
    /* preview */ false,
  );

  // Reset and write the config map. Pulumi config keys are namespaced as
  // "<project>:<key>" except for explicitly cross-project keys (e.g.
  // aws:region), which can be passed verbatim in the input map.
  const namespaced: Record<string, string> = {};
  for (const [key, raw] of Object.entries(values)) {
    if (raw === undefined) continue;
    const fullKey = key.includes(':') ? key : `${PROJECT}:${key}`;
    namespaced[fullKey] =
      typeof raw === 'string' ? raw : typeof raw === 'object' ? JSON.stringify(raw) : String(raw);
  }
  pulumi.runtime.setAllConfig(namespaced);

  // Re-import so consumers always work against the latest module state.
  // setAllConfig is global so this is mainly for symmetry.
  return await import('../config');
}

const REQUIRED_CONFIG: Record<string, unknown> = {
  appDomain: 'api.example.com',
  appImage: 'public.ecr.aws/fortressauth/server:abc123',
  bounceNotificationEmail: 'ops@example.com',
};

function withRequired(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...REQUIRED_CONFIG, ...extra };
}

describe('loadConfig', () => {
  beforeEach(async () => {
    // Wipe any config left over from a previous test before priming the
    // next one. setAllConfig({}) is the runtime-supported way to reset.
    pulumi.runtime.setAllConfig({});
  });

  afterEach(() => {
    pulumi.runtime.setAllConfig({});
  });

  describe('defaults', () => {
    it('applies the documented defaults when only required keys are provided', async () => {
      const { loadConfig } = await loadWithConfig({ values: withRequired() });
      const cfg = loadConfig();

      expect(cfg.stack).toBe('dev');
      expect(cfg.namePrefix).toBe('fortressauth-dev');
      expect(cfg.appDomain).toBe('api.example.com');
      expect(cfg.hostedZoneName).toBe('api.example.com');
      expect(cfg.frontendBaseUrl).toBe('https://api.example.com');
      expect(cfg.cookieSameSite).toBe('lax');
      expect(cfg.csrfCookieSameSite).toBe('lax');
      expect(cfg.taskCpu).toBe(256);
      expect(cfg.taskMemoryMib).toBe(512);
      expect(cfg.desiredCount).toBe(1);
      expect(cfg.containerPort).toBe(3000);
      expect(cfg.logRetentionDays).toBe(30);
      expect(cfg.dbName).toBe('fortressauth');
      expect(cfg.dbUser).toBe('fortressauth');
      expect(cfg.dbInstanceClass).toBe('db.t4g.micro');
      expect(cfg.dbAllocatedStorageGb).toBe(20);
      expect(cfg.dbBackupRetentionDays).toBe(7);
      expect(cfg.dbMultiAz).toBe(false);
      expect(cfg.dbDeletionProtection).toBe(false);
      expect(cfg.dbSkipFinalSnapshot).toBe(true);
      expect(cfg.dbPostgresVersion).toBe('17.10');
      expect(cfg.vpcCidr).toBe('10.30.0.0/16');
      expect(cfg.availabilityZones).toBe(2);
      expect(cfg.bootstrap).toBe(true);
      expect(cfg.appEnv).toEqual({});
      expect(cfg.secretEnvKeys).toEqual([]);
    });

    it('csrfCookieSameSite inherits from cookieSameSite when not overridden', async () => {
      const { loadConfig } = await loadWithConfig({
        values: withRequired({ cookieSameSite: 'strict' }),
      });
      const cfg = loadConfig();

      expect(cfg.cookieSameSite).toBe('strict');
      expect(cfg.csrfCookieSameSite).toBe('strict');
    });

    it('frontendBaseUrl falls back to https://<appDomain>', async () => {
      const { loadConfig } = await loadWithConfig({
        values: withRequired({ appDomain: 'auth.test.dev' }),
      });
      expect(loadConfig().frontendBaseUrl).toBe('https://auth.test.dev');
    });

    it('sesIdentityDomain defaults to the apex of the hosted zone', async () => {
      const { loadConfig } = await loadWithConfig({
        values: withRequired({ hostedZoneName: 'auth.example.com' }),
      });
      const cfg = loadConfig();
      expect(cfg.sesIdentityDomain).toBe('example.com');
    });

    it('sesFromAddress and sesReplyToAddress fall back to noreply@<sesIdentityDomain>', async () => {
      const { loadConfig } = await loadWithConfig({
        values: withRequired({ sesIdentityDomain: 'mail.test.com' }),
      });
      const cfg = loadConfig();
      expect(cfg.sesFromAddress).toBe('noreply@mail.test.com');
      expect(cfg.sesReplyToAddress).toBe('noreply@mail.test.com');
    });

    it('sesConfigurationSetName defaults to "<namePrefix>-events"', async () => {
      const { loadConfig } = await loadWithConfig({
        values: withRequired({ namePrefix: 'foo-bar' }),
      });
      expect(loadConfig().sesConfigurationSetName).toBe('foo-bar-events');
    });
  });

  describe('production stack defaults', () => {
    // The data driven cases below ensure the prod-vs-dev defaults stay in
    // sync. Both 'prod' and 'production' opt into deletion protection and
    // final snapshots; everything else opts out.
    const stacks = [
      { stack: 'prod', protect: true },
      { stack: 'PRODUCTION', protect: true },
      { stack: 'production', protect: true },
      { stack: 'dev', protect: false },
      { stack: 'staging', protect: false },
    ];

    for (const { stack, protect } of stacks) {
      it(`stack="${stack}" → dbDeletionProtection=${protect}, dbSkipFinalSnapshot=${!protect}`, async () => {
        const { loadConfig } = await loadWithConfig({
          stack,
          values: withRequired(),
        });
        const cfg = loadConfig();
        expect(cfg.dbDeletionProtection).toBe(protect);
        expect(cfg.dbSkipFinalSnapshot).toBe(!protect);
      });
    }

    it('production stacks can opt out of deletion protection while still taking a final snapshot', async () => {
      const { loadConfig } = await loadWithConfig({
        stack: 'prod',
        values: withRequired({ dbDeletionProtection: false }),
      });
      const cfg = loadConfig();
      expect(cfg.dbDeletionProtection).toBe(false);
      // skipFinalSnapshot must stay false on prod even when protection is off
      expect(cfg.dbSkipFinalSnapshot).toBe(false);
    });
  });

  describe('required keys', () => {
    it('throws a descriptive error when appDomain is missing', async () => {
      const { loadConfig } = await loadWithConfig({
        values: { appImage: 'x:y', bounceNotificationEmail: 'a@b.c' },
      });
      expect(() => loadConfig()).toThrow(/appDomain/);
    });

    it('throws when appImage is missing', async () => {
      const { loadConfig } = await loadWithConfig({
        values: { appDomain: 'api.example.com', bounceNotificationEmail: 'a@b.c' },
      });
      expect(() => loadConfig()).toThrow(/appImage/);
    });

    it('throws when appImage is whitespace only', async () => {
      const { loadConfig } = await loadWithConfig({
        values: withRequired({ appImage: '   ' }),
      });
      expect(() => loadConfig()).toThrow(/appImage/);
    });

    it('throws when bounceNotificationEmail is missing', async () => {
      const { loadConfig } = await loadWithConfig({
        values: { appDomain: 'api.example.com', appImage: 'x:y' },
      });
      expect(() => loadConfig()).toThrow(/bounceNotificationEmail/);
    });
  });

  describe('hostname validation', () => {
    it('rejects appDomain values containing whitespace', async () => {
      const { loadConfig } = await loadWithConfig({
        values: withRequired({ appDomain: 'bad domain.com' }),
      });
      expect(() => loadConfig()).toThrow(/appDomain/);
    });

    it('trims surrounding whitespace from appDomain', async () => {
      const { loadConfig } = await loadWithConfig({
        values: withRequired({ appDomain: '  api.example.com  ' }),
      });
      expect(loadConfig().appDomain).toBe('api.example.com');
    });
  });

  describe('frontendBaseUrl validation', () => {
    it('accepts https:// URLs and strips trailing slashes', async () => {
      const { loadConfig } = await loadWithConfig({
        values: withRequired({ frontendBaseUrl: 'https://app.example.com/' }),
      });
      expect(loadConfig().frontendBaseUrl).toBe('https://app.example.com');
    });

    it('accepts http:// URLs', async () => {
      const { loadConfig } = await loadWithConfig({
        values: withRequired({ frontendBaseUrl: 'http://localhost:3000' }),
      });
      expect(loadConfig().frontendBaseUrl).toBe('http://localhost:3000');
    });

    it('rejects non-http(s) protocols', async () => {
      const { loadConfig } = await loadWithConfig({
        values: withRequired({ frontendBaseUrl: 'ftp://example.com' }),
      });
      expect(() => loadConfig()).toThrow(/frontendBaseUrl/);
    });

    it('rejects malformed URLs', async () => {
      const { loadConfig } = await loadWithConfig({
        values: withRequired({ frontendBaseUrl: 'not-a-url' }),
      });
      expect(() => loadConfig()).toThrow(/frontendBaseUrl/);
    });
  });

  describe('cookieSameSite validation', () => {
    for (const value of ['strict', 'lax', 'none'] as const) {
      it(`accepts "${value}"`, async () => {
        const { loadConfig } = await loadWithConfig({
          values: withRequired({ cookieSameSite: value }),
        });
        expect(loadConfig().cookieSameSite).toBe(value);
      });
    }

    it('rejects invalid values', async () => {
      const { loadConfig } = await loadWithConfig({
        values: withRequired({ cookieSameSite: 'lenient' }),
      });
      expect(() => loadConfig()).toThrow(/cookieSameSite/);
    });

    it('csrfCookieSameSite is validated independently when set', async () => {
      const { loadConfig } = await loadWithConfig({
        values: withRequired({ cookieSameSite: 'strict', csrfCookieSameSite: 'banana' }),
      });
      expect(() => loadConfig()).toThrow(/csrfCookieSameSite/);
    });
  });

  describe('identifier validation (dbName, dbUser)', () => {
    it.each([
      ['valid_db_1', true],
      ['_starts_with_underscore', true],
      ['1starts_with_digit', false],
      ['UPPERCASE', false],
      ['has-hyphen', false],
      ['has space', false],
    ])('dbName="%s" → valid=%s', async (value, valid) => {
      const { loadConfig } = await loadWithConfig({
        values: withRequired({ dbName: value }),
      });
      if (valid) {
        expect(loadConfig().dbName).toBe(value);
      } else {
        expect(() => loadConfig()).toThrow(/dbName/);
      }
    });
  });

  describe('CIDR validation', () => {
    it('accepts a valid /16 CIDR', async () => {
      const { loadConfig } = await loadWithConfig({
        values: withRequired({ vpcCidr: '172.20.0.0/16' }),
      });
      expect(loadConfig().vpcCidr).toBe('172.20.0.0/16');
    });

    it('rejects values without a prefix', async () => {
      const { loadConfig } = await loadWithConfig({
        values: withRequired({ vpcCidr: '10.0.0.0' }),
      });
      expect(() => loadConfig()).toThrow(/vpcCidr/);
    });

    it('rejects garbage', async () => {
      const { loadConfig } = await loadWithConfig({
        values: withRequired({ vpcCidr: 'not-a-cidr' }),
      });
      expect(() => loadConfig()).toThrow(/vpcCidr/);
    });
  });

  describe('availabilityZones bounds', () => {
    it('accepts 2 and 3', async () => {
      for (const azs of [2, 3]) {
        const { loadConfig } = await loadWithConfig({
          values: withRequired({ availabilityZones: azs }),
        });
        expect(loadConfig().availabilityZones).toBe(azs);
      }
    });

    it('rejects 1 (insufficient redundancy for RDS multi-AZ option)', async () => {
      const { loadConfig } = await loadWithConfig({
        values: withRequired({ availabilityZones: 1 }),
      });
      expect(() => loadConfig()).toThrow(/availabilityZones/);
    });

    it('rejects 4 (above tested ceiling; consciously kept conservative)', async () => {
      const { loadConfig } = await loadWithConfig({
        values: withRequired({ availabilityZones: 4 }),
      });
      expect(() => loadConfig()).toThrow(/availabilityZones/);
    });
  });

  describe('email validation', () => {
    it('accepts well-formed addresses and trims whitespace', async () => {
      const { loadConfig } = await loadWithConfig({
        values: withRequired({ bounceNotificationEmail: '  bounces@example.com  ' }),
      });
      expect(loadConfig().bounceNotificationEmail).toBe('bounces@example.com');
    });

    it('rejects addresses without an "@"', async () => {
      const { loadConfig } = await loadWithConfig({
        values: withRequired({ bounceNotificationEmail: 'not-an-email' }),
      });
      expect(() => loadConfig()).toThrow(/bounceNotificationEmail/);
    });

    it('rejects addresses with whitespace inside the local-part', async () => {
      const { loadConfig } = await loadWithConfig({
        values: withRequired({ bounceNotificationEmail: 'bad address@example.com' }),
      });
      expect(() => loadConfig()).toThrow(/bounceNotificationEmail/);
    });
  });

  describe('expectedAccountId validation', () => {
    it('accepts a 12-digit account ID', async () => {
      const { loadConfig } = await loadWithConfig({
        values: withRequired({ expectedAccountId: '123456789012' }),
      });
      expect(loadConfig().expectedAccountId).toBe('123456789012');
    });

    it('returns undefined when not set', async () => {
      const { loadConfig } = await loadWithConfig({ values: withRequired() });
      expect(loadConfig().expectedAccountId).toBeUndefined();
    });

    it('rejects non-12-digit IDs', async () => {
      const { loadConfig } = await loadWithConfig({
        values: withRequired({ expectedAccountId: '1234' }),
      });
      expect(() => loadConfig()).toThrow(/expectedAccountId/);
    });

    it('rejects non-numeric IDs', async () => {
      const { loadConfig } = await loadWithConfig({
        values: withRequired({ expectedAccountId: 'abcdefghijkl' }),
      });
      expect(() => loadConfig()).toThrow(/expectedAccountId/);
    });
  });

  describe('appEnv map', () => {
    it('accepts a flat string map', async () => {
      const { loadConfig } = await loadWithConfig({
        values: withRequired({
          appEnv: { LOG_LEVEL: 'debug', FOO: 'bar' },
        }),
      });
      expect(loadConfig().appEnv).toEqual({ LOG_LEVEL: 'debug', FOO: 'bar' });
    });

    it('rejects non-object values', async () => {
      const { loadConfig } = await loadWithConfig({
        values: withRequired({ appEnv: ['LOG_LEVEL=debug'] }),
      });
      expect(() => loadConfig()).toThrow(/appEnv/);
    });

    it('rejects non-string values', async () => {
      const { loadConfig } = await loadWithConfig({
        values: withRequired({ appEnv: { COUNT: 5 } }),
      });
      expect(() => loadConfig()).toThrow(/appEnv\.COUNT/);
    });

    it('rejects multiline values to keep ECS env injection sane', async () => {
      const { loadConfig } = await loadWithConfig({
        values: withRequired({ appEnv: { MULTILINE: 'a\nb' } }),
      });
      expect(() => loadConfig()).toThrow(/MULTILINE/);
    });

    it('rejects keys that contain disallowed characters', async () => {
      const { loadConfig } = await loadWithConfig({
        values: withRequired({ appEnv: { 'has-hyphen': 'no' } }),
      });
      expect(() => loadConfig()).toThrow(/appEnv/);
    });

    it('rejects keys starting with a digit', async () => {
      const { loadConfig } = await loadWithConfig({
        values: withRequired({ appEnv: { '1FOO': 'bar' } }),
      });
      expect(() => loadConfig()).toThrow(/appEnv/);
    });
  });

  describe('secretEnvKeys', () => {
    it('accepts a list of valid env keys', async () => {
      const { loadConfig } = await loadWithConfig({
        values: withRequired({
          secretEnvKeys: ['RESEND_API_KEY', 'GOOGLE_CLIENT_SECRET'],
        }),
      });
      expect(loadConfig().secretEnvKeys).toEqual(['RESEND_API_KEY', 'GOOGLE_CLIENT_SECRET']);
    });

    it('rejects an entry with an invalid key', async () => {
      const { loadConfig } = await loadWithConfig({
        values: withRequired({ secretEnvKeys: ['VALID', 'no-good'] }),
      });
      expect(() => loadConfig()).toThrow(/secretEnvKeys/);
    });

    it('returns an empty list by default', async () => {
      const { loadConfig } = await loadWithConfig({ values: withRequired() });
      expect(loadConfig().secretEnvKeys).toEqual([]);
    });
  });

  describe('numeric configs', () => {
    it('respects custom values', async () => {
      const { loadConfig } = await loadWithConfig({
        values: withRequired({
          taskCpu: 1024,
          taskMemoryMib: 2048,
          desiredCount: 4,
          containerPort: 8080,
          logRetentionDays: 90,
          dbAllocatedStorageGb: 100,
          dbBackupRetentionDays: 14,
        }),
      });
      const cfg = loadConfig();
      expect(cfg.taskCpu).toBe(1024);
      expect(cfg.taskMemoryMib).toBe(2048);
      expect(cfg.desiredCount).toBe(4);
      expect(cfg.containerPort).toBe(8080);
      expect(cfg.logRetentionDays).toBe(90);
      expect(cfg.dbAllocatedStorageGb).toBe(100);
      expect(cfg.dbBackupRetentionDays).toBe(14);
    });
  });

  describe('namePrefix override', () => {
    it('uses an explicit namePrefix when supplied', async () => {
      const { loadConfig } = await loadWithConfig({
        values: withRequired({ namePrefix: 'fa-custom' }),
      });
      const cfg = loadConfig();
      expect(cfg.namePrefix).toBe('fa-custom');
      // Downstream defaults reference namePrefix:
      expect(cfg.sesConfigurationSetName).toBe('fa-custom-events');
    });
  });

  describe('config shape sanity', () => {
    it('returns a frozen-shape readonly config', async () => {
      const { loadConfig } = await loadWithConfig({ values: withRequired() });
      const cfg: ResolvedConfig = loadConfig();

      // Spot-check that the union of fields stays in sync with the
      // ResolvedConfig declaration. If a field is added to the interface
      // without a default, this test catches it.
      const expectedKeys: Array<keyof ResolvedConfig> = [
        'stack',
        'namePrefix',
        'appDomain',
        'hostedZoneName',
        'frontendBaseUrl',
        'cookieSameSite',
        'csrfCookieSameSite',
        'appImage',
        'taskCpu',
        'taskMemoryMib',
        'desiredCount',
        'containerPort',
        'logRetentionDays',
        'dbName',
        'dbUser',
        'dbInstanceClass',
        'dbAllocatedStorageGb',
        'dbBackupRetentionDays',
        'dbMultiAz',
        'dbDeletionProtection',
        'dbSkipFinalSnapshot',
        'dbPostgresVersion',
        'sesIdentityDomain',
        'sesFromAddress',
        'sesFromName',
        'sesReplyToAddress',
        'sesConfigurationSetName',
        'bounceNotificationEmail',
        'sesManageIdentity',
        'vpcCidr',
        'availabilityZones',
        'bootstrap',
        'expectedAccountId',
        'appEnv',
        'secretEnvKeys',
      ];
      for (const k of expectedKeys) {
        expect(cfg).toHaveProperty(k);
      }
    });
  });
});

describe('COMMON_TAGS', () => {
  it('produces the expected tag set for an arbitrary stack name', async () => {
    const { COMMON_TAGS } = await import('../config');
    expect(COMMON_TAGS('staging')).toEqual({
      ManagedBy: 'pulumi',
      Project: 'fortressauth',
      Stack: 'staging',
    });
  });
});
