import * as aws from '@pulumi/aws';
import type * as pulumi from '@pulumi/pulumi';
import * as random from '@pulumi/random';

import type { ResolvedConfig } from './config';

export interface SecretRef {
  readonly name: string;
  readonly arn: pulumi.Output<string>;
}

export interface SecretsResources {
  readonly dbPasswordSecret: aws.secretsmanager.Secret;
  readonly dbPasswordValue: pulumi.Output<string>;
  readonly databaseUrlSecret: aws.secretsmanager.Secret;
  readonly appSecretEnvSecrets: ReadonlyArray<SecretRef>;
}

/**
 * Builds the Secrets Manager resources for the FortressAuth stack.
 *
 * Secret containers are created by Pulumi. Values are populated as follows:
 *   - DB password: random value generated at first apply, written to its
 *     Secrets Manager secret automatically. Subsequent applies do not
 *     overwrite the value.
 *   - DATABASE_URL: assembled in database.ts from RDS endpoint + DB password,
 *     written to a dedicated secret.
 *   - App secret env (e.g. RESEND_API_KEY, OAuth client secrets): containers
 *     created here for each declared key in `secretEnvKeys`. Initial values
 *     are placeholder strings. Operators populate real values via:
 *
 *       aws secretsmanager put-secret-value \
 *         --secret-id fortressauth-prod/app/RESEND_API_KEY \
 *         --secret-string 're_xxxxxxxxxxxxxxxxxxxx'
 *
 *     The ECS task pulls them at start via task role.
 */
export function buildSecrets(
  config: ResolvedConfig,
  tags: Record<string, string>,
): SecretsResources {
  const dbPassword = new random.RandomPassword(`${config.namePrefix}-db-password`, {
    length: 32,
    overrideSpecial: '!#$%&*()-_=+[]{}<>:?',
    special: true,
  });

  const dbPasswordSecret = new aws.secretsmanager.Secret(`${config.namePrefix}-db-password`, {
    name: `${config.namePrefix}/db/password`,
    description: 'PostgreSQL master password for FortressAuth RDS instance',
    recoveryWindowInDays: 7,
    tags: { ...tags, Component: 'database' },
  });

  new aws.secretsmanager.SecretVersion(`${config.namePrefix}-db-password-v1`, {
    secretId: dbPasswordSecret.id,
    secretString: dbPassword.result,
  });

  const databaseUrlSecret = new aws.secretsmanager.Secret(`${config.namePrefix}-database-url`, {
    name: `${config.namePrefix}/app/DATABASE_URL`,
    description: 'PostgreSQL connection string for FortressAuth app',
    recoveryWindowInDays: 7,
    tags: { ...tags, Component: 'app-secret', EnvKey: 'DATABASE_URL' },
  });

  const appSecretEnvSecrets: SecretRef[] = [];
  for (const envKey of config.secretEnvKeys) {
    const slug = envKey.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const secret = new aws.secretsmanager.Secret(`${config.namePrefix}-app-secret-${slug}`, {
      name: `${config.namePrefix}/app/${envKey}`,
      description: `FortressAuth runtime secret env var: ${envKey}. Populate via AWS CLI/console.`,
      recoveryWindowInDays: 7,
      tags: { ...tags, Component: 'app-secret', EnvKey: envKey },
    });

    // Seed with a placeholder so the secret has a current AWSCURRENT version
    // and ECS can resolve it at task start. Operators replace this value via
    // put-secret-value before going live. Uses ignoreChanges to prevent
    // Pulumi from reverting operator-managed values on subsequent applies.
    new aws.secretsmanager.SecretVersion(
      `${config.namePrefix}-app-secret-${slug}-placeholder`,
      {
        secretId: secret.id,
        secretString: 'CHANGE_ME_AFTER_DEPLOY',
      },
      { ignoreChanges: ['secretString'] },
    );

    appSecretEnvSecrets.push({ name: envKey, arn: secret.arn });
  }

  return {
    dbPasswordSecret,
    dbPasswordValue: dbPassword.result,
    databaseUrlSecret,
    appSecretEnvSecrets,
  };
}
