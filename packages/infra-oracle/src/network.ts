import * as oci from '@pulumi/oci';

import type { ResolvedConfig } from './config';

// IANA protocol numbers, as the OCI security list API expects them.
const PROTOCOL_ICMP = '1';
const PROTOCOL_TCP = '6';
const PROTOCOL_UDP = '17';
const ANYWHERE = '0.0.0.0/0';

export interface NetworkResources {
  readonly vcn: oci.core.Vcn;
  readonly internetGateway: oci.core.InternetGateway;
  readonly routeTable: oci.core.RouteTable;
  readonly securityList: oci.core.SecurityList;
  readonly subnet: oci.core.Subnet;
}

/**
 * One VCN with a single public subnet. The VM gets a public IP and reaches
 * the internet through the internet gateway; there is no NAT gateway or
 * private subnet because PostgreSQL runs on the VM itself and is never
 * exposed.
 */
export function buildNetwork(
  config: ResolvedConfig,
  tags: Record<string, string>,
): NetworkResources {
  const compartmentId = config.compartmentOcid;

  const vcn = new oci.core.Vcn(`${config.namePrefix}-vcn`, {
    compartmentId,
    cidrBlocks: [config.vcnCidr],
    displayName: `${config.namePrefix}-vcn`,
    dnsLabel: 'fortressauth',
    freeformTags: tags,
  });

  const internetGateway = new oci.core.InternetGateway(`${config.namePrefix}-igw`, {
    compartmentId,
    vcnId: vcn.id,
    enabled: true,
    displayName: `${config.namePrefix}-igw`,
    freeformTags: tags,
  });

  const routeTable = new oci.core.RouteTable(`${config.namePrefix}-public-rt`, {
    compartmentId,
    vcnId: vcn.id,
    displayName: `${config.namePrefix}-public-rt`,
    routeRules: [
      {
        description: 'Default route to the internet',
        destination: ANYWHERE,
        destinationType: 'CIDR_BLOCK',
        networkEntityId: internetGateway.id,
      },
    ],
    freeformTags: tags,
  });

  const securityList = new oci.core.SecurityList(`${config.namePrefix}-public-sl`, {
    compartmentId,
    vcnId: vcn.id,
    displayName: `${config.namePrefix}-public-sl`,
    ingressSecurityRules: [
      {
        description: 'SSH for the admin and GitHub Actions deploy keys',
        protocol: PROTOCOL_TCP,
        source: config.sshSourceCidr,
        tcpOptions: { min: 22, max: 22 },
      },
      {
        description: 'HTTP for ACME challenges and the redirect to HTTPS',
        protocol: PROTOCOL_TCP,
        source: ANYWHERE,
        tcpOptions: { min: 80, max: 80 },
      },
      {
        description: 'HTTPS',
        protocol: PROTOCOL_TCP,
        source: ANYWHERE,
        tcpOptions: { min: 443, max: 443 },
      },
      {
        description: 'HTTP/3 (QUIC)',
        protocol: PROTOCOL_UDP,
        source: ANYWHERE,
        udpOptions: { min: 443, max: 443 },
      },
      {
        description: 'Path MTU discovery (fragmentation needed)',
        protocol: PROTOCOL_ICMP,
        source: ANYWHERE,
        icmpOptions: { type: 3, code: 4 },
      },
    ],
    egressSecurityRules: [
      {
        description: 'All egress (image pulls, SES, OAuth providers, backups)',
        protocol: 'all',
        destination: ANYWHERE,
      },
    ],
    freeformTags: tags,
  });

  const subnet = new oci.core.Subnet(`${config.namePrefix}-public-subnet`, {
    compartmentId,
    vcnId: vcn.id,
    cidrBlock: config.subnetCidr,
    displayName: `${config.namePrefix}-public-subnet`,
    dnsLabel: 'public',
    prohibitPublicIpOnVnic: false,
    routeTableId: routeTable.id,
    securityListIds: [securityList.id],
    freeformTags: tags,
  });

  return { vcn, internetGateway, routeTable, securityList, subnet };
}
