import * as oci from '@pulumi/oci';
import * as pulumi from '@pulumi/pulumi';

import type { ResolvedConfig } from './config';

export interface StorageResources {
  readonly namespace: pulumi.Output<string>;
  readonly bucket: oci.objectstorage.Bucket;
  readonly uploadRequest: oci.objectstorage.Preauthrequest;
  /** Secret. Goes into BACKUP_PAR_URL in the VM's .env. */
  readonly uploadUrl: pulumi.Output<string>;
}

/**
 * A private bucket for off-VM copies of the nightly database dumps, plus a
 * pre-authenticated request that can only write new objects into it.
 * backup.sh on the VM PUTs each dump to that URL; the URL cannot read, list
 * or delete anything, so a leaked copy cannot expose old backups.
 *
 * Pulumi will not delete the bucket while it holds objects, which keeps
 * `pulumi destroy` from removing backups by accident.
 */
export function buildStorage(
  config: ResolvedConfig,
  tags: Record<string, string>,
): StorageResources {
  const namespace = oci.objectstorage.getNamespaceOutput({
    compartmentId: config.compartmentOcid,
  }).namespace;

  const bucket = new oci.objectstorage.Bucket(`${config.namePrefix}-backups`, {
    compartmentId: config.compartmentOcid,
    namespace,
    name: `${config.namePrefix}-backups`,
    accessType: 'NoPublicAccess',
    storageTier: 'Standard',
    versioning: 'Disabled',
    freeformTags: tags,
  });

  const uploadRequest = new oci.objectstorage.Preauthrequest(`${config.namePrefix}-backup-upload`, {
    namespace,
    bucket: bucket.name,
    name: `${config.namePrefix}-backup-upload`,
    accessType: 'AnyObjectWrite',
    timeExpires: config.backupUploadExpires,
  });

  const uploadUrl = pulumi.secret(
    pulumi.interpolate`https://objectstorage.${config.region}.oraclecloud.com${uploadRequest.accessUri}`,
  );

  return { namespace, bucket, uploadRequest, uploadUrl };
}
