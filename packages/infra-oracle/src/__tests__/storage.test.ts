import * as pulumi from '@pulumi/pulumi';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildStorage } from '../storage';
import {
  flushResources,
  type InstallMocksResult,
  installMocks,
  MOCK_NAMESPACE,
  makeConfig,
  resolveOutput,
  TEST_TAGS,
} from './helpers';

describe('buildStorage', () => {
  let mocks: InstallMocksResult;

  beforeEach(async () => {
    mocks = await installMocks('prod');
  });

  afterEach(() => {
    mocks.resources.length = 0;
    mocks.calls.length = 0;
  });

  it('creates a private Standard-tier bucket in the tenancy namespace', async () => {
    buildStorage(makeConfig(), TEST_TAGS);
    await flushResources();

    const bucket = mocks.oneOfType('oci:ObjectStorage/bucket:Bucket');
    expect(bucket.inputs).toMatchObject({
      name: 'fortressauth-prod-backups',
      namespace: MOCK_NAMESPACE,
      accessType: 'NoPublicAccess',
      storageTier: 'Standard',
      freeformTags: TEST_TAGS,
    });
  });

  it('creates a write-only upload URL with the configured expiry', async () => {
    buildStorage(makeConfig({ backupUploadExpires: '2030-06-01T00:00:00Z' }), TEST_TAGS);
    await flushResources();

    const par = mocks.oneOfType('oci:ObjectStorage/preauthrequest:Preauthrequest');
    expect(par.inputs).toMatchObject({
      accessType: 'AnyObjectWrite',
      bucket: 'fortressauth-prod-backups',
      namespace: MOCK_NAMESPACE,
      timeExpires: '2030-06-01T00:00:00Z',
    });
    expect(par.inputs.bucketListingAction).toBeUndefined();
  });

  it('exposes the full upload URL, ending in /o/, as a secret', async () => {
    const storage = buildStorage(makeConfig({ region: 'eu-frankfurt-1' }), TEST_TAGS);
    await flushResources();

    expect(await pulumi.isSecret(storage.uploadUrl)).toBe(true);
    expect(await resolveOutput(storage.uploadUrl)).toBe(
      `https://objectstorage.eu-frankfurt-1.oraclecloud.com/p/mock-token/n/${MOCK_NAMESPACE}/b/fortressauth-prod-backups/o/`,
    );
  });
});
