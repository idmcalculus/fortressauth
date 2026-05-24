import * as pulumi from '@pulumi/pulumi';

import type { ResolvedConfig } from '../config';

const PROJECT = 'fortressauth-aws';

/**
 * The captured registration record for a Pulumi resource. `MockResourceArgs`
 * uses `inputs: any` upstream so we mirror that here, but tests should narrow
 * via type guards or `.find` lookups before asserting on shape.
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
 * return predictable IDs/state so downstream code can read outputs. Returns
 * a handle that tests use to assert on the resources that were registered.
 *
 * The mock implementation deliberately echoes inputs as state for properties
 * the AWS provider would normally fill in (arn, id, name) so that tests
 * can chain pulumi.Output values without needing a real engine.
 */
export async function installMocks(stack: string): Promise<InstallMocksResult> {
  const resources: CapturedResource[] = [];

  await pulumi.runtime.setMocks(
    {
      newResource: (args) => {
        resources.push({ type: args.type, name: args.name, inputs: args.inputs });

        // Synthesize plausible outputs so downstream apply() chains do not
        // explode. Most providers return an `arn`, `id`, and echo the name.
        const id = `${args.name}_id`;
        const arn = `arn:aws:mock:${args.type.replace(/[^a-z0-9]/gi, '_')}:${args.name}`;

        const baseState: Record<string, unknown> = {
          ...args.inputs,
          id,
          arn,
        };

        // Type-specific synthesizations: VPCs need subnet IDs that downstream
        // resources reference.
        if (args.type === 'awsx:ec2:Vpc') {
          baseState.vpcId = `vpc-${args.name}`;
          baseState.publicSubnetIds = [`subnet-${args.name}-pub-a`, `subnet-${args.name}-pub-b`];
          baseState.privateSubnetIds = [`subnet-${args.name}-prv-a`, `subnet-${args.name}-prv-b`];
        }
        if (args.type === 'aws:ec2/securityGroup:SecurityGroup') {
          baseState.id = `sg-${args.name}`;
        }
        if (args.type === 'aws:rds/instance:Instance') {
          baseState.address = `${args.inputs.identifier}.cluster-mock.eu-west-1.rds.amazonaws.com`;
          baseState.endpoint = `${baseState.address}:5432`;
        }
        if (args.type === 'aws:lb/loadBalancer:LoadBalancer') {
          baseState.dnsName = `${args.name}-mock.elb.eu-west-1.amazonaws.com`;
          baseState.zoneId = 'Z3MOCKZONEID';
        }
        if (args.type === 'aws:ecs/cluster:Cluster') {
          baseState.name = args.inputs.name ?? args.name;
        }
        if (args.type === 'aws:route53/zone:Zone') {
          baseState.zoneId = `Z${args.name.toUpperCase().replace(/[^A-Z0-9]/g, '')}`;
          baseState.nameServers = [
            'ns-1.awsdns-00.com',
            'ns-2.awsdns-00.net',
            'ns-3.awsdns-00.org',
            'ns-4.awsdns-00.co.uk',
          ];
        }
        if (args.type === 'aws:acm/certificate:Certificate') {
          baseState.domainValidationOptions = [
            {
              domainName: args.inputs.domainName,
              resourceRecordName: `_validation.${args.inputs.domainName}.`,
              resourceRecordType: 'CNAME',
              resourceRecordValue: `_validation-target.${args.name}.acm-validations.aws.`,
            },
          ];
        }
        if (args.type === 'aws:secretsmanager/secret:Secret') {
          baseState.id = arn;
        }
        if (args.type === 'aws:sesv2/configurationSet:ConfigurationSet') {
          baseState.configurationSetName = args.inputs.configurationSetName;
        }
        if (args.type === 'random:index/randomPassword:RandomPassword') {
          baseState.result = `random-${args.name}`;
        }
        if (args.type === 'aws:iam/role:Role') {
          baseState.name = args.inputs.name ?? args.name;
        }
        if (args.type === 'aws:cloudwatch/logGroup:LogGroup') {
          baseState.name = args.inputs.name ?? args.name;
        }
        if (args.type === 'aws:ecr/repository:Repository') {
          baseState.repositoryUrl = `123456789012.dkr.ecr.eu-west-1.amazonaws.com/${args.inputs.name}`;
          baseState.name = args.inputs.name ?? args.name;
        }

        return { id, state: baseState };
      },
      call: (args) => {
        // Mock provider-implemented function calls (e.g. getCallerIdentity,
        // getRegion). Returning the input bag is sufficient for most calls;
        // we override on a per-token basis below.
        if (args.token === 'aws:index/getCallerIdentity:getCallerIdentity') {
          return {
            accountId: '123456789012',
            arn: 'arn:aws:iam::123456789012:user/mock',
            userId: 'AIDAMOCK',
          };
        }
        if (args.token === 'aws:index/getRegion:getRegion') {
          return { id: 'eu-west-1', name: 'eu-west-1', description: 'EU (Ireland)' };
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
      if (matches.length === 0) {
        throw new Error(`No resource registered for type "${type}"`);
      }
      if (matches.length > 1) {
        throw new Error(`Expected one ${type} resource, found ${matches.length}`);
      }
      const [first] = matches;
      if (!first) {
        throw new Error(`No resource registered for type "${type}"`);
      }
      return first;
    },
    byName: (name) => resources.find((r) => r.name === name),
  };
}

/**
 * Resolves a `pulumi.Output<T>` to a concrete value in tests. Pulumi's
 * `apply` returns an Output, not a promise; this helper hides the
 * promiseification dance behind `.apply((v) => v)` so tests stay readable.
 */
export function resolveOutput<T>(output: pulumi.Output<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    output.apply((value) => {
      try {
        resolve(value);
      } catch (err) {
        reject(err);
      }
      return value;
    });
  });
}

