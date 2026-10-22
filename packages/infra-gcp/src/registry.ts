import * as gcp from '@pulumi/gcp';
import * as pulumi from '@pulumi/pulumi';

import type { ResolvedConfig } from './config';

export interface RegistryResources {
  readonly repository: gcp.artifactregistry.Repository;
  /** Image path without tag or digest, for the deploy workflow. */
  readonly imageName: pulumi.Output<string>;
}

/**
 * A private Docker repository for the server image. Cleanup keeps only the
 * newest `keepImageCount` images so storage stays inside the 0.5 GB that
 * Artifact Registry stores for free.
 */
export function buildRegistry(
  config: ResolvedConfig,
  labels: Record<string, string>,
  dependsOn: pulumi.Resource[],
): RegistryResources {
  const repository = new gcp.artifactregistry.Repository(
    `${config.namePrefix}-images`,
    {
      project: config.project,
      location: config.region,
      repositoryId: config.repositoryId,
      format: 'DOCKER',
      description: 'FortressAuth server images, pushed by the Deploy Cloud Run workflow',
      cleanupPolicyDryRun: false,
      cleanupPolicies: [
        {
          id: 'keep-newest',
          action: 'KEEP',
          mostRecentVersions: { keepCount: config.keepImageCount },
        },
        {
          id: 'delete-older',
          action: 'DELETE',
          condition: { tagState: 'ANY', olderThan: '86400s' },
        },
      ],
      labels,
    },
    { dependsOn },
  );

  const imageName = pulumi.interpolate`${config.region}-docker.pkg.dev/${config.project}/${repository.repositoryId}/server`;

  return { repository, imageName };
}
