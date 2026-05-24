import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildEmail } from '../email';
import {
  flushResources,
  type InstallMocksResult,
  installMocks,
  makeConfig,
  TEST_TAGS,
} from './helpers';

describe('buildEmail', () => {
  let mocks: InstallMocksResult;

  beforeEach(async () => {
    mocks = await installMocks('dev');
  });

  afterEach(() => {
    mocks.resources.length = 0;
  });

  it('creates an SNS topic for SES bounce/complaint events', async () => {
    buildEmail(makeConfig(), TEST_TAGS);
    await flushResources();

    const topic = mocks.oneOfType('aws:sns/topic:Topic');
    expect(topic.inputs.name).toBe('fortressauth-dev-ses-events');
    expect(topic.inputs.tags).toMatchObject({ Component: 'email' });
  });

  it('attaches a topic policy that allows ses.amazonaws.com to publish from this account only', async () => {
    buildEmail(makeConfig(), TEST_TAGS);
    await flushResources();

    const policy = mocks.oneOfType('aws:sns/topicPolicy:TopicPolicy');
    const parsed = JSON.parse(policy.inputs.policy);
    expect(parsed.Version).toBe('2012-10-17');
    expect(parsed.Statement).toHaveLength(1);

    const statement = parsed.Statement[0];
    expect(statement).toMatchObject({
      Effect: 'Allow',
      Principal: { Service: 'ses.amazonaws.com' },
      Action: 'sns:Publish',
    });
    expect(statement.Condition.StringEquals).toEqual({ 'AWS:SourceAccount': '123456789012' });
    // Source ARN is scoped to the configuration set we just created.
    expect(statement.Condition.StringLike['AWS:SourceArn']).toMatch(
      /arn:aws:ses:eu-west-1:123456789012:configuration-set\/fortressauth-dev-events$/,
    );
  });

  it('subscribes the configured operations email to the SNS topic', async () => {
    buildEmail(makeConfig({ bounceNotificationEmail: 'oncall@example.com' }), TEST_TAGS);
    await flushResources();

    const subscription = mocks.oneOfType('aws:sns/topicSubscription:TopicSubscription');
    expect(subscription.inputs.protocol).toBe('email');
    expect(subscription.inputs.endpoint).toBe('oncall@example.com');
  });

  it('creates a configuration set with reputation metrics enabled', async () => {
    buildEmail(makeConfig(), TEST_TAGS);
    await flushResources();

    const configSet = mocks.oneOfType('aws:sesv2/configurationSet:ConfigurationSet');
    expect(configSet.inputs.configurationSetName).toBe('fortressauth-dev-events');
    expect(configSet.inputs.reputationOptions).toEqual({ reputationMetricsEnabled: true });
    expect(configSet.inputs.sendingOptions).toEqual({ sendingEnabled: true });
  });

  it('routes BOUNCE/COMPLAINT/REJECT/RENDERING_FAILURE/DELIVERY_DELAY events to SNS', async () => {
    buildEmail(makeConfig(), TEST_TAGS);
    await flushResources();

    const dest = mocks.oneOfType(
      'aws:sesv2/configurationSetEventDestination:ConfigurationSetEventDestination',
    );
    expect(dest.inputs.eventDestinationName).toBe('sns-bounces-complaints');
    expect(dest.inputs.eventDestination.matchingEventTypes).toEqual([
      'BOUNCE',
      'COMPLAINT',
      'REJECT',
      'RENDERING_FAILURE',
      'DELIVERY_DELAY',
    ]);
    expect(dest.inputs.eventDestination.snsDestination).toBeDefined();
  });

  describe('sesManageIdentity', () => {
    it('does NOT create an EmailIdentity by default', async () => {
      buildEmail(makeConfig({ sesManageIdentity: false }), TEST_TAGS);
      await flushResources();
      expect(mocks.byType('aws:sesv2/emailIdentity:EmailIdentity')).toEqual([]);
    });

    it('creates an EmailIdentity bound to the configuration set when opted in', async () => {
      buildEmail(
        makeConfig({ sesManageIdentity: true, sesIdentityDomain: 'mail.example.com' }),
        TEST_TAGS,
      );
      await flushResources();

      const identity = mocks.oneOfType('aws:sesv2/emailIdentity:EmailIdentity');
      expect(identity.inputs.emailIdentity).toBe('mail.example.com');
      expect(identity.inputs.configurationSetName).toBe('fortressauth-dev-events');
      expect(identity.inputs.dkimSigningAttributes).toEqual({
        nextSigningKeyLength: 'RSA_2048_BIT',
      });
    });
  });

  it('returns the configuration set and bounce topic in the resource bag', async () => {
    const result = buildEmail(makeConfig(), TEST_TAGS);
    await flushResources();
    expect(result.configurationSet).toBeDefined();
    expect(result.bounceTopic).toBeDefined();
    expect(result.identity).toBeUndefined();
  });

  it('returns the identity in the resource bag when sesManageIdentity is true', async () => {
    const result = buildEmail(makeConfig({ sesManageIdentity: true }), TEST_TAGS);
    await flushResources();
    expect(result.identity).toBeDefined();
  });
});
