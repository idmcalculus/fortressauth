import * as gcp from '@pulumi/gcp';
import type * as pulumi from '@pulumi/pulumi';

import { FIXED_ENV, PROXY_HOP_ENV_KEY, type ResolvedConfig } from './config';
import type { RuntimeResources } from './secrets';

export interface ServiceResources {
  readonly service: gcp.cloudrunv2.Service;
  readonly invoker: gcp.cloudrunv2.ServiceIamMember;
}

/**
 * The FortressAuth API on Cloud Run, sized to stay inside the free tier:
 *
 *   - It scales to zero (min 0) and runs at most `maxInstances` (default 1)
 *     instances, which also keeps the in-memory rate limiter consistent.
 *   - `cpuIdle` gives the instance CPU only while it serves a request
 *     (request-based billing), so idle time costs nothing.
 *
 * Pulumi owns the configuration; the Deploy Cloud Run workflow owns the
 * image. The image and gcloud's client fields are ignored here, so a
 * `pulumi up` never rolls back a deploy.
 */
export function buildService(
  config: ResolvedConfig,
  runtime: RuntimeResources,
  labels: Record<string, string>,
  dependsOn: pulumi.Resource[],
): ServiceResources {
  const plainEnv = Object.entries({
    ...config.appEnv,
    ...FIXED_ENV,
    [PROXY_HOP_ENV_KEY]: String(config.trustedProxyHopCount),
  })
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => ({ name, value }));

  const secretEnv = runtime.secretEnv.map((ref) => ({
    name: ref.name,
    valueSource: { secretKeyRef: { secret: ref.secretId, version: ref.version } },
  }));

  const service = new gcp.cloudrunv2.Service(
    `${config.namePrefix}-service`,
    {
      project: config.project,
      location: config.region,
      name: config.serviceName,
      ingress: 'INGRESS_TRAFFIC_ALL',
      deletionProtection: config.deletionProtection,
      labels,
      template: {
        serviceAccount: runtime.serviceAccount.email,
        scaling: { minInstanceCount: 0, maxInstanceCount: config.maxInstances },
        maxInstanceRequestConcurrency: 80,
        timeout: '60s',
        labels,
        containers: [
          {
            image: config.initialImage,
            ports: { containerPort: config.containerPort },
            resources: {
              cpuIdle: true,
              limits: { cpu: config.cpu, memory: config.memory },
            },
            envs: [...plainEnv, ...secretEnv],
          },
        ],
      },
    },
    {
      dependsOn: [...dependsOn, ...runtime.secretReaders],
      ignoreChanges: ['template.containers[0].image', 'client', 'clientVersion'],
    },
  );

  const invoker = new gcp.cloudrunv2.ServiceIamMember(`${config.namePrefix}-public-invoker`, {
    project: config.project,
    location: config.region,
    name: service.name,
    role: 'roles/run.invoker',
    member: 'allUsers',
  });

  return { service, invoker };
}
