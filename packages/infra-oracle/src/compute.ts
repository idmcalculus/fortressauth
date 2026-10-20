import * as oci from '@pulumi/oci';
import * as pulumi from '@pulumi/pulumi';

import { buildUserData, readBootstrapScript } from './cloud-init';
import { A1_SHAPE, type ResolvedConfig } from './config';
import type { NetworkResources } from './network';

export interface ComputeResources {
  readonly instance: oci.core.Instance;
  readonly homeRegion: pulumi.Output<string>;
  readonly availabilityDomain: pulumi.Output<string>;
  readonly imageId: pulumi.Output<string>;
}

/**
 * Returns the tenancy's home region, or fails when the stack targets another
 * region. Always Free A1 VMs only run in the home region: elsewhere a free
 * account hits a zero service limit and a paid one gets billed.
 */
export function assertHomeRegion(
  subscriptions: ReadonlyArray<{ regionName: string; isHomeRegion: boolean }>,
  region: string,
): string {
  const home = subscriptions.find((subscription) => subscription.isHomeRegion)?.regionName;
  if (!home) {
    throw new pulumi.RunError("Could not find this tenancy's home region.");
  }
  if (home !== region) {
    throw new pulumi.RunError(
      `oci:region is ${region}, but this tenancy's home region is ${home}. ` +
        `Always Free A1 VMs only run in the home region; set oci:region to ${home}.`,
    );
  }
  return home;
}

/** Returns the name of the availability domain at `index`, or fails clearly. */
export function pickAvailabilityDomain(
  domains: ReadonlyArray<{ name?: string }>,
  index: number,
): string {
  const name = domains[index]?.name;
  if (!name) {
    throw new pulumi.RunError(
      `availabilityDomainIndex ${index} is out of range: ` +
        `this region has ${domains.length} availability domain(s).`,
    );
  }
  return name;
}

/** Returns the first (newest) image's OCID, or fails clearly. */
export function pickNewestImage(images: ReadonlyArray<{ id: string }>, region: string): string {
  const newest = images[0];
  if (!newest) {
    throw new pulumi.RunError(
      `No Canonical Ubuntu 24.04 image for ${A1_SHAPE} in ${region}. ` +
        'Set fortressauth-oracle:imageOcid to pick one by hand.',
    );
  }
  return newest.id;
}

/**
 * The Always Free Ampere A1 VM. It runs everything: Caddy, the server and
 * PostgreSQL, whose data lives on the boot volume. Several settings below
 * exist to keep that data safe:
 *
 *   - `protect` (on by default) makes Pulumi refuse to delete the instance.
 *   - `preserveBootVolume` keeps the boot volume if the instance is deleted.
 *   - `ignoreChanges` on the image and metadata stops a newer Ubuntu image
 *     or an edited bootstrap script from forcing a replacement. Both only
 *     matter at first boot anyway.
 */
export function buildCompute(
  config: ResolvedConfig,
  network: NetworkResources,
  tags: Record<string, string>,
  bootstrapScript: string = readBootstrapScript(),
): ComputeResources {
  const homeRegion = oci.identity
    .getRegionSubscriptionsOutput({ tenancyId: config.tenancyOcid })
    .apply(({ regionSubscriptions }) => assertHomeRegion(regionSubscriptions, config.region));

  // Chained on homeRegion so the VM is never planned outside the home region.
  const availabilityDomain = pulumi
    .all([
      homeRegion,
      oci.identity.getAvailabilityDomainsOutput({ compartmentId: config.tenancyOcid }),
    ])
    .apply(([, { availabilityDomains }]) =>
      pickAvailabilityDomain(availabilityDomains, config.availabilityDomainIndex),
    );

  const imageId =
    config.imageOcid !== undefined
      ? pulumi.output(config.imageOcid)
      : oci.core
          .getImagesOutput({
            compartmentId: config.compartmentOcid,
            operatingSystem: 'Canonical Ubuntu',
            operatingSystemVersion: '24.04',
            shape: A1_SHAPE,
            sortBy: 'TIMECREATED',
            sortOrder: 'DESC',
          })
          .apply(({ images }) => pickNewestImage(images, config.region));

  const instance = new oci.core.Instance(
    `${config.namePrefix}-vm`,
    {
      compartmentId: config.compartmentOcid,
      availabilityDomain,
      displayName: `${config.namePrefix}-vm`,
      shape: A1_SHAPE,
      shapeConfig: {
        ocpus: config.ocpus,
        memoryInGbs: config.memoryGb,
      },
      sourceDetails: {
        sourceType: 'image',
        sourceId: imageId,
        bootVolumeSizeInGbs: String(config.bootVolumeGb),
      },
      createVnicDetails: {
        subnetId: network.subnet.id,
        assignPublicIp: 'true',
        displayName: `${config.namePrefix}-vnic`,
        freeformTags: tags,
      },
      metadata: {
        ssh_authorized_keys: config.adminSshPublicKey,
        user_data: buildUserData(bootstrapScript, config.deploySshPublicKey),
      },
      agentConfig: {
        // Feeds the Memory Utilization chart used to check the keep-alive.
        pluginsConfigs: [{ name: 'Compute Instance Monitoring', desiredState: 'ENABLED' }],
      },
      preserveBootVolume: true,
      freeformTags: tags,
    },
    {
      protect: config.protectInstance,
      ignoreChanges: ['sourceDetails', 'metadata'],
    },
  );

  return { instance, homeRegion, availabilityDomain, imageId };
}
