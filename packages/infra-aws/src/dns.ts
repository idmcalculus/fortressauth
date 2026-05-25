import * as aws from '@pulumi/aws';
import type * as pulumi from '@pulumi/pulumi';

import type { ResolvedConfig } from './config';

export interface ExternalDnsRecord {
  readonly type: string;
  readonly host: string;
  readonly value: string;
}

export interface DnsResources {
  readonly certificate: aws.acm.Certificate;
  readonly certificateValidation?: aws.acm.CertificateValidation;
  readonly certificateDnsValidationRecords: pulumi.Output<ExternalDnsRecord[]>;
}

/**
 * Creates the ACM certificate for the API hostname. DNS is intentionally
 * external to AWS; operators copy `certificateDnsValidationRecords` into the
 * authoritative provider for the parent domain (currently Namecheap).
 *
 * Bootstrap workflow:
 *   1. First `pulumi up` runs with `bootstrap: true` (default). Pulumi
 *      creates the ACM certificate and outputs its DNS validation records,
 *      but does not create the HTTPS listener or wait for validation.
 *   2. Operator creates the output CNAME records in external DNS.
 *   3. Operator sets `bootstrap: false` and runs `pulumi up` again. Pulumi
 *      waits for ACM validation and enables the HTTPS listener.
 */
export function buildDns(
  config: ResolvedConfig,
  bootstrap: boolean,
  tags: Record<string, string>,
): DnsResources {
  const certificate = new aws.acm.Certificate(`${config.namePrefix}-cert`, {
    domainName: config.appDomain,
    validationMethod: 'DNS',
    tags: { ...tags, Component: 'tls' },
  });

  const certificateDnsValidationRecords = certificate.domainValidationOptions.apply((options) =>
    options.map((option) => ({
      type: option.resourceRecordType,
      host: option.resourceRecordName.replace(/\.$/, ''),
      value: option.resourceRecordValue,
    })),
  );

  const certificateValidation = bootstrap
    ? undefined
    : new aws.acm.CertificateValidation(`${config.namePrefix}-cert-validation`, {
        certificateArn: certificate.arn,
      });

  return { certificate, certificateValidation, certificateDnsValidationRecords };
}

export function buildAppDnsRecord(
  config: ResolvedConfig,
  albDnsName: pulumi.Output<string>,
): pulumi.Output<ExternalDnsRecord> {
  return albDnsName.apply((value) => ({
    type: 'CNAME',
    host: config.appDomain,
    value,
  }));
}
