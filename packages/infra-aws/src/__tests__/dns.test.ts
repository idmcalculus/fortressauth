import * as pulumi from '@pulumi/pulumi';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildAppDnsRecord, buildDns } from '../dns';
import {
  flushResources,
  type InstallMocksResult,
  installMocks,
  makeConfig,
  resolveOutput,
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

  it('creates an ACM certificate scoped to the appDomain with DNS validation', async () => {
    buildDns(makeConfig({ appDomain: 'api.example.com' }), true, TEST_TAGS);
    await flushResources();

    const cert = mocks.oneOfType('aws:acm/certificate:Certificate');
    expect(cert.inputs.domainName).toBe('api.example.com');
    expect(cert.inputs.validationMethod).toBe('DNS');
    expect(cert.inputs.tags).toMatchObject({ Component: 'tls' });
    expect(mocks.byType('aws:route53/zone:Zone')).toEqual([]);
    expect(mocks.byType('aws:route53/record:Record')).toEqual([]);
  });

  describe('bootstrap=true', () => {
    it('does NOT create a CertificateValidation waiter', async () => {
      const result = buildDns(makeConfig(), true, TEST_TAGS);
      await flushResources();

      expect(mocks.byType('aws:acm/certificateValidation:CertificateValidation')).toEqual([]);
      expect(result.certificate).toBeDefined();
      expect(result.certificateValidation).toBeUndefined();
    });

    it('outputs the external DNS validation records', async () => {
      const result = buildDns(makeConfig({ appDomain: 'api.example.com' }), true, TEST_TAGS);
      await flushResources();

      const records = await resolveOutput(result.certificateDnsValidationRecords);
      expect(records).toEqual([
        {
          type: 'CNAME',
          host: '_validation.api.example.com',
          value: '_validation-target.fortressauth-dev-cert.acm-validations.aws.',
        },
      ]);
    });
  });

  describe('bootstrap=false', () => {
    it('creates an ACM CertificateValidation waiter for externally managed DNS', async () => {
      const result = buildDns(makeConfig(), false, TEST_TAGS);
      await flushResources();

      expect(result.certificateValidation).toBeDefined();
      const validation = mocks.oneOfType('aws:acm/certificateValidation:CertificateValidation');
      expect(validation.inputs.certificateArn).toBeDefined();
      expect(validation.inputs.validationRecordFqdns).toBeUndefined();
      expect(mocks.byType('aws:route53/zone:Zone')).toEqual([]);
      expect(mocks.byType('aws:route53/record:Record')).toEqual([]);
    });
  });
});

describe('buildAppDnsRecord', () => {
  it('returns the external CNAME record that points the appDomain at the ALB', async () => {
    const record = await resolveOutput(
      buildAppDnsRecord(
        makeConfig({ appDomain: 'api.example.com' }),
        pulumi.output('alb-mock.elb.eu-west-1.amazonaws.com'),
      ),
    );

    expect(record).toEqual({
      type: 'CNAME',
      host: 'api.example.com',
      value: 'alb-mock.elb.eu-west-1.amazonaws.com',
    });
  });
});
