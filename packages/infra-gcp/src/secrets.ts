import * as gcp from '@pulumi/gcp';
import type * as pulumi from '@pulumi/pulumi';

import type { ResolvedConfig } from './config';

export interface SecretEnvRef {
  readonly name: string;
  readonly secretId: pulumi.Output<string>;
  /** The version number the service pins, so a new value rolls a new revision. */
  readonly version: pulumi.Output<string>;
}

export interface RuntimeResources {
  readonly serviceAccount: gcp.serviceaccount.Account;
  readonly secretEnv: readonly SecretEnvRef[];
}

/**
 * The identity the server runs as, and one Secret Manager secret per
 * `secretEnvKeys` entry. Values come from `pulumi config set --secret`, and
 * each secret holds exactly one version: changing a value replaces it, so the
 * count stays within the 6 versions Secret Manager stores for free.
 *
 * The runtime account gets no project roles, only read access to these
 * secrets.
 */
export function buildRuntime(
  config: ResolvedConfig,
  labels: Record<string, string>,
  dependsOn: pulumi.Resource[],
): RuntimeResources {
  const serviceAccount = new gcp.serviceaccount.Account(
    `${config.namePrefix}-runtime`,
    {
      project: config.project,
      accountId: `${config.serviceName}-run`.slice(0, 30),
      displayName: 'FortressAuth API (Cloud Run runtime)',
    },
    { dependsOn },
  );

  const secretEnv = config.secretEnvKeys.map((key): SecretEnvRef => {
    const slug = key.toLowerCase().replace(/_/g, '-');
    const secret = new gcp.secretmanager.Secret(
      `${config.namePrefix}-secret-${slug}`,
      {
        project: config.project,
        secretId: `${config.serviceName}-${slug}`,
        replication: { auto: {} },
        labels,
      },
      { dependsOn },
    );

    // A new value replaces this version: Pulumi creates the new one first,
    // repoints the service, then destroys the old one. Destroying rather
    // than disabling matters, because disabled versions still count towards
    // the free allowance.
    const version = new gcp.secretmanager.SecretVersion(
      `${config.namePrefix}-secret-${slug}-value`,
      {
        secret: secret.id,
        secretData: config.secretEnv.apply((values) => values[key] ?? ''),
        deletionPolicy: 'DELETE',
      },
    );

    new gcp.secretmanager.SecretIamMember(`${config.namePrefix}-secret-${slug}-reader`, {
      project: config.project,
      secretId: secret.secretId,
      role: 'roles/secretmanager.secretAccessor',
      member: serviceAccount.member,
    });

    return { name: key, secretId: secret.secretId, version: version.version };
  });

  return { serviceAccount, secretEnv };
}
