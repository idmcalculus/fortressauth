import * as pulumi from '@pulumi/pulumi';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TEST_ADMIN_KEY, TEST_DEPLOY_KEY } from './helpers';

const PROJECT = 'fortressauth-oracle';

/**
 * Drives loadConfig() against the Pulumi runtime: primes project + stack via
 * setMocks, then writes the stack config through setAllConfig. Keys without
 * a namespace get the project's; cross-project keys (oci:region) pass
 * through as written.
 */
async function loadWithConfig(
  values: Record<string, unknown>,
  stack = 'prod',
): Promise<typeof import('../config')> {
  await pulumi.runtime.setMocks(
    {
      newResource: (args) => ({ id: `${args.name}_id`, state: args.inputs }),
      call: (args) => args.inputs,
    },
    PROJECT,
    stack,
    /* preview */ false,
  );

  const namespaced: Record<string, string> = {};
  for (const [key, raw] of Object.entries(values)) {
    if (raw === undefined) continue;
    const fullKey = key.includes(':') ? key : `${PROJECT}:${key}`;
    namespaced[fullKey] = typeof raw === 'string' ? raw : String(raw);
  }
  pulumi.runtime.setAllConfig(namespaced);

  return await import('../config');
}

const REQUIRED_CONFIG: Record<string, unknown> = {
  'oci:region': 'uk-london-1',
  tenancyOcid: 'ocid1.tenancy.oc1..aaaatenancy',
  adminSshPublicKey: TEST_ADMIN_KEY,
  deploySshPublicKey: TEST_DEPLOY_KEY,
  backupUploadExpires: '2099-01-01T00:00:00Z',
};

function withRequired(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...REQUIRED_CONFIG, ...extra };
}

async function expectInvalid(extra: Record<string, unknown>, message: RegExp): Promise<void> {
  const { loadConfig } = await loadWithConfig(withRequired(extra));
  expect(() => loadConfig()).toThrow(message);
}

describe('loadConfig', () => {
  beforeEach(() => {
    pulumi.runtime.setAllConfig({});
  });

  afterEach(() => {
    pulumi.runtime.setAllConfig({});
  });

  it('applies the documented defaults when only required keys are provided', async () => {
    const { loadConfig } = await loadWithConfig(withRequired());
    const cfg = loadConfig();

    expect(cfg.stack).toBe('prod');
    expect(cfg.namePrefix).toBe('fortressauth-prod');
    expect(cfg.region).toBe('uk-london-1');
    expect(cfg.compartmentOcid).toBe('ocid1.tenancy.oc1..aaaatenancy');
    expect(cfg.availabilityDomainIndex).toBe(0);
    expect(cfg.ocpus).toBe(2);
    expect(cfg.memoryGb).toBe(12);
    expect(cfg.bootVolumeGb).toBe(50);
    expect(cfg.imageOcid).toBeUndefined();
    expect(cfg.protectInstance).toBe(true);
    expect(cfg.vcnCidr).toBe('10.50.0.0/16');
    expect(cfg.subnetCidr).toBe('10.50.0.0/24');
    expect(cfg.sshSourceCidr).toBe('0.0.0.0/0');
    expect(cfg.backupUploadExpires).toBe('2099-01-01T00:00:00Z');
  });

  it('accepts overrides within the Always Free limits', async () => {
    const { loadConfig } = await loadWithConfig(
      withRequired({
        compartmentOcid: 'ocid1.compartment.oc1..aaaacompartment',
        availabilityDomainIndex: 2,
        ocpus: 1,
        memoryGb: 6,
        bootVolumeGb: 100,
        imageOcid: 'ocid1.image.oc1.uk-london-1.pinned',
        protectInstance: false,
        vcnCidr: '10.60.0.0/16',
        subnetCidr: '10.60.5.0/24',
        sshSourceCidr: '198.51.100.7/32',
      }),
    );
    const cfg = loadConfig();

    expect(cfg.compartmentOcid).toBe('ocid1.compartment.oc1..aaaacompartment');
    expect(cfg.availabilityDomainIndex).toBe(2);
    expect(cfg.ocpus).toBe(1);
    expect(cfg.memoryGb).toBe(6);
    expect(cfg.bootVolumeGb).toBe(100);
    expect(cfg.imageOcid).toBe('ocid1.image.oc1.uk-london-1.pinned');
    expect(cfg.protectInstance).toBe(false);
    expect(cfg.subnetCidr).toBe('10.60.5.0/24');
    expect(cfg.sshSourceCidr).toBe('198.51.100.7/32');
  });

  describe('required keys', () => {
    for (const key of Object.keys(REQUIRED_CONFIG)) {
      it(`fails without ${key}`, async () => {
        const { loadConfig } = await loadWithConfig(withRequired({ [key]: undefined }));
        expect(() => loadConfig()).toThrow();
      });
    }
  });

  describe('validation', () => {
    it('rejects a tenancyOcid that is not a tenancy OCID', async () => {
      await expectInvalid(
        { tenancyOcid: 'ocid1.compartment.oc1..aaaa' },
        /Invalid tenancyOcid config value/,
      );
    });

    it('rejects a compartmentOcid of the wrong kind', async () => {
      await expectInvalid(
        { compartmentOcid: 'ocid1.instance.oc1..aaaa' },
        /Invalid compartmentOcid config value/,
      );
    });

    it('rejects an imageOcid of the wrong kind', async () => {
      await expectInvalid({ imageOcid: 'ubuntu-24.04' }, /Invalid imageOcid config value/);
    });

    it('rejects a malformed SSH public key', async () => {
      await expectInvalid(
        { deploySshPublicKey: '-----BEGIN OPENSSH PRIVATE KEY-----' },
        /Invalid deploySshPublicKey config value/,
      );
    });

    it('rejects using the same key for admin and deploy', async () => {
      await expectInvalid({ deploySshPublicKey: TEST_ADMIN_KEY }, /must be different keys/);
    });

    it('rejects a subnet outside the VCN', async () => {
      await expectInvalid(
        { vcnCidr: '10.50.0.0/16', subnetCidr: '10.51.0.0/24' },
        /subnetCidr config value: must sit inside vcnCidr/,
      );
    });

    it('rejects a subnet larger than the VCN', async () => {
      await expectInvalid(
        { vcnCidr: '10.50.0.0/24', subnetCidr: '10.50.0.0/16' },
        /must sit inside vcnCidr/,
      );
    });

    it('rejects a malformed CIDR', async () => {
      await expectInvalid({ sshSourceCidr: '300.1.1.1/32' }, /Invalid sshSourceCidr/);
    });

    it.each([
      ['ocpus', 0],
      ['ocpus', 5],
      ['memoryGb', 25],
      ['bootVolumeGb', 40],
      ['bootVolumeGb', 250],
    ])('rejects %s = %s', async (key, value) => {
      await expectInvalid({ [key]: value }, new RegExp(`Invalid ${key} config value`));
    });

    it('rejects a negative availabilityDomainIndex', async () => {
      await expectInvalid({ availabilityDomainIndex: -1 }, /Invalid availabilityDomainIndex/);
    });

    it('rejects a backupUploadExpires that is not a timestamp', async () => {
      await expectInvalid({ backupUploadExpires: 'next year' }, /RFC 3339 timestamp/);
    });

    it('rejects a backupUploadExpires in the past', async () => {
      await expectInvalid({ backupUploadExpires: '2020-01-01T00:00:00Z' }, /the date has passed/);
    });
  });
});
