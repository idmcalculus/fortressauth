import * as pulumi from '@pulumi/pulumi';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { bindAlbAlias, buildDns } from '../dns';
import {
  flushResources,
  type InstallMocksResult,
  installMocks,
  makeConfig,
  TEST_TAGS,
} from './helpers';

describe('buildDns', () => {
  let mocks: InstallMocksResult;

  beforeEach(async () => {
    mocks = await installMocks('dev');
  });

  afterEach(() => {
    mocks.resources.length = 0;
  });

  it('always creates the hosted zone', async () => {
    buildDns(makeConfig({ hostedZoneName: 'auth.example.com' }), true, TEST_TAGS);
    await flushResources();

    const zone = mocks.oneOfType('aws:route53/zone:Zone');
    expect(zone.inputs.name).toBe('auth.example.com');
    expect(zone.inputs.tags).toMatchObject({ Component: 'dns' });
  });

  describe('bootstrap=true', () => {
    it('does NOT create a certificate or validation records', async () => {
      const result = buildDns(makeConfig(), true, TEST_TAGS);
      await flushResources();

      expect(mocks.byType('aws:acm/certificate:Certificate')).toEqual([]);
      expect(mocks.byType('aws:acm/certificateValidation:CertificateValidation')).toEqual([]);
      expect(result.certificate).toBeUndefined();
      expect(result.certificateValidation).toBeUndefined();
    });
  });

  describe('bootstrap=false', () => {
    it('creates an ACM certificate scoped to the appDomain with DNS validation', async () => {
      buildDns(
        makeConfig({ appDomain: 'api.example.com', hostedZoneName: 'api.example.com' }),
        false,
        TEST_TAGS,
      );
      await flushResources();

      const cert = mocks.oneOfType('aws:acm/certificate:Certificate');
      expect(cert.inputs.domainName).toBe('api.example.com');
      expect(cert.inputs.validationMethod).toBe('DNS');
    });

    it('creates a route53 record per validation option', async () => {
      buildDns(makeConfig(), false, TEST_TAGS);
      await flushResources();

      const records = mocks.byType('aws:route53/record:Record');
      // Single-domain certificate → exactly one validation record.
      expect(records).toHaveLength(1);
      expect(records[0]?.inputs.type).toBe('CNAME');
      expect(records[0]?.inputs.ttl).toBe(60);
      expect(records[0]?.inputs.allowOverwrite).toBe(true);
    });

    it('creates an ACM CertificateValidation that depends on the records', async () => {
      const result = buildDns(makeConfig(), false, TEST_TAGS);
      await flushResources();

      expect(result.certificateValidation).toBeDefined();
      const validation = mocks.oneOfType('aws:acm/certificateValidation:CertificateValidation');
      expect(validation.inputs.certificateArn).toBeDefined();
    });
  });
});

describe('bindAlbAlias', () => {
  let mocks: InstallMocksResult;

  beforeEach(async () => {
    mocks = await installMocks('dev');
  });

  afterEach(() => {
    mocks.resources.length = 0;
  });

  it('creates an A-record alias pointing the appDomain at the ALB', async () => {
    const dns = buildDns(makeConfig(), false, TEST_TAGS);
    await flushResources();

    const initialRecordCount = mocks.byType('aws:route53/record:Record').length;
    bindAlbAlias(
      makeConfig({ appDomain: 'api.example.com' }),
      dns.hostedZone,
      pulumi.output('alb-mock.elb.eu-west-1.amazonaws.com'),
      pulumi.output('Z3MOCKZONEID'),
    );
    await flushResources();

    const records = mocks.byType('aws:route53/record:Record');
    // bindAlbAlias creates exactly one record.
    expect(records.length).toBe(initialRecordCount + 1);

    const aliasRecord = records[records.length - 1];
    expect(aliasRecord?.inputs.name).toBe('api.example.com');
    expect(aliasRecord?.inputs.type).toBe('A');
    expect(aliasRecord?.inputs.aliases).toHaveLength(1);
    expect(aliasRecord?.inputs.aliases[0]).toMatchObject({
      evaluateTargetHealth: true,
    });
  });
});
