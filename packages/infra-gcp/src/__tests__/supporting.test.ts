import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BUDGET_API, enableApis, REQUIRED_APIS } from '../apis';
import { buildBudget } from '../budget';
import { buildDomains } from '../domains';
import { buildRegistry } from '../registry';
import { buildRuntime } from '../secrets';
import { buildService } from '../service';
import {
  flushResources,
  type InstallMocksResult,
  installMocks,
  MOCK_PROJECT_NUMBER,
  makeConfig,
  resolveOutput,
  TEST_LABELS,
} from './helpers';

let mocks: InstallMocksResult;

beforeEach(async () => {
  mocks = await installMocks('prod');
});

afterEach(() => {
  mocks.resources.length = 0;
});

describe('enableApis', () => {
  it('enables the required APIs and leaves them on at destroy', async () => {
    enableApis(makeConfig());
    await flushResources();

    const services = mocks.byType('gcp:projects/service:Service');
    expect(services.map((s) => s.inputs.service)).toEqual([...REQUIRED_APIS]);
    for (const service of services) {
      expect(service.inputs.disableOnDestroy).toBe(false);
    }
  });

  it('adds the Budgets API only when a budget is configured', async () => {
    enableApis(
      makeConfig({
        budget: { billingAccountId: '012345-6789AB-CDEF01', amount: 1, currency: 'USD' },
      }),
    );
    await flushResources();

    const services = mocks.byType('gcp:projects/service:Service').map((s) => s.inputs.service);
    expect(services).toContain(BUDGET_API);
  });
});

describe('buildRegistry', () => {
  it('creates a Docker repository that keeps only the newest images', async () => {
    const registry = buildRegistry(makeConfig({ keepImageCount: 2 }), TEST_LABELS, []);
    await flushResources();

    const repository = mocks.oneOfType('gcp:artifactregistry/repository:Repository');
    expect(repository.inputs).toMatchObject({
      location: 'europe-west1',
      repositoryId: 'fortressauth',
      format: 'DOCKER',
      cleanupPolicyDryRun: false,
    });
    expect(repository.inputs.cleanupPolicies).toEqual([
      expect.objectContaining({ action: 'KEEP', mostRecentVersions: { keepCount: 2 } }),
      expect.objectContaining({ action: 'DELETE', condition: expect.anything() }),
    ]);
    expect(await resolveOutput(registry.imageName)).toBe(
      'europe-west1-docker.pkg.dev/fortressauth-test/fortressauth/server',
    );
  });
});

describe('buildDomains', () => {
  async function build(appDomains: string[]) {
    const config = makeConfig({ appDomains });
    const api = buildService(config, buildRuntime(config, TEST_LABELS, []), TEST_LABELS, []);
    const domains = buildDomains(config, api);
    await flushResources();
    return domains;
  }

  it('maps each domain to the service and reports its DNS records', async () => {
    const domains = await build(['gcp-api.fortressauth.com']);

    const mapping = mocks.oneOfType('gcp:cloudrun/domainMapping:DomainMapping');
    expect(mapping.inputs).toMatchObject({
      name: 'gcp-api.fortressauth.com',
      location: 'europe-west1',
      metadata: { namespace: 'fortressauth-test' },
      spec: { routeName: 'fortressauth-api' },
    });
    expect(await resolveOutput(domains.dnsRecords)).toEqual([
      {
        domain: 'gcp-api.fortressauth.com',
        name: 'gcp-api',
        type: 'CNAME',
        value: 'ghs.googlehosted.com.',
      },
    ]);
  });

  it('maps nothing when no domains are configured', async () => {
    const domains = await build([]);

    expect(mocks.byType('gcp:cloudrun/domainMapping:DomainMapping')).toHaveLength(0);
    expect(await resolveOutput(domains.dnsRecords)).toEqual([]);
  });
});

describe('buildBudget', () => {
  it('creates nothing without a billing account', async () => {
    expect(buildBudget(makeConfig(), MOCK_PROJECT_NUMBER, [])).toBeUndefined();
    await flushResources();
    expect(mocks.byType('gcp:billing/budget:Budget')).toHaveLength(0);
  });

  it('alerts on this project spending before credits are applied', async () => {
    buildBudget(
      makeConfig({
        budget: { billingAccountId: '012345-6789AB-CDEF01', amount: 1, currency: 'GBP' },
      }),
      MOCK_PROJECT_NUMBER,
      [],
    );
    await flushResources();

    const budget = mocks.oneOfType('gcp:billing/budget:Budget');
    expect(budget.inputs).toMatchObject({
      billingAccount: '012345-6789AB-CDEF01',
      budgetFilter: {
        projects: [`projects/${MOCK_PROJECT_NUMBER}`],
        creditTypesTreatment: 'EXCLUDE_ALL_CREDITS',
      },
      amount: { specifiedAmount: { currencyCode: 'GBP', units: '1' } },
    });
    expect(budget.inputs.thresholdRules).toContainEqual({
      thresholdPercent: 1,
      spendBasis: 'FORECASTED_SPEND',
    });

    const provider = mocks.oneOfType('pulumi:providers:gcp');
    expect(provider.inputs).toMatchObject({
      userProjectOverride: 'true',
      billingProject: 'fortressauth-test',
    });
  });
});
