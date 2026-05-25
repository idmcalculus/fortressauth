import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';

import { COMMON_TAGS, loadConfig } from './config';
import { buildContainer } from './container';
import { buildDatabase } from './database';
import { buildAppDnsRecord, buildDns } from './dns';
import { buildEcr } from './ecr';
import { buildEmail } from './email';
import { buildNetwork } from './network';
import { buildSecrets } from './secrets';

const config = loadConfig();
const tags = COMMON_TAGS(config.stack);

// Account guard: refuses to proceed when AWS_PROFILE points at the wrong
// account. Catches the common case where a shell session lost AWS_PROFILE
// and Pulumi falls back to ambient credentials (e.g. a personal account).
//
// Set `fortressauth-aws:expectedAccountId` in the stack config to enable.
// Pulumi resolves the caller identity asynchronously, so the assertion is
// done via apply() and surfaces as a clean program-level error during
// preview thanks to pulumi.RunError (no stack trace, no "unhandled
// exception" framing).
if (config.expectedAccountId !== undefined) {
  const expectedAccountId = config.expectedAccountId;
  aws.getCallerIdentityOutput().accountId.apply((accountId) => {
    if (accountId !== expectedAccountId) {
      throw new pulumi.RunError(
        `Account guard tripped. Refusing to plan or apply against the wrong AWS account.\n` +
          `  Expected account ID: ${expectedAccountId} (from stack config fortressauth-aws:expectedAccountId)\n` +
          `  Resolved account ID: ${accountId} (from active AWS credentials)\n\n` +
          `Likely cause: AWS_PROFILE is unset or pointing at the wrong profile in this shell.\n` +
          `Fix: export AWS_PROFILE=fortressauth-${pulumi.getStack()}; aws sts get-caller-identity\n`,
      );
    }
    return accountId;
  });
}

const network = buildNetwork(config, tags);
const secrets = buildSecrets(config, tags);
const ecr = buildEcr(config, tags);
const email = buildEmail(config, tags);
const dns = buildDns(config, config.bootstrap, tags);
const database = buildDatabase(config, network, secrets, tags);

const container = buildContainer(
  config,
  network,
  secrets,
  database,
  email,
  config.bootstrap ? undefined : dns.certificate,
  config.bootstrap ? undefined : dns.certificateValidation,
  tags,
);

const appDnsRecord = buildAppDnsRecord(config, container.alb.dnsName);

export const appUrl = pulumi.interpolate`https://${config.appDomain}`;
export const albDnsName = container.alb.dnsName;
export const albZoneId = container.alb.zoneId;
export const ecsClusterName = container.cluster.name;
export const ecsServiceName = container.service.service.name;
export const ecrRepositoryUrl = ecr.repository.repositoryUrl;
export const ecrRepositoryName = ecr.repository.name;
export const dbEndpoint = database.endpoint;
export const dbInstanceId = database.instance.id;
export const databaseUrlSecretArn = secrets.databaseUrlSecret.arn;
export const sesConfigurationSetName = email.configurationSet.configurationSetName;
export const sesBounceTopicArn = email.bounceTopic.arn;
export const logGroupName = container.logGroup.name;
export const taskRoleArn = container.taskRole.arn;
export const executionRoleArn = container.executionRole.arn;
export const appDnsCnameRecord = appDnsRecord;
export const certificateDnsValidationRecords = dns.certificateDnsValidationRecords;
export const externalDnsRecords = pulumi
  .all([appDnsRecord, dns.certificateDnsValidationRecords] as const)
  .apply(([appRecord, validationRecords]) => ({
    instructions:
      'Manage these records in the authoritative external DNS provider for fortressauth.com. Do not recreate Route 53 hosted zones for api/dev-api.',
    records: [appRecord, ...validationRecords],
  }));
