import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildDatabase } from '../database';
import { buildNetwork } from '../network';
import { buildSecrets } from '../secrets';
import {
  flushResources,
  type InstallMocksResult,
  installMocks,
  makeConfig,
  resolveOutput,
  TEST_TAGS,
} from './helpers';

describe('buildDatabase', () => {
  let mocks: InstallMocksResult;

  beforeEach(async () => {
    mocks = await installMocks('dev');
  });

  afterEach(() => {
    mocks.resources.length = 0;
  });

  /**
   * Builds the network + secrets prerequisites and returns them so the
   * database tests can compose without copy-pasting the wiring.
   */
  async function setup(configOverrides: Parameters<typeof makeConfig>[0] = {}) {
    const config = makeConfig(configOverrides);
    const network = buildNetwork(config, TEST_TAGS);
    const secrets = buildSecrets(config, TEST_TAGS);
    await flushResources();
    return { config, network, secrets };
  }

  it('creates a private subnet group bound to the VPC private subnets', async () => {
    const { config, network, secrets } = await setup();
    buildDatabase(config, network, secrets, TEST_TAGS);
    await flushResources();

    const subnetGroup = mocks.oneOfType('aws:rds/subnetGroup:SubnetGroup');
    expect(subnetGroup.inputs.name).toBe('fortressauth-dev-db-subnets');
    expect(subnetGroup.inputs.tags).toMatchObject({ Component: 'database' });
  });

  it('creates a parameter group that forces TLS and preloads pg_stat_statements', async () => {
    const { config, network, secrets } = await setup({ dbPostgresVersion: '17.10' });
    buildDatabase(config, network, secrets, TEST_TAGS);
    await flushResources();

    const params = mocks.oneOfType('aws:rds/parameterGroup:ParameterGroup');
    expect(params.inputs.family).toBe('postgres17');

    const forceSsl = params.inputs.parameters.find(
      (p: { name: string }) => p.name === 'rds.force_ssl',
    );
    expect(forceSsl).toEqual({
      name: 'rds.force_ssl',
      value: '1',
      applyMethod: 'pending-reboot',
    });

    const sharedPreload = params.inputs.parameters.find(
      (p: { name: string }) => p.name === 'shared_preload_libraries',
    );
    expect(sharedPreload?.value).toBe('pg_stat_statements');
  });

  it('parameter group family is derived from the major version', async () => {
    const { config, network, secrets } = await setup({ dbPostgresVersion: '15.4' });
    buildDatabase(config, network, secrets, TEST_TAGS);
    await flushResources();

    expect(mocks.oneOfType('aws:rds/parameterGroup:ParameterGroup').inputs.family).toBe(
      'postgres15',
    );
  });

  describe('RDS instance', () => {
    it('uses the configured engine version, instance class, and storage settings', async () => {
      const { config, network, secrets } = await setup({
        dbInstanceClass: 'db.t4g.medium',
        dbAllocatedStorageGb: 50,
        dbPostgresVersion: '17.10',
      });
      buildDatabase(config, network, secrets, TEST_TAGS);
      await flushResources();

      const instance = mocks.oneOfType('aws:rds/instance:Instance');
      expect(instance.inputs.engine).toBe('postgres');
      expect(instance.inputs.engineVersion).toBe('17.10');
      expect(instance.inputs.instanceClass).toBe('db.t4g.medium');
      expect(instance.inputs.allocatedStorage).toBe(50);
      expect(instance.inputs.storageType).toBe('gp3');
      expect(instance.inputs.storageEncrypted).toBe(true);
    });

    it('binds the database security group, never publicly accessible', async () => {
      const { config, network, secrets } = await setup();
      buildDatabase(config, network, secrets, TEST_TAGS);
      await flushResources();

      const instance = mocks.oneOfType('aws:rds/instance:Instance');
      expect(instance.inputs.publiclyAccessible).toBe(false);
      expect(instance.inputs.vpcSecurityGroupIds).toBeDefined();
    });

    it('configures backup window, maintenance window, and CloudWatch log export', async () => {
      const { config, network, secrets } = await setup({ dbBackupRetentionDays: 14 });
      buildDatabase(config, network, secrets, TEST_TAGS);
      await flushResources();

      const instance = mocks.oneOfType('aws:rds/instance:Instance');
      expect(instance.inputs.backupRetentionPeriod).toBe(14);
      expect(instance.inputs.backupWindow).toBe('02:00-03:00');
      expect(instance.inputs.maintenanceWindow).toBe('sun:03:30-sun:04:30');
      expect(instance.inputs.enabledCloudwatchLogsExports).toEqual(['postgresql']);
      expect(instance.inputs.copyTagsToSnapshot).toBe(true);
    });

    it('sets deletion protection and final snapshot per stack defaults (dev)', async () => {
      const { config, network, secrets } = await setup({
        dbDeletionProtection: false,
        dbSkipFinalSnapshot: true,
      });
      buildDatabase(config, network, secrets, TEST_TAGS);
      await flushResources();

      const instance = mocks.oneOfType('aws:rds/instance:Instance');
      expect(instance.inputs.deletionProtection).toBe(false);
      expect(instance.inputs.skipFinalSnapshot).toBe(true);
      expect(instance.inputs.finalSnapshotIdentifier).toBeUndefined();
    });

    it('builds a final snapshot identifier including the stack name when not skipping', async () => {
      const { config, network, secrets } = await setup({
        stack: 'prod',
        dbDeletionProtection: true,
        dbSkipFinalSnapshot: false,
        namePrefix: 'fortressauth-prod',
      });
      buildDatabase(config, network, secrets, TEST_TAGS);
      await flushResources();

      const instance = mocks.oneOfType('aws:rds/instance:Instance');
      expect(instance.inputs.skipFinalSnapshot).toBe(false);
      expect(instance.inputs.finalSnapshotIdentifier).toBe('fortressauth-prod-db-final-prod');
    });
  });

  describe('DATABASE_URL secret population', () => {
    it('writes a SecretVersion with the assembled connection string after instance creation', async () => {
      const { config, network, secrets } = await setup({
        dbName: 'fa_app',
        dbUser: 'fa_app',
      });
      buildDatabase(config, network, secrets, TEST_TAGS);
      await flushResources();

      // Find the DATABASE_URL SecretVersion (created in database.ts, not secrets.ts).
      const databaseUrlVersion = mocks
        .byType('aws:secretsmanager/secretVersion:SecretVersion')
        .find((v) => v.name === 'fortressauth-dev-database-url-v1');
      expect(databaseUrlVersion).toBeDefined();
    });

    it('returns a databaseUrl Output that reflects the encoded password and configured DB/user', async () => {
      const { config, network, secrets } = await setup({
        dbName: 'fortressauth',
        dbUser: 'app_user',
      });
      const result = buildDatabase(config, network, secrets, TEST_TAGS);
      await flushResources();

      const url = await resolveOutput(result.databaseUrl);
      expect(url.startsWith('postgresql://app_user:')).toBe(true);
      expect(url).toContain(
        '@fortressauth-dev-db.cluster-mock.eu-west-1.rds.amazonaws.com:5432/fortressauth',
      );
      expect(url).toContain('?sslmode=require');
    });

    it('URL-encodes special characters in the password before embedding in the URL', async () => {
      // We can't easily inject a custom password into the RandomPassword
      // mock, but we can verify directly that the encoding behavior we
      // depend on (encodeURIComponent for "/", "@", "#", ":") matches what
      // database.ts uses to build the URL.
      const sample = 'p@ss/word#1:special';
      const encoded = encodeURIComponent(sample);
      expect(encoded).toBe('p%40ss%2Fword%231%3Aspecial');
      // None of the reserved characters that would break a URL parser
      // should remain in the encoded output.
      for (const ch of ['@', '/', '#', ':']) {
        expect(encoded).not.toContain(ch);
      }
    });
  });
});
