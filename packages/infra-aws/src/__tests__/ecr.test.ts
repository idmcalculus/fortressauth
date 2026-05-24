import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildEcr } from '../ecr';
import {
  flushResources,
  type InstallMocksResult,
  installMocks,
  makeConfig,
  TEST_TAGS,
} from './helpers';

describe('buildEcr', () => {
  let mocks: InstallMocksResult;

  beforeEach(async () => {
    mocks = await installMocks('dev');
  });

  afterEach(() => {
    mocks.resources.length = 0;
  });

  it('creates a repository named "<namePrefix>/server"', async () => {
    const config = makeConfig();
    buildEcr(config, TEST_TAGS);
    await flushResources();

    const repo = mocks.oneOfType('aws:ecr/repository:Repository');
    expect(repo.inputs.name).toBe('fortressauth-dev/server');
    expect(repo.inputs.imageTagMutability).toBe('MUTABLE');
    expect(repo.inputs.imageScanningConfiguration).toEqual({ scanOnPush: true });
    expect(repo.inputs.encryptionConfigurations).toEqual([{ encryptionType: 'AES256' }]);
  });

  it('honors deletion protection: forceDelete=true on dev (no protection)', async () => {
    buildEcr(makeConfig({ dbDeletionProtection: false }), TEST_TAGS);
    await flushResources();
    expect(mocks.oneOfType('aws:ecr/repository:Repository').inputs.forceDelete).toBe(true);
  });

  it('forceDelete=false when deletion protection is enabled (prod)', async () => {
    buildEcr(makeConfig({ dbDeletionProtection: true, stack: 'prod' }), TEST_TAGS);
    await flushResources();
    expect(mocks.oneOfType('aws:ecr/repository:Repository').inputs.forceDelete).toBe(false);
  });

  it('attaches a lifecycle policy that retains the last 30 tagged images and expires untagged after 7d', async () => {
    buildEcr(makeConfig(), TEST_TAGS);
    await flushResources();

    const policy = mocks.oneOfType('aws:ecr/lifecyclePolicy:LifecyclePolicy');
    const parsed = JSON.parse(policy.inputs.policy);
    expect(parsed.rules).toHaveLength(2);

    const taggedRule = parsed.rules.find(
      (r: { selection: { tagStatus: string } }) => r.selection.tagStatus === 'tagged',
    );
    expect(taggedRule).toMatchObject({
      rulePriority: 1,
      selection: {
        tagStatus: 'tagged',
        countType: 'imageCountMoreThan',
        countNumber: 30,
      },
      action: { type: 'expire' },
    });

    const untaggedRule = parsed.rules.find(
      (r: { selection: { tagStatus: string } }) => r.selection.tagStatus === 'untagged',
    );
    expect(untaggedRule).toMatchObject({
      rulePriority: 2,
      selection: {
        tagStatus: 'untagged',
        countType: 'sinceImagePushed',
        countUnit: 'days',
        countNumber: 7,
      },
      action: { type: 'expire' },
    });
  });

  it('tags the repository with the standard tag set plus Component=ecr', async () => {
    buildEcr(makeConfig(), TEST_TAGS);
    await flushResources();

    const repo = mocks.oneOfType('aws:ecr/repository:Repository');
    expect(repo.inputs.tags).toEqual({
      ManagedBy: 'pulumi',
      Project: 'fortressauth',
      Stack: 'dev',
      Component: 'ecr',
    });
  });
});
