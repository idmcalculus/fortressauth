import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';

import type { ResolvedConfig } from './config';
import type { NetworkResources } from './network';
import type { SecretsResources } from './secrets';

export interface DatabaseResources {
  readonly instance: aws.rds.Instance;
  readonly endpoint: pulumi.Output<string>;
  readonly databaseUrl: pulumi.Output<string>;
  readonly databaseUrlSecretArn: pulumi.Output<string>;
}

export function buildDatabase(
  config: ResolvedConfig,
  network: NetworkResources,
  secrets: SecretsResources,
  tags: Record<string, string>,
): DatabaseResources {
  const subnetGroup = new aws.rds.SubnetGroup(`${config.namePrefix}-db-subnets`, {
    name: `${config.namePrefix}-db-subnets`,
    subnetIds: network.privateSubnetIds,
    description: 'Private subnets for FortressAuth RDS',
    tags: { ...tags, Component: 'database' },
  });

  const parameterGroup = new aws.rds.ParameterGroup(`${config.namePrefix}-db-params`, {
    name: `${config.namePrefix}-db-params`,
    family: `postgres${config.dbPostgresVersion.split('.')[0]}`,
    description: 'FortressAuth PostgreSQL parameters: TLS required, pgcrypto preloaded.',
    parameters: [
      // Force TLS for all client connections.
      { name: 'rds.force_ssl', value: '1', applyMethod: 'pending-reboot' },
      // Preload pgcrypto so the server can use it without requiring an
      // application-level CREATE EXTENSION at startup. The extension is also
      // explicitly created via the migration step in the application.
      {
        name: 'shared_preload_libraries',
        value: 'pg_stat_statements',
        applyMethod: 'pending-reboot',
      },
    ],
    tags: { ...tags, Component: 'database' },
  });

  const instance = new aws.rds.Instance(
    `${config.namePrefix}-db`,
    {
      identifier: `${config.namePrefix}-db`,
      engine: 'postgres',
      engineVersion: config.dbPostgresVersion,
      instanceClass: config.dbInstanceClass,
      allocatedStorage: config.dbAllocatedStorageGb,
      storageType: 'gp3',
      storageEncrypted: true,
      dbName: config.dbName,
      username: config.dbUser,
      password: secrets.dbPasswordValue,
      port: 5432,
      vpcSecurityGroupIds: [network.databaseSecurityGroup.id],
      dbSubnetGroupName: subnetGroup.name,
      parameterGroupName: parameterGroup.name,
      publiclyAccessible: false,
      multiAz: config.dbMultiAz,
      backupRetentionPeriod: config.dbBackupRetentionDays,
      backupWindow: '02:00-03:00',
      maintenanceWindow: 'sun:03:30-sun:04:30',
      deletionProtection: config.dbDeletionProtection,
      skipFinalSnapshot: config.dbSkipFinalSnapshot,
      finalSnapshotIdentifier: config.dbSkipFinalSnapshot
        ? undefined
        : `${config.namePrefix}-db-final-${config.stack}`,
      copyTagsToSnapshot: true,
      enabledCloudwatchLogsExports: ['postgresql'],
      performanceInsightsEnabled: false,
      autoMinorVersionUpgrade: true,
      applyImmediately: false,
      tags: { ...tags, Component: 'database' },
    },
    {
      // Recreating the password should not recreate the database.
      ignoreChanges: ['password'],
    },
  );

  const databaseUrl = pulumi
    .all([instance.address, secrets.dbPasswordValue] as const)
    .apply(([address, password]) => {
      const encoded = encodeURIComponent(password);
      return `postgresql://${config.dbUser}:${encoded}@${address}:5432/${config.dbName}?sslmode=require`;
    });

  new aws.secretsmanager.SecretVersion(`${config.namePrefix}-database-url-v1`, {
    secretId: secrets.databaseUrlSecret.id,
    secretString: databaseUrl,
  });

  return {
    instance,
    endpoint: instance.address,
    databaseUrl,
    databaseUrlSecretArn: secrets.databaseUrlSecret.arn,
  };
}
