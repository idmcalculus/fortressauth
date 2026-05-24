import * as aws from '@pulumi/aws';

import type { ResolvedConfig } from './config';

export interface EcrResources {
  readonly repository: aws.ecr.Repository;
}

export function buildEcr(config: ResolvedConfig, tags: Record<string, string>): EcrResources {
  const repository = new aws.ecr.Repository(`${config.namePrefix}-repo`, {
    name: `${config.namePrefix}/server`,
    forceDelete: !config.dbDeletionProtection,
    imageTagMutability: 'MUTABLE',
    imageScanningConfiguration: { scanOnPush: true },
    encryptionConfigurations: [{ encryptionType: 'AES256' }],
    tags: { ...tags, Component: 'ecr' },
  });

  new aws.ecr.LifecyclePolicy(`${config.namePrefix}-repo-lifecycle`, {
    repository: repository.name,
    policy: JSON.stringify({
      rules: [
        {
          rulePriority: 1,
          description: 'Retain the last 30 tagged images',
          selection: {
            tagStatus: 'tagged',
            tagPatternList: ['*'],
            countType: 'imageCountMoreThan',
            countNumber: 30,
          },
          action: { type: 'expire' },
        },
        {
          rulePriority: 2,
          description: 'Expire untagged images after 7 days',
          selection: {
            tagStatus: 'untagged',
            countType: 'sinceImagePushed',
            countUnit: 'days',
            countNumber: 7,
          },
          action: { type: 'expire' },
        },
      ],
    }),
  });

  return { repository };
}
