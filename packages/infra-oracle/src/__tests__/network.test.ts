import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildNetwork } from '../network';
import {
  flushResources,
  type InstallMocksResult,
  installMocks,
  makeConfig,
  TEST_TAGS,
} from './helpers';

interface IngressRule {
  protocol: string;
  source: string;
  tcpOptions?: { min: number; max: number };
  udpOptions?: { min: number; max: number };
  icmpOptions?: { type: number; code: number };
}

describe('buildNetwork', () => {
  let mocks: InstallMocksResult;

  beforeEach(async () => {
    mocks = await installMocks('prod');
  });

  afterEach(() => {
    mocks.resources.length = 0;
  });

  it('creates a VCN with the configured CIDR, a DNS label and tags', async () => {
    buildNetwork(makeConfig({ vcnCidr: '10.70.0.0/16' }), TEST_TAGS);
    await flushResources();

    const vcn = mocks.oneOfType('oci:Core/vcn:Vcn');
    expect(vcn.inputs.cidrBlocks).toEqual(['10.70.0.0/16']);
    expect(vcn.inputs.compartmentId).toBe('ocid1.tenancy.oc1..aaaatenancy');
    expect(vcn.inputs.dnsLabel).toBe('fortressauth');
    expect(vcn.inputs.freeformTags).toEqual(TEST_TAGS);
  });

  it('routes all traffic through an enabled internet gateway', async () => {
    buildNetwork(makeConfig(), TEST_TAGS);
    await flushResources();

    const igw = mocks.oneOfType('oci:Core/internetGateway:InternetGateway');
    expect(igw.inputs.enabled).toBe(true);
    expect(igw.inputs.vcnId).toBe('ocid1.mock.fortressauth-prod-vcn');

    const routeTable = mocks.oneOfType('oci:Core/routeTable:RouteTable');
    expect(routeTable.inputs.routeRules).toEqual([
      expect.objectContaining({
        destination: '0.0.0.0/0',
        destinationType: 'CIDR_BLOCK',
        networkEntityId: 'ocid1.mock.fortressauth-prod-igw',
      }),
    ]);
  });

  describe('security list', () => {
    async function ingressRules(sshSourceCidr = '0.0.0.0/0'): Promise<IngressRule[]> {
      buildNetwork(makeConfig({ sshSourceCidr }), TEST_TAGS);
      await flushResources();
      return mocks.oneOfType('oci:Core/securityList:SecurityList').inputs.ingressSecurityRules;
    }

    it('opens TCP 80 and 443 and UDP 443 to everyone', async () => {
      const rules = await ingressRules();
      for (const port of [80, 443]) {
        expect(rules).toContainEqual(
          expect.objectContaining({
            protocol: '6',
            source: '0.0.0.0/0',
            tcpOptions: { min: port, max: port },
          }),
        );
      }
      expect(rules).toContainEqual(
        expect.objectContaining({
          protocol: '17',
          source: '0.0.0.0/0',
          udpOptions: { min: 443, max: 443 },
        }),
      );
    });

    it('limits SSH to the configured source CIDR', async () => {
      const rules = await ingressRules('198.51.100.7/32');
      const ssh = rules.filter((rule) => rule.tcpOptions?.min === 22);
      expect(ssh).toEqual([expect.objectContaining({ protocol: '6', source: '198.51.100.7/32' })]);
    });

    it('allows ICMP fragmentation-needed for path MTU discovery', async () => {
      const rules = await ingressRules();
      expect(rules).toContainEqual(
        expect.objectContaining({ protocol: '1', icmpOptions: { type: 3, code: 4 } }),
      );
    });

    it('opens nothing else: no PostgreSQL or app port', async () => {
      const rules = await ingressRules();
      const tcpPorts = rules
        .filter((rule) => rule.protocol === '6')
        .map((rule) => rule.tcpOptions?.min);
      expect(tcpPorts.sort()).toEqual([22, 443, 80].sort());
      expect(rules).toHaveLength(5);
    });

    it('allows all egress', async () => {
      buildNetwork(makeConfig(), TEST_TAGS);
      await flushResources();
      const sl = mocks.oneOfType('oci:Core/securityList:SecurityList');
      expect(sl.inputs.egressSecurityRules).toEqual([
        expect.objectContaining({ protocol: 'all', destination: '0.0.0.0/0' }),
      ]);
    });
  });

  it('creates one public subnet wired to the route table and security list', async () => {
    buildNetwork(makeConfig({ subnetCidr: '10.50.9.0/24' }), TEST_TAGS);
    await flushResources();

    const subnet = mocks.oneOfType('oci:Core/subnet:Subnet');
    expect(subnet.inputs.cidrBlock).toBe('10.50.9.0/24');
    expect(subnet.inputs.prohibitPublicIpOnVnic).toBe(false);
    expect(subnet.inputs.routeTableId).toBe('ocid1.mock.fortressauth-prod-public-rt');
    expect(subnet.inputs.securityListIds).toEqual(['ocid1.mock.fortressauth-prod-public-sl']);
    expect(subnet.inputs.dnsLabel).toBe('public');
  });
});
