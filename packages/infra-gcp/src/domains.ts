import * as gcp from '@pulumi/gcp';
import * as pulumi from '@pulumi/pulumi';

import type { ResolvedConfig } from './config';
import type { ServiceResources } from './service';

export interface DnsRecord {
  readonly domain: string;
  readonly name: string;
  readonly type: string;
  readonly value: string;
}

export interface DomainResources {
  readonly mappings: readonly gcp.cloudrun.DomainMapping[];
  /** The records to add at the DNS host (Namecheap) for each mapped domain. */
  readonly dnsRecords: pulumi.Output<DnsRecord[]>;
}

/**
 * Maps each `appDomains` hostname to the service with a Google-managed
 * certificate. Cloud Run domain mappings cost nothing but are a preview
 * feature, available in a subset of regions (europe-west1 among them).
 *
 * Google only accepts a mapping once the domain is verified in Search
 * Console for the account running Pulumi; see the runbook.
 */
export function buildDomains(config: ResolvedConfig, api: ServiceResources): DomainResources {
  const mappings = config.appDomains.map(
    (domain) =>
      new gcp.cloudrun.DomainMapping(`${config.namePrefix}-domain-${domain.replace(/\./g, '-')}`, {
        project: config.project,
        location: config.region,
        name: domain,
        metadata: { namespace: config.project },
        spec: { routeName: api.service.name },
      }),
  );

  const dnsRecords = pulumi
    .all(mappings.map((mapping) => pulumi.all([mapping.name, mapping.statuses])))
    .apply((entries) =>
      entries.flatMap(([domain, statuses]) =>
        (statuses ?? []).flatMap((status) =>
          (status.resourceRecords ?? []).map((record) => ({
            domain,
            name: record.name ?? '',
            type: record.type ?? '',
            value: record.rrdata,
          })),
        ),
      ),
    );

  return { mappings, dnsRecords };
}