/**
 * Awaits all pending Pulumi resource registrations. Pulumi's resource
 * constructors are synchronous from the caller's perspective but the
 * `newResource` mock callback runs on the next microtask. This helper
 * advances the event loop enough times to drain typical resource graphs.
 *
 * The number of ticks (8) was chosen empirically: each Pulumi resource
 * registration goes through `getMonitor` → `registerResource` →
 * `prepareResource` → callback, which spans 2-3 microtask hops. Doubling
 * that for downstream `apply()` chains gives us comfortable headroom.
 */
export async function flushResources(): Promise<void> {
  for (let i = 0; i < 8; i++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

/**
 * Builds a fully-populated ResolvedConfig with sensible test defaults.
 * Tests pass an overrides object to mutate any field for the scenario they
 * are exercising. The shape mirrors the production defaults so anything
 * not overridden behaves like a `pulumi up` against a dev stack.
 */
export function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  const base: ResolvedConfig = {
    stack: 'dev',
    namePrefix: 'fortressauth-dev',
    appDomain: 'api.example.com',
    hostedZoneName: 'api.example.com',
    frontendBaseUrl: 'https://api.example.com',
    cookieSameSite: 'lax',
    csrfCookieSameSite: 'lax',
    appImage: '123456789012.dkr.ecr.eu-west-1.amazonaws.com/fortressauth/server:test',
    taskCpu: 256,
    taskMemoryMib: 512,
    desiredCount: 1,
    containerPort: 3000,
    logRetentionDays: 30,
    dbName: 'fortressauth',
    dbUser: 'fortressauth',
    dbInstanceClass: 'db.t4g.micro',
    dbAllocatedStorageGb: 20,
    dbBackupRetentionDays: 7,
    dbMultiAz: false,
    dbDeletionProtection: false,
    dbSkipFinalSnapshot: true,
    dbPostgresVersion: '17.10',
    sesIdentityDomain: 'example.com',
    sesFromAddress: 'noreply@example.com',
    sesFromName: 'FortressAuth',
    sesReplyToAddress: 'noreply@example.com',
    sesConfigurationSetName: 'fortressauth-dev-events',
    bounceNotificationEmail: 'ops@example.com',
    sesManageIdentity: false,
    vpcCidr: '10.30.0.0/16',
    availabilityZones: 2,
    bootstrap: true,
    expectedAccountId: undefined,
    appEnv: {},
    secretEnvKeys: [],
  };
  return { ...base, ...overrides };
}

export const TEST_TAGS = Object.freeze({
  ManagedBy: 'pulumi',
  Project: 'fortressauth',
  Stack: 'dev',
});
