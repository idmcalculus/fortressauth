import * as pulumi from '@pulumi/pulumi';

/** The only shape covered by Oracle's Always Free Ampere A1 allowance. */
export const A1_SHAPE = 'VM.Standard.A1.Flex';

// Always Free A1 allowance per tenancy: 2 OCPUs and 12 GB since June 2026
// (4 and 24 before). Allow up to the old limit for Pay As You Go accounts
// that still have it; anything above is billed.
const MAX_OCPUS = 4;
const MAX_MEMORY_GB = 24;
// Oracle's minimum custom boot volume is 50 GB; Always Free covers 200 GB
// of block storage in total.
const MIN_BOOT_VOLUME_GB = 50;
const MAX_BOOT_VOLUME_GB = 200;

const SSH_KEY_PATTERN =
  /^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp(256|384|521)) [A-Za-z0-9+/=]+( \S.*)?$/;
const CIDR_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/;

function assertOcid(value: string, kinds: readonly string[], name: string): string {
  const trimmed = value.trim();
  const valid = kinds.some((kind) => trimmed.startsWith(`ocid1.${kind}.`)) && !/\s/.test(trimmed);
  if (!valid) {
    throw new Error(`Invalid ${name} config value: expected an ${kinds.join(' or ')} OCID.`);
  }
  return trimmed;
}

function assertSshPublicKey(value: string, name: string): string {
  const trimmed = value.trim();
  if (!SSH_KEY_PATTERN.test(trimmed)) {
    throw new Error(`Invalid ${name} config value: expected one SSH public key line.`);
  }
  return trimmed;
}

interface ParsedCidr {
  readonly network: number;
  readonly prefix: number;
}

function parseCidr(value: string, name: string): ParsedCidr {
  const match = CIDR_PATTERN.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid ${name} config value: expected an IPv4 CIDR block.`);
  }
  const octets = match.slice(1, 5).map(Number);
  const prefix = Number(match[5]);
  if (octets.some((octet) => octet > 255) || prefix > 32) {
    throw new Error(`Invalid ${name} config value: expected an IPv4 CIDR block.`);
  }
  const address = octets.reduce((acc, octet) => acc * 256 + octet, 0);
  return { network: maskAddress(address, prefix), prefix };
}

function maskAddress(address: number, prefix: number): number {
  const size = 2 ** (32 - prefix);
  return Math.floor(address / size) * size;
}

function assertCidrWithin(inner: ParsedCidr, outer: ParsedCidr, name: string): void {
  if (inner.prefix < outer.prefix || maskAddress(inner.network, outer.prefix) !== outer.network) {
    throw new Error(`Invalid ${name} config value: must sit inside vcnCidr.`);
  }
}

function assertNumberInRange(value: number, min: number, max: number, name: string): number {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`Invalid ${name} config value: expected a number from ${min} to ${max}.`);
  }
  return value;
}

function assertFutureTimestamp(value: string, name: string): string {
  const trimmed = value.trim();
  const parsed = Date.parse(trimmed);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(trimmed) || Number.isNaN(parsed)) {
    throw new Error(`Invalid ${name} config value: expected an RFC 3339 timestamp.`);
  }
  if (parsed <= Date.now()) {
    throw new Error(`Invalid ${name} config value: the date has passed.`);
  }
  return trimmed;
}

export interface ResolvedConfig {
  readonly stack: string;
  readonly namePrefix: string;
  readonly region: string;

  // Tenancy
  readonly tenancyOcid: string;
  readonly compartmentOcid: string;

  // VM
  readonly availabilityDomainIndex: number;
  readonly ocpus: number;
  readonly memoryGb: number;
  readonly bootVolumeGb: number;
  readonly imageOcid: string | undefined;
  readonly adminSshPublicKey: string;
  readonly deploySshPublicKey: string;
  readonly protectInstance: boolean;

  // Network
  readonly vcnCidr: string;
  readonly subnetCidr: string;
  readonly sshSourceCidr: string;

  // Backups
  readonly backupUploadExpires: string;
}

export function loadConfig(): ResolvedConfig {
  const config = new pulumi.Config();
  const ociConfig = new pulumi.Config('oci');
  const stack = pulumi.getStack();
  const namePrefix = config.get('namePrefix') ?? `fortressauth-${stack}`;
  const region = ociConfig.require('region').trim();

  const tenancyOcid = assertOcid(config.require('tenancyOcid'), ['tenancy'], 'tenancyOcid');
  const compartmentOcid = assertOcid(
    config.get('compartmentOcid') ?? tenancyOcid,
    ['compartment', 'tenancy'],
    'compartmentOcid',
  );

  const availabilityDomainIndex = config.getNumber('availabilityDomainIndex') ?? 0;
  if (!Number.isInteger(availabilityDomainIndex) || availabilityDomainIndex < 0) {
    throw new Error('Invalid availabilityDomainIndex config value.');
  }
  const ocpus = assertNumberInRange(config.getNumber('ocpus') ?? 2, 1, MAX_OCPUS, 'ocpus');
  const memoryGb = assertNumberInRange(
    config.getNumber('memoryGb') ?? 12,
    1,
    MAX_MEMORY_GB,
    'memoryGb',
  );
  const bootVolumeGb = assertNumberInRange(
    config.getNumber('bootVolumeGb') ?? MIN_BOOT_VOLUME_GB,
    MIN_BOOT_VOLUME_GB,
    MAX_BOOT_VOLUME_GB,
    'bootVolumeGb',
  );
  const imageOcidRaw = config.get('imageOcid');
  const imageOcid =
    imageOcidRaw === undefined ? undefined : assertOcid(imageOcidRaw, ['image'], 'imageOcid');
  const adminSshPublicKey = assertSshPublicKey(
    config.require('adminSshPublicKey'),
    'adminSshPublicKey',
  );
  const deploySshPublicKey = assertSshPublicKey(
    config.require('deploySshPublicKey'),
    'deploySshPublicKey',
  );
  if (adminSshPublicKey === deploySshPublicKey) {
    throw new Error('adminSshPublicKey and deploySshPublicKey must be different keys.');
  }
  const protectInstance = config.getBoolean('protectInstance') ?? true;

  const vcnCidr = config.get('vcnCidr') ?? '10.50.0.0/16';
  const subnetCidr = config.get('subnetCidr') ?? '10.50.0.0/24';
  const sshSourceCidr = config.get('sshSourceCidr') ?? '0.0.0.0/0';
  const vcn = parseCidr(vcnCidr, 'vcnCidr');
  assertCidrWithin(parseCidr(subnetCidr, 'subnetCidr'), vcn, 'subnetCidr');
  parseCidr(sshSourceCidr, 'sshSourceCidr');

  const backupUploadExpires = assertFutureTimestamp(
    config.require('backupUploadExpires'),
    'backupUploadExpires',
  );

  return {
    stack,
    namePrefix,
    region,
    tenancyOcid,
    compartmentOcid,
    availabilityDomainIndex,
    ocpus,
    memoryGb,
    bootVolumeGb,
    imageOcid,
    adminSshPublicKey,
    deploySshPublicKey,
    protectInstance,
    vcnCidr: vcnCidr.trim(),
    subnetCidr: subnetCidr.trim(),
    sshSourceCidr: sshSourceCidr.trim(),
    backupUploadExpires,
  };
}

export const COMMON_TAGS = (stack: string): Record<string, string> => ({
  ManagedBy: 'pulumi',
  Project: 'fortressauth',
  Stack: stack,
});
