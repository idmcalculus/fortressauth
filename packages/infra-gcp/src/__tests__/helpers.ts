import * as pulumi from '@pulumi/pulumi';

import type { ResolvedConfig } from '../config';

const PROJECT = 'fortressauth-gcp';

export const MOCK_PROJECT_NUMBER = '123456789012';
export const MOCK_SERVICE_URI = 'https://fortressauth-api-abc123-ew.a.run.app';

/**
 * The captured registration record for a Pulumi resource. `MockResourceArgs`
 * uses `inputs: any` upstream so we mirror that here, but tests should narrow
 * via `.find` lookups before asserting on shape.
 */
export interface CapturedResource {
  type: string;
  name: string;
  // biome-ignore lint/suspicious/noExplicitAny: pulumi inputs are dynamic
  inputs: any;
}

export interface InstallMocksResult {
  /** All resources registered during the test, in registration order. */
  resources: CapturedResource[];
  /** Find all resources of a Pulumi type token. */
  byType(type: string): CapturedResource[];
  /** Find one resource of a type token, throwing when missing or ambiguous. */
  oneOfType(type: string): CapturedResource;
  /** Find a resource by exact name. */
  byName(name: string): CapturedResource | undefined;
}

/**
 * Installs Pulumi runtime mocks that record every resource construction and
 * return the state GCP would fill in (service-account emails, the Cloud Run
 * URI, domain-mapping DNS records), so downstream code can read outputs.
 */
export async function installMocks(stack: string): Promise<InstallMocksResult> {
  const resources: CapturedResource[] = [];

  await pulumi.runtime.setMocks(
    {
      newResource: (args) => {
        resources.push({ type: args.type, name: args.name, inputs: args.inputs });

        const id = `${args.name}_id`;
        const state: Record<string, unknown> = { ...args.inputs, id };

        if (args.type === 'gcp:serviceaccount/account:Account') {
          const email = `${args.inputs.accountId}@${args.inputs.project}.iam.gserviceaccount.com`;
          state.email = email;
          state.name = `projects/${args.inputs.project}/serviceAccounts/${email}`;
          state.member = `serviceAccount:${email}`;
        }
        if (args.type === 'gcp:secretmanager/secret:Secret') {
          state.id = `projects/${args.inputs.project}/secrets/${args.inputs.secretId}`;
        }
        if (args.type === 'gcp:secretmanager/secretVersion:SecretVersion') {
          state.version = '1';
        }
        if (args.type === 'gcp:artifactregistry/repository:Repository') {
          state.name = args.inputs.repositoryId;
        }
        if (args.type === 'gcp:cloudrunv2/service:Service') {
          state.uri = MOCK_SERVICE_URI;
        }
        if (args.type === 'gcp:cloudrun/domainMapping:DomainMapping') {
          state.statuses = [
            {
              resourceRecords: [
                {
                  name: args.inputs.name.split('.')[0],
                  type: 'CNAME',
                  rrdata: 'ghs.googlehosted.com.',
                },
              ],
            },
          ];
        }
        if (args.type === 'gcp:iam/workloadIdentityPool:WorkloadIdentityPool') {
          state.name = `projects/${MOCK_PROJECT_NUMBER}/locations/global/workloadIdentityPools/${args.inputs.workloadIdentityPoolId}`;
        }
        if (args.type === 'gcp:iam/workloadIdentityPoolProvider:WorkloadIdentityPoolProvider') {
          state.name = `projects/${MOCK_PROJECT_NUMBER}/locations/global/workloadIdentityPools/${args.inputs.workloadIdentityPoolId}/providers/${args.inputs.workloadIdentityPoolProviderId}`;
        }

        return { id, state };
      },
      call: (args) => {
        if (args.token === 'gcp:organizations/getProject:getProject') {
          return { ...args.inputs, number: MOCK_PROJECT_NUMBER };
        }
        return args.inputs;
      },
    },
    PROJECT,
    stack,
    /* preview */ false,
  );

  return {
    resources,
    byType: (type: string) => resources.filter((r) => r.type === type),
    oneOfType(type: string) {
      const matches = resources.filter((r) => r.type === type);
      if (matches.length !== 1) {
        throw new Error(`Expected one ${type} resource, found ${matches.length}`);
      }
      return matches[0] as CapturedResource;
    },
    byName: (name) => resources.find((r) => r.name === name),
  };
}

/** Resolves a `pulumi.Output<T>` to a concrete value in tests. */
export function resolveOutput<T>(output: pulumi.Output<T>): Promise<T> {
  return new Promise<T>((resolve) => {
    output.apply((value) => {
      resolve(value);
      return value;
    });
  });
}

/**
 * Awaits pending Pulumi resource registrations: constructors return at once,
 * but the `newResource` mock runs a few microtask hops later.
 */
export async function flushResources(): Promise<void> {
  for (let i = 0; i < 8; i++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

/** A fully populated ResolvedConfig with test defaults; override any field. */
export function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  const base: ResolvedConfig = {
    stack: 'prod',
    namePrefix: 'fortressauth-prod',
    project: 'fortressauth-test',
    region: 'europe-west1',
    serviceName: 'fortressauth-api',
    initialImage: 'us-docker.pkg.dev/cloudrun/container/hello',
    containerPort: 3000,
    cpu: '1',
    memory: '512Mi',
    maxInstances: 1,
    trustedProxyHopCount: 1,
    appDomains: [],
    appEnv: { BASE_URL: 'https://fortressauth.com', EMAIL_PROVIDER: 'resend' },
    secretEnvKeys: ['DATABASE_URL', 'RESEND_API_KEY'],
    secretEnv: pulumi.secret({
      DATABASE_URL: 'postgresql://user:pw@neon.example/db?sslmode=require',
      RESEND_API_KEY: 're_test',
    }),
    deletionProtection: true,
    repositoryId: 'fortressauth',
    keepImageCount: 2,
    githubRepository: 'idmcalculus/fortressauth',
    githubEnvironment: 'cloudrun-prod',
    budget: undefined,
  };
  return { ...base, ...overrides };
}

export const TEST_LABELS = Object.freeze({
  managed_by: 'pulumi',
  project: 'fortressauth',
  stack: 'prod',
});
