import * as pulumi from '@pulumi/pulumi';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildRuntime } from '../secrets';
import {
  flushResources,
  type InstallMocksResult,
  installMocks,
  makeConfig,
  resolveOutput,
  TEST_LABELS,
} from './helpers';

// Pulumi's wire-format marker for secret values (pulumi/runtime/rpc.ts).
const PULUMI_SECRET_SIG_KEY = '4dabf18193072939515e22adb298388d';
const PULUMI_SECRET_SIG_VALUE = '1b47061264138c4ac30d75fd1eb44270';

describe('buildRuntime', () => {
  let mocks: InstallMocksResult;

  beforeEach(async () => {
    mocks = await installMocks('prod');
  });

  afterEach(() => {
    mocks.resources.length = 0;
  });

  it('creates a dedicated runtime service account', async () => {
    buildRuntime(makeConfig(), TEST_LABELS, []);
    await flushResources();

    const account = mocks.oneOfType('gcp:serviceaccount/account:Account');
    expect(account.inputs).toMatchObject({
      project: 'fortressauth-test',
      accountId: 'fortressauth-api-run',
    });
  });

  it('creates one secret, one version and one reader binding per key', async () => {
    buildRuntime(makeConfig(), TEST_LABELS, []);
    await flushResources();

    const secrets = mocks.byType('gcp:secretmanager/secret:Secret');
    expect(secrets.map((s) => s.inputs.secretId)).toEqual([
      'fortressauth-api-database-url',
      'fortressauth-api-resend-api-key',
    ]);
    expect(secrets[0]?.inputs.replication).toEqual({ auto: {} });

    const versions = mocks.byType('gcp:secretmanager/secretVersion:SecretVersion');
    expect(versions).toHaveLength(2);
    for (const version of versions) {
      expect(version.inputs.deletionPolicy).toBe('DELETE');
    }

    const readers = mocks.byType('gcp:secretmanager/secretIamMember:SecretIamMember');
    expect(readers.map((r) => r.inputs)).toEqual([
      expect.objectContaining({
        secretId: 'fortressauth-api-database-url',
        role: 'roles/secretmanager.secretAccessor',
        member: 'serviceAccount:fortressauth-api-run@fortressauth-test.iam.gserviceaccount.com',
      }),
      expect.objectContaining({
        secretId: 'fortressauth-api-resend-api-key',
        role: 'roles/secretmanager.secretAccessor',
      }),
    ]);
  });

  it('stores each value from the secret config, kept secret', async () => {
    const runtime = buildRuntime(
      makeConfig({
        secretEnvKeys: ['RESEND_API_KEY'],
        secretEnv: pulumi.secret({ RESEND_API_KEY: 're_live_value' }),
      }),
      TEST_LABELS,
      [],
    );
    await flushResources();

    // Pulumi's mocks pass secret inputs wrapped with its secret signature,
    // which shows the value reaches the provider still marked secret.
    const version = mocks.oneOfType('gcp:secretmanager/secretVersion:SecretVersion');
    expect(version.inputs.secretData).toEqual({
      [PULUMI_SECRET_SIG_KEY]: PULUMI_SECRET_SIG_VALUE,
      value: 're_live_value',
    });
    expect(runtime.secretEnv.map((ref) => ref.name)).toEqual(['RESEND_API_KEY']);
    expect(await resolveOutput(runtime.secretEnv[0]?.version as pulumi.Output<string>)).toBe('1');
  });

  it('creates no secrets when none are configured', async () => {
    buildRuntime(makeConfig({ secretEnvKeys: [], secretEnv: pulumi.secret({}) }), TEST_LABELS, []);
    await flushResources();

    expect(mocks.byType('gcp:secretmanager/secret:Secret')).toHaveLength(0);
  });
});
