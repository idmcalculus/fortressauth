import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';

import type { ResolvedConfig } from './config';

export interface EmailResources {
  readonly configurationSet: aws.sesv2.ConfigurationSet;
  readonly bounceTopic: aws.sns.Topic;
  readonly identity?: aws.sesv2.EmailIdentity;
}

/**
 * Builds SES configuration set + SNS bounce/complaint topic.
 *
 * The SES domain identity itself is provisioned outside Pulumi (set up
 * manually via the AWS console / CLI) so DKIM keys and domain verification
 * survive Pulumi state recovery. Set `sesManageIdentity: true` in stack
 * config to opt in to Pulumi-managed identity.
 */
export function buildEmail(config: ResolvedConfig, tags: Record<string, string>): EmailResources {
  const bounceTopic = new aws.sns.Topic(`${config.namePrefix}-ses-events`, {
    name: `${config.namePrefix}-ses-events`,
    displayName: 'FortressAuth SES bounce/complaint events',
    tags: { ...tags, Component: 'email' },
  });

  // SES needs explicit permission to publish to the SNS topic. Without this
  // policy, ConfigurationSetEventDestination accepts the topic ARN but SES
  // cannot deliver bounce/complaint events. Scoped to this account's SES
  // configuration set ARN to prevent cross-account SES instances from using
  // the topic.
  const callerIdentity = aws.getCallerIdentityOutput();
  const region = aws.getRegionOutput();
  new aws.sns.TopicPolicy(`${config.namePrefix}-ses-events-policy`, {
    arn: bounceTopic.arn,
    policy: pulumi
      .all([bounceTopic.arn, callerIdentity.accountId, region.id] as const)
      .apply(([topicArn, accountId, regionId]) =>
        JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Sid: 'AllowSesPublish',
              Effect: 'Allow',
              Principal: { Service: 'ses.amazonaws.com' },
              Action: 'sns:Publish',
              Resource: topicArn,
              Condition: {
                StringEquals: { 'AWS:SourceAccount': accountId },
                StringLike: {
                  'AWS:SourceArn': `arn:aws:ses:${regionId}:${accountId}:configuration-set/${config.sesConfigurationSetName}`,
                },
              },
            },
          ],
        }),
      ),
  });

  new aws.sns.TopicSubscription(`${config.namePrefix}-ses-events-email`, {
    topic: bounceTopic.arn,
    protocol: 'email',
    endpoint: config.bounceNotificationEmail,
  });

  const configurationSet = new aws.sesv2.ConfigurationSet(`${config.namePrefix}-ses-config-set`, {
    configurationSetName: config.sesConfigurationSetName,
    reputationOptions: {
      reputationMetricsEnabled: true,
    },
    sendingOptions: {
      sendingEnabled: true,
    },
    tags,
  });

  new aws.sesv2.ConfigurationSetEventDestination(`${config.namePrefix}-ses-events-dest`, {
    configurationSetName: configurationSet.configurationSetName,
    eventDestinationName: 'sns-bounces-complaints',
    eventDestination: {
      enabled: true,
      matchingEventTypes: ['BOUNCE', 'COMPLAINT', 'REJECT', 'RENDERING_FAILURE', 'DELIVERY_DELAY'],
      snsDestination: {
        topicArn: bounceTopic.arn,
      },
    },
  });

  let identity: aws.sesv2.EmailIdentity | undefined;
  if (config.sesManageIdentity) {
    identity = new aws.sesv2.EmailIdentity(`${config.namePrefix}-ses-identity`, {
      emailIdentity: config.sesIdentityDomain,
      configurationSetName: configurationSet.configurationSetName,
      dkimSigningAttributes: {
        nextSigningKeyLength: 'RSA_2048_BIT',
      },
      tags,
    });
  }

  return identity ? { configurationSet, bounceTopic, identity } : { configurationSet, bounceTopic };
}
