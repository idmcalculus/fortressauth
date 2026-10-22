import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildGithubDeploy, githubAttributeCondition } from '../github';
import { buildRegistry } from '../registry';
import { buildRuntime } from '../secrets';
import {
  flushResources,
  type InstallMocksResult,
  installMocks,
  MOCK_PROJECT_NUMBER,
  makeConfig,
  TEST_LABELS,
} from './helpers';

const DEPLOYER = 'serviceAccount:fortressauth-api-deploy@fortressauth-test.iam.gserviceaccount.com';

describe('buildGithubDeploy', () => {
  let mocks: InstallMocksResult;

  beforeEach(async () => {
    mocks = await installMocks('prod');
    const config = makeConfig();
    const runtime = buildRuntime(config, TEST_LABELS, []);
    const registry = buildRegistry(config, TEST_LABELS, []);
    buildGithubDeploy(config, runtime, registry, []);
    await flushResources();
  });

  afterEach(() => {
    mocks.resources.length = 0;
  });

  it('trusts GitHub OIDC tokens only from this repository and environment', () => {
    const provider = mocks.oneOfType(
      'gcp:iam/workloadIdentityPoolProvider:WorkloadIdentityPoolProvider',
    );
    expect(provider.inputs.oidc).toEqual({
      issuerUri: 'https://token.actions.githubusercontent.com',
    });
    expect(provider.inputs.attributeCondition).toBe(
      'assertion.repository == "idmcalculus/fortressauth" && assertion.environment == "cloudrun-prod"',
    );
    expect(provider.inputs.attributeMapping).toMatchObject({
      'google.subject': 'assertion.sub',
      'attribute.repository': 'assertion.repository',
      'attribute.environment': 'assertion.environment',
    });
  });

  it('lets only that repository impersonate the deployer', () => {
    const binding = mocks.byName('fortressauth-prod-deployer-from-github');
    expect(binding?.inputs).toMatchObject({
      role: 'roles/iam.workloadIdentityUser',
      member: `principalSet://iam.googleapis.com/projects/${MOCK_PROJECT_NUMBER}/locations/global/workloadIdentityPools/github-actions/attribute.repository/idmcalculus/fortressauth`,
    });
  });

  it('gives the deployer exactly three grants: deploy, push, and run as the runtime account', () => {
    expect(mocks.byName('fortressauth-prod-deployer-run')?.inputs).toMatchObject({
      role: 'roles/run.developer',
      member: DEPLOYER,
    });
    expect(mocks.byName('fortressauth-prod-deployer-push')?.inputs).toMatchObject({
      repository: 'fortressauth',
      role: 'roles/artifactregistry.writer',
      member: DEPLOYER,
    });
    expect(mocks.byName('fortressauth-prod-deployer-act-as-runtime')?.inputs).toMatchObject({
      serviceAccountId:
        'projects/fortressauth-test/serviceAccounts/fortressauth-api-run@fortressauth-test.iam.gserviceaccount.com',
      role: 'roles/iam.serviceAccountUser',
      member: DEPLOYER,
    });

    const projectGrants = mocks.byType('gcp:projects/iAMMember:IAMMember');
    expect(projectGrants.map((grant) => grant.inputs.role)).toEqual(['roles/run.developer']);
  });
});

describe('githubAttributeCondition', () => {
  it('quotes the repository and environment', () => {
    expect(githubAttributeCondition('owner/repo', 'prod')).toBe(
      'assertion.repository == "owner/repo" && assertion.environment == "prod"',
    );
  });
});
