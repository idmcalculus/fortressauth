import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildNetwork } from '../network';
import {
  flushResources,
  type InstallMocksResult,
  installMocks,
  makeConfig,
  TEST_TAGS,
} from './helpers';

describe('buildNetwork', () => {
  let mocks: InstallMocksResult;

  beforeEach(async () => {
    mocks = await installMocks('dev');
  });

  afterEach(() => {
    mocks.resources.length = 0;
  });

  it('creates a VPC with the configured CIDR and AZ count and no NAT gateways', async () => {
    buildNetwork(makeConfig({ vpcCidr: '10.42.0.0/16', availabilityZones: 3 }), TEST_TAGS);
    await flushResources();

    const vpc = mocks.oneOfType('awsx:ec2:Vpc');
    expect(vpc.inputs.cidrBlock).toBe('10.42.0.0/16');
    expect(vpc.inputs.numberOfAvailabilityZones).toBe(3);
    expect(vpc.inputs.natGateways).toEqual({ strategy: 'None' });
    expect(vpc.inputs.enableDnsHostnames).toBe(true);
    expect(vpc.inputs.enableDnsSupport).toBe(true);
    expect(vpc.inputs.subnetSpecs).toEqual([
      { type: 'Public', cidrMask: 24, name: 'public' },
      { type: 'Private', cidrMask: 24, name: 'private' },
    ]);
  });

  describe('ALB security group', () => {
    it('allows 443/tcp from anywhere (IPv4 + IPv6)', async () => {
      buildNetwork(makeConfig(), TEST_TAGS);
      await flushResources();

      const albSg = mocks.byName('fortressauth-dev-alb-sg');
      expect(albSg).toBeDefined();
      const httpsRule = albSg?.inputs.ingress.find((r: { fromPort: number }) => r.fromPort === 443);
      expect(httpsRule).toMatchObject({
        protocol: 'tcp',
        toPort: 443,
        cidrBlocks: ['0.0.0.0/0'],
        ipv6CidrBlocks: ['::/0'],
      });
    });

    it('allows 80/tcp from anywhere for HTTP-01 / HTTP→HTTPS redirect', async () => {
      buildNetwork(makeConfig(), TEST_TAGS);
      await flushResources();

      const albSg = mocks.byName('fortressauth-dev-alb-sg');
      const httpRule = albSg?.inputs.ingress.find((r: { fromPort: number }) => r.fromPort === 80);
      expect(httpRule).toMatchObject({
        protocol: 'tcp',
        toPort: 80,
        cidrBlocks: ['0.0.0.0/0'],
      });
    });

    it('allows unrestricted egress', async () => {
      buildNetwork(makeConfig(), TEST_TAGS);
      await flushResources();

      const albSg = mocks.byName('fortressauth-dev-alb-sg');
      expect(albSg?.inputs.egress).toHaveLength(1);
      expect(albSg?.inputs.egress[0]).toMatchObject({
        protocol: '-1',
        cidrBlocks: ['0.0.0.0/0'],
      });
    });
  });

  describe('Service security group', () => {
    it('allows traffic only from the ALB SG on the configured container port', async () => {
      buildNetwork(makeConfig({ containerPort: 8080 }), TEST_TAGS);
      await flushResources();

      const svcSg = mocks.byName('fortressauth-dev-svc-sg');
      expect(svcSg).toBeDefined();
      expect(svcSg?.inputs.ingress).toHaveLength(1);
      expect(svcSg?.inputs.ingress[0]).toMatchObject({
        fromPort: 8080,
        toPort: 8080,
        protocol: 'tcp',
      });
      // Service SG must NOT pin a CIDR; the only allowed source is the ALB SG.
      expect(svcSg?.inputs.ingress[0].cidrBlocks).toBeUndefined();
    });
  });

  describe('Database security group', () => {
    it('exposes only PostgreSQL (5432) ingress from the service SG', async () => {
      buildNetwork(makeConfig(), TEST_TAGS);
      await flushResources();

      const dbSg = mocks.byName('fortressauth-dev-db-sg');
      expect(dbSg).toBeDefined();
      expect(dbSg?.inputs.ingress).toHaveLength(1);
      expect(dbSg?.inputs.ingress[0]).toMatchObject({
        protocol: 'tcp',
        fromPort: 5432,
        toPort: 5432,
      });
    });

    it('has no egress rules (RDS does not need outbound internet)', async () => {
      buildNetwork(makeConfig(), TEST_TAGS);
      await flushResources();

      const dbSg = mocks.byName('fortressauth-dev-db-sg');
      expect(dbSg?.inputs.egress).toEqual([]);
    });
  });

  it('returns publicSubnetIds and privateSubnetIds from the VPC component', () => {
    const result = buildNetwork(makeConfig(), TEST_TAGS);
    // The shape is enough; downstream tests cover wiring into containers.
    expect(result.publicSubnetIds).toBeDefined();
    expect(result.privateSubnetIds).toBeDefined();
  });

  it('tags every security group with the standard set plus a Component label', async () => {
    buildNetwork(makeConfig(), TEST_TAGS);
    await flushResources();

    const sgs = mocks.byType('aws:ec2/securityGroup:SecurityGroup');
    expect(sgs).toHaveLength(3);
    for (const sg of sgs) {
      expect(sg.inputs.tags).toMatchObject({
        ManagedBy: 'pulumi',
        Project: 'fortressauth',
        Stack: 'dev',
      });
      expect(sg.inputs.tags.Component).toBeOneOf(['alb', 'service', 'database']);
    }
  });
});
