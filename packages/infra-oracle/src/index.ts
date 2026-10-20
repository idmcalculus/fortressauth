import * as pulumi from '@pulumi/pulumi';

import { buildCompute } from './compute';
import { COMMON_TAGS, loadConfig } from './config';
import { buildNetwork } from './network';
import { buildStorage } from './storage';

const config = loadConfig();
const tags = COMMON_TAGS(config.stack);

const network = buildNetwork(config, tags);
const compute = buildCompute(config, network, tags);
const storage = buildStorage(config, tags);

export const instanceId = compute.instance.id;
export const instancePublicIp = compute.instance.publicIp;
export const homeRegion = compute.homeRegion;
export const availabilityDomain = compute.availabilityDomain;
export const imageId = compute.imageId;
export const adminSshCommand = pulumi.interpolate`ssh ubuntu@${compute.instance.publicIp}`;
export const deploySshCommand = pulumi.interpolate`ssh -i ~/.ssh/fortressauth-deploy deploy@${compute.instance.publicIp}`;
export const vcnId = network.vcn.id;
export const subnetId = network.subnet.id;
export const backupBucketName = storage.bucket.name;
export const backupUploadUrl = storage.uploadUrl;
