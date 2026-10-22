import * as pulumi from '@pulumi/pulumi';

import type { ResolvedConfig } from '../config';

const PROJECT = 'fortressauth-oracle';

export const MOCK_NAMESPACE = 'mocknamespace';
/** Matches makeConfig()'s region, so the home-region check passes by default. */
export const MOCK_HOME_REGION = 'uk-london-1';
export const MOCK_PUBLIC_IP = '203.0.113.10';
export const MOCK_AVAILABILITY_DOMAINS = [
  'Abcd:UK-LONDON-1-AD-1',
  'Abcd:UK-LONDON-1-AD-2',
  'Abcd:UK-LONDON-1-AD-3',
];
export const MOCK_IMAGES = [
  'ocid1.image.oc1.uk-london-1.newest',
  'ocid1.image.oc1.uk-london-1.older',
];

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

export interface CapturedCall {
  token: string;
  // biome-ignore lint/suspicious/noExplicitAny: pulumi call inputs are dynamic
  inputs: any;
}

export interface MockOptions {
  /** Availability domain names returned by getAvailabilityDomains. */
  availabilityDomains?: string[];
  /** Image OCIDs returned by getImages, newest first. */
  images?: string[];
}

export interface InstallMocksResult {
  /** All resources registered during the test, in registration order. */
  resources: CapturedResource[];
  /** All provider function calls made during the test. */
  calls: CapturedCall[];
  /** Find all resources of a Pulumi type token. */
  byType(type: string): CapturedResource[];
  /** Find one resource of a type token, throwing when missing or ambiguous. */
  oneOfType(type: string): CapturedResource;
  /** Find a resource by exact name. */
  byName(name: string): CapturedResource | undefined;
}

/**
 * Installs Pulumi runtime mocks that record every resource construction and
 * provider call, and return predictable state so downstream code can read
 * outputs (instance public IP, PAR access URI, and so on).
 */
export async function installMocks(
  stack: string,
  options: MockOptions = {},
): Promise<InstallMocksResult> {
  const resources: CapturedResource[] = [];
  const calls: CapturedCall[] = [];
  const availabilityDomains = options.availabilityDomains ?? MOCK_AVAILABILITY_DOMAINS;
  const images = options.images ?? MOCK_IMAGES;

  await pulumi.runtime.setMocks(
    {
      newResource: (args) => {
        resources.push({ type: args.type, name: args.name, inputs: args.inputs });

        const id = `ocid1.mock.${args.name}`;
        const state: Record<string, unknown> = { ...args.inputs, id };

        if (args.type === 'oci:Core/instance:Instance') {
          state.publicIp = MOCK_PUBLIC_IP;
        }
        if (args.type === 'oci:ObjectStorage/preauthrequest:Preauthrequest') {
          state.accessUri = `/p/mock-token/n/${args.inputs.namespace}/b/${args.inputs.bucket}/o/`;
        }

        return { id, state };
      },
      call: (args) => {
        calls.push({ token: args.token, inputs: args.inputs });

        if (args.token === 'oci:Identity/getAvailabilityDomains:getAvailabilityDomains') {
          return {
            compartmentId: args.inputs.compartmentId,
            id: 'mock-availability-domains',
            availabilityDomains: availabilityDomains.map((name) => ({
              compartmentId: args.inputs.compartmentId,
              id: `ocid1.availabilitydomain.${name}`,
              name,
            })),
          };
        }
        if (args.token === 'oci:Identity/getRegionSubscriptions:getRegionSubscriptions') {
          return {
            id: 'mock-region-subscriptions',
            tenancyId: args.inputs.tenancyId,
            regionSubscriptions: [
              { regionName: 'us-ashburn-1', regionKey: 'IAD', isHomeRegion: false },
              { regionName: MOCK_HOME_REGION, regionKey: 'LHR', isHomeRegion: true },
            ].map((subscription) => ({
              ...subscription,
              state: 'READY',
              tenancyId: args.inputs.tenancyId,
            })),
          };
        }
        if (args.token === 'oci:Core/getImages:getImages') {
          return {
            ...args.inputs,
            id: 'mock-images',
            images: images.map((imageId) => ({ id: imageId })),
          };
        }
        if (args.token === 'oci:ObjectStorage/getNamespace:getNamespace') {
          return { id: 'mock-namespace', namespace: MOCK_NAMESPACE };
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
    calls,
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

/**
 * Resolves a `pulumi.Output<T>` to a concrete value in tests.
 */
export function resolveOutput<T>(output: pulumi.Output<T>): Promise<T> {
  return new Promise<T>((resolve) => {
    output.apply((value) => {
      resolve(value);
      return value;
    });
  });
}

/**
 * Awaits all pending Pulumi resource registrations. Resource constructors
 * return at once, but the `newResource` mock runs a few microtask hops
 * later; eight event-loop turns drain the graphs these tests build.
 */
export async function flushResources(): Promise<void> {
  for (let i = 0; i < 8; i++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

export const TEST_ADMIN_KEY = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAdminKeyForTests admin@laptop';
export const TEST_DEPLOY_KEY =
  'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDeployKeyForTests fortressauth-deploy';

/**
 * Builds a fully-populated ResolvedConfig with test defaults. Tests pass an
 * overrides object to change any field for the case they exercise.
 */
export function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  const base: ResolvedConfig = {
    stack: 'prod',
    namePrefix: 'fortressauth-prod',
    region: 'uk-london-1',
    tenancyOcid: 'ocid1.tenancy.oc1..aaaatenancy',
    compartmentOcid: 'ocid1.tenancy.oc1..aaaatenancy',
    availabilityDomainIndex: 0,
    ocpus: 2,
    memoryGb: 12,
    bootVolumeGb: 50,
    imageOcid: undefined,
    adminSshPublicKey: TEST_ADMIN_KEY,
    deploySshPublicKey: TEST_DEPLOY_KEY,
    protectInstance: true,
    vcnCidr: '10.50.0.0/16',
    subnetCidr: '10.50.0.0/24',
    sshSourceCidr: '0.0.0.0/0',
    backupUploadExpires: '2099-01-01T00:00:00Z',
  };
  return { ...base, ...overrides };
}

export const TEST_TAGS = Object.freeze({
  ManagedBy: 'pulumi',
  Project: 'fortressauth',
  Stack: 'prod',
});
