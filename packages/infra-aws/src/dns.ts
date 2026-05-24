import * as aws from '@pulumi/aws';
import type * as pulumi from '@pulumi/pulumi';

import type { ResolvedConfig } from './config';

export interface DnsResources {
  readonly hostedZone: aws.route53.Zone;
  readonly certificate?: aws.acm.Certificate;
  readonly certificateValidation?: aws.acm.CertificateValidation;
}

/**
 * Creates a Route 53 hosted zone for the API subdomain (e.g. api.example.com)
 * and, when `bootstrap` is false, an ACM certificate validated via DNS
 * records inside that same zone.
 *
 * Bootstrap workflow:
 *   1. First `pulumi up` runs with `bootstrap: true` (default). Pulumi
 *      creates only the hosted zone, exposes its NS records as the stack
 *      output `hostedZoneNameServers`, and skips ACM provisioning. This
 *      avoids the deadlock where ACM `CertificateValidation` blocks the
 *      first apply waiting on a delegation that does not exist yet.
 *   2. Operator delegates the subdomain by adding the NS record set at
 *      the parent DNS provider.
 *   3. Operator sets `bootstrap: false` and runs `pulumi up` again.
 *      Pulumi then creates the certificate, the validation records inside
 *      the now-delegated zone, and the HTTPS listener.
 */
export function buildDns(
  config: ResolvedConfig,
  bootstrap: boolean,
  tags: Record<string, string>,
): DnsResources {
  const hostedZone = new aws.route53.Zone(`${config.namePrefix}-zone`, {
    name: config.hostedZoneName,
    comment: `FortressAuth ${config.stack} hosted zone for ${config.hostedZoneName}`,
    tags: { ...tags, Component: 'dns' },
  });

  if (bootstrap) {
    return { hostedZone };
  }

  const certificate = new aws.acm.Certificate(`${config.namePrefix}-cert`, {
    domainName: config.appDomain,
    validationMethod: 'DNS',
    tags: { ...tags, Component: 'dns' },
  });

  const validationRecords = certificate.domainValidationOptions.apply((options) =>
    options.map((option, index) => {
      return new aws.route53.Record(`${config.namePrefix}-cert-validation-${index}`, {
        zoneId: hostedZone.zoneId,
        name: option.resourceRecordName,
        type: option.resourceRecordType,
        records: [option.resourceRecordValue],
        ttl: 60,
        allowOverwrite: true,
      });
    }),
  );

  const certificateValidation = new aws.acm.CertificateValidation(
    `${config.namePrefix}-cert-validation`,
    {
      certificateArn: certificate.arn,
      validationRecordFqdns: validationRecords.apply((records) =>
        records.map((record) => record.fqdn),
      ),
    },
  );

  return { hostedZone, certificate, certificateValidation };
}

export function bindAlbAlias(
  config: ResolvedConfig,
  hostedZone: aws.route53.Zone,
  albDnsName: pulumi.Output<string>,
  albZoneId: pulumi.Output<string>,
): void {
  new aws.route53.Record(`${config.namePrefix}-alb-a`, {
    zoneId: hostedZone.zoneId,
    name: config.appDomain,
    type: 'A',
    aliases: [
      {
        name: albDnsName,
        zoneId: albZoneId,
        evaluateTargetHealth: true,
      },
    ],
  });
}
