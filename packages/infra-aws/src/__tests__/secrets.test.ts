import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildSecrets } from '../secrets';
import {
  flushResources,
  type InstallMocksResult,
  installMocks,
  makeConfig,
  resolveOutput,
  TEST_TAGS,
} from './helpers';

describe('buildSecrets', () => {
  let mocks: InstallMocksResult;

  beforeEach(async () => {
    mocks = await installMocks('dev');
  });

  afterEach(() => {
    mocks.resources.length = 0;
  });

  it('creates a random database password and stores it in Secrets Manager', async () => {
    buildSecrets(makeConfig(), TEST_TAGS);
    await flushResources();

    const password = mocks.oneOfType('random:index/randomPassword:RandomPassword');
    expect(password.inputs.length).toBe(32);
    expect(password.inputs.special).toBe(true);
    expect(password.inputs.overrideSpecial).toBe('!#$%&*()-_=+[]{}<>:?');

    const dbPasswordSecrets = mocks
      .byType('aws:secretsmanager/secret:Secret')
      .filter((r) => r.inputs.name === 'fortressauth-dev/db/password');
    expect(dbPasswordSecrets).toHaveLength(1);
    expect(dbPasswordSecrets[0]?.inputs.recoveryWindowInDays).toBe(7);
  });

  it('creates a DATABASE_URL secret container (populated by database.ts)', async () => {
    buildSecrets(makeConfig(), TEST_TAGS);
    await flushResources();

    const databaseUrlSecret = mocks
      .byType('aws:secretsmanager/secret:Secret')
      .find((r) => r.inputs.name === 'fortressauth-dev/app/DATABASE_URL');
    expect(databaseUrlSecret).toBeDefined();
    expect(databaseUrlSecret?.inputs.tags).toMatchObject({
      Component: 'app-secret',
      EnvKey: 'DATABASE_URL',
    });
  });

  it('creates one Secrets Manager container per declared secret env key', async () => {
    const config = makeConfig({
      secretEnvKeys: ['RESEND_API_KEY', 'GOOGLE_CLIENT_SECRET', 'GITHUB_CLIENT_SECRET'],
    });
    buildSecrets(config, TEST_TAGS);
    await flushResources();

    const appSecrets = mocks
      .byType('aws:secretsmanager/secret:Secret')
      .filter((r) => /\/app\/(?!DATABASE_URL$)/.test(r.inputs.name as string));
    expect(appSecrets).toHaveLength(3);

    const names = appSecrets.map((r) => r.inputs.name);
    expect(names).toContain('fortressauth-dev/app/RESEND_API_KEY');
    expect(names).toContain('fortressauth-dev/app/GOOGLE_CLIENT_SECRET');
    expect(names).toContain('fortressauth-dev/app/GITHUB_CLIENT_SECRET');

    for (const secret of appSecrets) {
      expect(secret.inputs.tags).toMatchObject({ Component: 'app-secret' });
    }
  });

  it('seeds each app secret with a placeholder version', async () => {
    buildSecrets(makeConfig({ secretEnvKeys: ['RESEND_API_KEY'] }), TEST_TAGS);
    await flushResources();

    const versions = mocks.byType('aws:secretsmanager/secretVersion:SecretVersion');
    // Each secret gets exactly one initial version: db-password-v1,
    // database-url-v1, and the per-key placeholder. We assert there is at
    // least one SecretVersion with a placeholder name (so we don't have to
    // depend on input-bag carryover semantics in the mock).
    const placeholderNames = versions
      .filter((v) => v.name.includes('app-secret-resend-api-key-placeholder'))
      .map((v) => v.name);
    expect(placeholderNames).toContain('fortressauth-dev-app-secret-resend-api-key-placeholder');
  });

  it('exposes secretEnvSecrets in the same order operators declared them', async () => {
    const config = makeConfig({
      secretEnvKeys: ['BBB', 'AAA', 'CCC'],
    });
    const result = buildSecrets(config, TEST_TAGS);
    await flushResources();

    const order = result.appSecretEnvSecrets.map((s) => s.name);
    expect(order).toEqual(['BBB', 'AAA', 'CCC']);
  });

  it('exposes the random password value as a Pulumi output that resolves to the mock value', async () => {
    const result = buildSecrets(makeConfig(), TEST_TAGS);
    await flushResources();

    const value = await resolveOutput(result.dbPasswordValue);
    // Helper synthesises `result: random-<name>` for RandomPassword.
    expect(value).toMatch(/^random-fortressauth-dev-db-password$/);
  });

  it('returns no app secrets when secretEnvKeys is empty', async () => {
    const result = buildSecrets(makeConfig({ secretEnvKeys: [] }), TEST_TAGS);
    await flushResources();
    expect(result.appSecretEnvSecrets).toEqual([]);
  });
});
