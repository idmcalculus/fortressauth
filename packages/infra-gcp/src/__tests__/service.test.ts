import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FIXED_ENV } from '../config';
import { buildRuntime } from '../secrets';
import { buildService } from '../service';
import {
  flushResources,
  type InstallMocksResult,
  installMocks,
  MOCK_SERVICE_URI,
  makeConfig,
  resolveOutput,
  TEST_LABELS,
} from './helpers';

interface EnvVar {
  name: string;
  value?: string;
  valueSource?: { secretKeyRef: { secret: string; version: string } };
}

describe('buildService', () => {
  let mocks: InstallMocksResult;

  beforeEach(async () => {
    mocks = await installMocks('prod');
  });

  afterEach(() => {
    mocks.resources.length = 0;
  });

  async function build(overrides = {}) {
    const config = makeConfig(overrides);
    const runtime = buildRuntime(config, TEST_LABELS, []);
    const api = buildService(config, runtime, TEST_LABELS, []);
    await flushResources();
    return { api, service: mocks.oneOfType('gcp:cloudrunv2/service:Service') };
  }

  it('scales to zero and caps instances, so idle time costs nothing', async () => {
    const { service } = await build({ maxInstances: 1 });

    expect(service.inputs.template.scaling).toEqual({ minInstanceCount: 0, maxInstanceCount: 1 });
    const [container] = service.inputs.template.containers;
    expect(container.resources).toEqual({
      cpuIdle: true,
      limits: { cpu: '1', memory: '512Mi' },
    });
  });

  it('serves the configured port, region and name, with deletion protection', async () => {
    const { service } = await build({ containerPort: 3000, deletionProtection: true });

    expect(service.inputs).toMatchObject({
      name: 'fortressauth-api',
      location: 'europe-west1',
      project: 'fortressauth-test',
      ingress: 'INGRESS_TRAFFIC_ALL',
      deletionProtection: true,
    });
    expect(service.inputs.template.containers[0].ports).toEqual({ containerPort: 3000 });
  });

  it('starts on the placeholder image until the deploy workflow replaces it', async () => {
    const { service } = await build();
    expect(service.inputs.template.containers[0].image).toBe(
      'us-docker.pkg.dev/cloudrun/container/hello',
    );
  });

  it('runs as the runtime service account', async () => {
    const { service } = await build();
    expect(service.inputs.template.serviceAccount).toBe(
      'fortressauth-api-run@fortressauth-test.iam.gserviceaccount.com',
    );
  });

  it('sets the fixed env and the app env as plain values', async () => {
    const { service } = await build();
    const envs: EnvVar[] = service.inputs.template.containers[0].envs;
    const plain = Object.fromEntries(
      envs.filter((env) => env.value !== undefined).map((env) => [env.name, env.value]),
    );

    expect(plain).toEqual({
      ...FIXED_ENV,
      TRUSTED_PROXY_HOP_COUNT: '1',
      BASE_URL: 'https://fortressauth.com',
      EMAIL_PROVIDER: 'resend',
    });
  });

  it('passes trustedProxyHopCount to the server', async () => {
    const { service } = await build({ trustedProxyHopCount: 2 });
    const envs: EnvVar[] = service.inputs.template.containers[0].envs;
    expect(envs).toContainEqual({ name: 'TRUSTED_PROXY_HOP_COUNT', value: '2' });
  });

  it('reads secret env from Secret Manager, pinned to the managed version', async () => {
    const { service } = await build();
    const envs: EnvVar[] = service.inputs.template.containers[0].envs;
    const secrets = envs.filter((env) => env.valueSource !== undefined);

    expect(secrets).toEqual([
      {
        name: 'DATABASE_URL',
        valueSource: { secretKeyRef: { secret: 'fortressauth-api-database-url', version: '1' } },
      },
      {
        name: 'RESEND_API_KEY',
        valueSource: { secretKeyRef: { secret: 'fortressauth-api-resend-api-key', version: '1' } },
      },
    ]);
    // No secret value ever lands in the service definition.
    expect(JSON.stringify(service.inputs)).not.toContain('re_test');
  });

  it('lets anyone invoke it, since it is a public API', async () => {
    await build();
    const invoker = mocks.oneOfType('gcp:cloudrunv2/serviceIamMember:ServiceIamMember');
    expect(invoker.inputs).toMatchObject({
      name: 'fortressauth-api',
      location: 'europe-west1',
      role: 'roles/run.invoker',
      member: 'allUsers',
    });
  });

  it('exposes the run.app URL', async () => {
    const { api } = await build();
    expect(await resolveOutput(api.service.uri)).toBe(MOCK_SERVICE_URI);
  });
});
