import { afterEach, describe, expect, it } from 'vitest';

import { buildUserData } from '../cloud-init';
import {
  assertHomeRegion,
  buildCompute,
  pickAvailabilityDomain,
  pickNewestImage,
} from '../compute';
import { buildNetwork } from '../network';
import {
  flushResources,
  type InstallMocksResult,
  installMocks,
  MOCK_AVAILABILITY_DOMAINS,
  MOCK_HOME_REGION,
  MOCK_IMAGES,
  MOCK_PUBLIC_IP,
  type MockOptions,
  makeConfig,
  resolveOutput,
  TEST_ADMIN_KEY,
  TEST_DEPLOY_KEY,
  TEST_TAGS,
} from './helpers';

const SCRIPT = '#!/usr/bin/env bash\necho bootstrap\n';

describe('buildCompute', () => {
  let mocks: InstallMocksResult;

  async function build(overrides = {}, options: MockOptions = {}) {
    mocks = await installMocks('prod', options);
    const config = makeConfig(overrides);
    const network = buildNetwork(config, TEST_TAGS);
    const compute = buildCompute(config, network, TEST_TAGS, SCRIPT);
    await flushResources();
    return compute;
  }

  afterEach(() => {
    mocks.resources.length = 0;
    mocks.calls.length = 0;
  });

  it('launches an Always Free A1 Flex VM with the configured size', async () => {
    await build({ ocpus: 2, memoryGb: 12, bootVolumeGb: 50 });

    const vm = mocks.oneOfType('oci:Core/instance:Instance');
    expect(vm.inputs.shape).toBe('VM.Standard.A1.Flex');
    expect(vm.inputs.shapeConfig).toEqual({ ocpus: 2, memoryInGbs: 12 });
    expect(vm.inputs.sourceDetails).toMatchObject({
      sourceType: 'image',
      bootVolumeSizeInGbs: '50',
    });
    expect(vm.inputs.freeformTags).toEqual(TEST_TAGS);
  });

  it('places the VM in the public subnet with a public IP', async () => {
    const compute = await build();

    const vm = mocks.oneOfType('oci:Core/instance:Instance');
    expect(vm.inputs.createVnicDetails).toMatchObject({
      subnetId: 'ocid1.mock.fortressauth-prod-public-subnet',
      assignPublicIp: 'true',
    });
    expect(await resolveOutput(compute.instance.publicIp)).toBe(MOCK_PUBLIC_IP);
  });

  it("checks the tenancy's home region before placing the VM", async () => {
    const compute = await build();

    const call = mocks.calls.find((c) => c.token.endsWith('getRegionSubscriptions'));
    expect(call?.inputs.tenancyId).toBe('ocid1.tenancy.oc1..aaaatenancy');
    expect(await resolveOutput(compute.homeRegion)).toBe(MOCK_HOME_REGION);
  });

  it('uses the configured availability domain', async () => {
    const compute = await build({ availabilityDomainIndex: 1 });

    const vm = mocks.oneOfType('oci:Core/instance:Instance');
    expect(vm.inputs.availabilityDomain).toBe(MOCK_AVAILABILITY_DOMAINS[1]);
    expect(await resolveOutput(compute.availabilityDomain)).toBe(MOCK_AVAILABILITY_DOMAINS[1]);
    const call = mocks.calls.find((c) => c.token.endsWith('getAvailabilityDomains'));
    expect(call?.inputs.compartmentId).toBe('ocid1.tenancy.oc1..aaaatenancy');
  });

  it('picks the newest Ubuntu 24.04 image built for the A1 shape', async () => {
    const compute = await build();

    const call = mocks.calls.find((c) => c.token === 'oci:Core/getImages:getImages');
    expect(call?.inputs).toMatchObject({
      operatingSystem: 'Canonical Ubuntu',
      operatingSystemVersion: '24.04',
      shape: 'VM.Standard.A1.Flex',
      sortBy: 'TIMECREATED',
      sortOrder: 'DESC',
    });
    const vm = mocks.oneOfType('oci:Core/instance:Instance');
    expect(vm.inputs.sourceDetails.sourceId).toBe(MOCK_IMAGES[0]);
    expect(await resolveOutput(compute.imageId)).toBe(MOCK_IMAGES[0]);
  });

  it('skips the image lookup when imageOcid is set', async () => {
    await build({ imageOcid: 'ocid1.image.oc1.uk-london-1.pinned' });

    expect(mocks.calls.some((c) => c.token === 'oci:Core/getImages:getImages')).toBe(false);
    const vm = mocks.oneOfType('oci:Core/instance:Instance');
    expect(vm.inputs.sourceDetails.sourceId).toBe('ocid1.image.oc1.uk-london-1.pinned');
  });

  it('logs in the admin key and bootstraps with the deploy key on first boot', async () => {
    await build();

    const vm = mocks.oneOfType('oci:Core/instance:Instance');
    expect(vm.inputs.metadata.ssh_authorized_keys).toBe(TEST_ADMIN_KEY);
    expect(vm.inputs.metadata.user_data).toBe(buildUserData(SCRIPT, TEST_DEPLOY_KEY));
  });

  it('keeps the boot volume, which holds the database, if the VM is deleted', async () => {
    await build();

    const vm = mocks.oneOfType('oci:Core/instance:Instance');
    expect(vm.inputs.preserveBootVolume).toBe(true);
  });

  it('turns on the monitoring plugin behind the Memory Utilization chart', async () => {
    await build();

    const vm = mocks.oneOfType('oci:Core/instance:Instance');
    expect(vm.inputs.agentConfig.pluginsConfigs).toContainEqual({
      name: 'Compute Instance Monitoring',
      desiredState: 'ENABLED',
    });
  });
});

describe('pickAvailabilityDomain', () => {
  it('returns the domain name at the index', () => {
    expect(pickAvailabilityDomain([{ name: 'AD-1' }, { name: 'AD-2' }], 1)).toBe('AD-2');
  });

  it('fails clearly when the index is out of range', () => {
    expect(() => pickAvailabilityDomain([{ name: 'AD-1' }], 3)).toThrow(
      /availabilityDomainIndex 3 is out of range: this region has 1 availability domain/,
    );
  });
});

describe('pickNewestImage', () => {
  it('returns the first image, which the lookup sorts newest first', () => {
    expect(pickNewestImage([{ id: 'newest' }, { id: 'older' }], 'uk-london-1')).toBe('newest');
  });

  it('fails clearly and points at imageOcid when nothing matches', () => {
    expect(() => pickNewestImage([], 'uk-london-1')).toThrow(
      /No Canonical Ubuntu 24.04 image for VM.Standard.A1.Flex in uk-london-1.*imageOcid/,
    );
  });
});

describe('assertHomeRegion', () => {
  const subscriptions = [
    { regionName: 'us-ashburn-1', isHomeRegion: true },
    { regionName: 'uk-london-1', isHomeRegion: false },
  ];

  it('returns the home region when the stack targets it', () => {
    expect(assertHomeRegion(subscriptions, 'us-ashburn-1')).toBe('us-ashburn-1');
  });

  it('fails and names the home region when the stack targets another one', () => {
    expect(() => assertHomeRegion(subscriptions, 'uk-london-1')).toThrow(
      /oci:region is uk-london-1, but this tenancy's home region is us-ashburn-1.*set oci:region to us-ashburn-1/,
    );
  });

  it('fails when no subscribed region is marked as home', () => {
    expect(() =>
      assertHomeRegion([{ regionName: 'uk-london-1', isHomeRegion: false }], 'uk-london-1'),
    ).toThrow(/Could not find this tenancy's home region/);
  });
});
