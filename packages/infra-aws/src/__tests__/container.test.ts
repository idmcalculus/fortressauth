import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildContainer } from '../container';
import { buildDatabase } from '../database';
import { buildDns } from '../dns';
import { buildEmail } from '../email';
import { buildNetwork } from '../network';
import { buildSecrets } from '../secrets';
import {
  flushResources,
  type InstallMocksResult,
  installMocks,
  makeConfig,
  resolveOutput,
  TEST_TAGS,
} from './helpers';

describe('buildContainer', () => {
  let mocks: InstallMocksResult;

  beforeEach(async () => {
    mocks = await installMocks('dev');
  });

  afterEach(() => {
    mocks.resources.length = 0;
  });

  /**
   * Wires up the full dependency chain that buildContainer expects. Returns
   * the produced config + dependent resources so each test can override a
   * single facet of the config without re-stating the whole stack.
   */
  async function setup(configOverrides: Parameters<typeof makeConfig>[0] = {}) {
    const config = makeConfig(configOverrides);
    const network = buildNetwork(config, TEST_TAGS);
    const secrets = buildSecrets(config, TEST_TAGS);
    const email = buildEmail(config, TEST_TAGS);
    const dns = buildDns(config, false, TEST_TAGS);
    const database = buildDatabase(config, network, secrets, TEST_TAGS);
    await flushResources();
    return { config, network, secrets, email, dns, database };
  }

  it('creates an ECS cluster with enhanced container insights', async () => {
    const { config, network, secrets, email, dns, database } = await setup();
    buildContainer(
      config,
      network,
      secrets,
      database,
      email,
      dns.certificate,
      dns.certificateValidation,
      TEST_TAGS,
    );
    await flushResources();

    const cluster = mocks.oneOfType('aws:ecs/cluster:Cluster');
    expect(cluster.inputs.name).toBe('fortressauth-dev-cluster');
    expect(cluster.inputs.settings).toEqual([{ name: 'containerInsights', value: 'enhanced' }]);
  });

  it('creates a CloudWatch log group with the configured retention', async () => {
    const { config, network, secrets, email, dns, database } = await setup({
      logRetentionDays: 90,
    });
    buildContainer(
      config,
      network,
      secrets,
      database,
      email,
      dns.certificate,
      dns.certificateValidation,
      TEST_TAGS,
    );
    await flushResources();

    const logGroup = mocks.oneOfType('aws:cloudwatch/logGroup:LogGroup');
    expect(logGroup.inputs.name).toBe('/ecs/fortressauth-dev');
    expect(logGroup.inputs.retentionInDays).toBe(90);
  });

  describe('IAM roles', () => {
    it('creates an execution role and a task role, both assumable by ecs-tasks', async () => {
      const { config, network, secrets, email, dns, database } = await setup();
      buildContainer(
        config,
        network,
        secrets,
        database,
        email,
        dns.certificate,
        dns.certificateValidation,
        TEST_TAGS,
      );
      await flushResources();

      const roles = mocks.byType('aws:iam/role:Role');
      expect(roles).toHaveLength(2);
      const names = roles.map((r) => r.inputs.name).sort();
      expect(names).toEqual(['fortressauth-dev-task', 'fortressauth-dev-task-execution']);

      for (const role of roles) {
        const trust = JSON.parse(role.inputs.assumeRolePolicy);
        expect(trust.Statement[0].Principal).toEqual({ Service: 'ecs-tasks.amazonaws.com' });
      }
    });

    it('attaches the AWS-managed AmazonECSTaskExecutionRolePolicy to the execution role', async () => {
      const { config, network, secrets, email, dns, database } = await setup();
      buildContainer(
        config,
        network,
        secrets,
        database,
        email,
        dns.certificate,
        dns.certificateValidation,
        TEST_TAGS,
      );
      await flushResources();

      const attachment = mocks.oneOfType('aws:iam/rolePolicyAttachment:RolePolicyAttachment');
      expect(attachment.inputs.policyArn).toBe(
        'arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy',
      );
    });

    it('grants the execution role secretsmanager:GetSecretValue / DescribeSecret on every app secret ARN', async () => {
      const { config, network, secrets, email, dns, database } = await setup({
        secretEnvKeys: ['RESEND_API_KEY', 'GOOGLE_CLIENT_SECRET'],
      });
      buildContainer(
        config,
        network,
        secrets,
        database,
        email,
        dns.certificate,
        dns.certificateValidation,
        TEST_TAGS,
      );
      await flushResources();

      const execSecretsPolicy = mocks
        .byType('aws:iam/rolePolicy:RolePolicy')
        .find((p) => p.name === 'fortressauth-dev-exec-secrets');
      expect(execSecretsPolicy).toBeDefined();

      const policy = JSON.parse(execSecretsPolicy?.inputs.policy as string);
      expect(policy.Statement[0]).toMatchObject({
        Effect: 'Allow',
        Action: ['secretsmanager:GetSecretValue', 'secretsmanager:DescribeSecret'],
      });
      // 1 (db password) + 1 (DATABASE_URL) + 2 (app secrets) = 4 ARNs
      expect(policy.Statement[0].Resource).toHaveLength(4);
    });

    it('grants the task role ses:SendEmail / SendRawEmail scoped to the configured From address', async () => {
      const { config, network, secrets, email, dns, database } = await setup({
        sesFromAddress: 'noreply@example.com',
      });
      buildContainer(
        config,
        network,
        secrets,
        database,
        email,
        dns.certificate,
        dns.certificateValidation,
        TEST_TAGS,
      );
      await flushResources();

      const sesPolicy = mocks
        .byType('aws:iam/rolePolicy:RolePolicy')
        .find((p) => p.name === 'fortressauth-dev-task-ses');
      expect(sesPolicy).toBeDefined();

      const policy = JSON.parse(sesPolicy?.inputs.policy as string);
      expect(policy.Statement[0].Action).toEqual(['ses:SendEmail', 'ses:SendRawEmail']);
      expect(policy.Statement[0].Condition.StringEquals['ses:FromAddress']).toBe(
        'noreply@example.com',
      );
    });

    it('grants the task role SSM Session Manager permissions for ECS Exec', async () => {
      const { config, network, secrets, email, dns, database } = await setup();
      buildContainer(
        config,
        network,
        secrets,
        database,
        email,
        dns.certificate,
        dns.certificateValidation,
        TEST_TAGS,
      );
      await flushResources();

      const execPolicy = mocks
        .byType('aws:iam/rolePolicy:RolePolicy')
        .find((p) => p.name === 'fortressauth-dev-task-exec');
      expect(execPolicy).toBeDefined();
      const policy = JSON.parse(execPolicy?.inputs.policy as string);
      expect(policy.Statement[0].Action).toEqual(
        expect.arrayContaining([
          'ssmmessages:CreateControlChannel',
          'ssmmessages:CreateDataChannel',
          'ssmmessages:OpenControlChannel',
          'ssmmessages:OpenDataChannel',
        ]),
      );
    });
  });

  describe('Application Load Balancer', () => {
    it('creates an ALB attached to the ALB security group and public subnets', async () => {
      const { config, network, secrets, email, dns, database } = await setup();
      buildContainer(
        config,
        network,
        secrets,
        database,
        email,
        dns.certificate,
        dns.certificateValidation,
        TEST_TAGS,
      );
      await flushResources();

      const alb = mocks.oneOfType('aws:lb/loadBalancer:LoadBalancer');
      expect(alb.inputs.loadBalancerType).toBe('application');
      expect(alb.inputs.ipAddressType).toBe('ipv4');
      expect(alb.inputs.enableHttp2).toBe(true);
    });

    it('truncates the ALB and target group names to AWS limit of 32 chars', async () => {
      const { config, network, secrets, email, dns, database } = await setup({
        namePrefix: 'fortressauth-very-long-stack-name-xxx',
      });
      buildContainer(
        config,
        network,
        secrets,
        database,
        email,
        dns.certificate,
        dns.certificateValidation,
        TEST_TAGS,
      );
      await flushResources();

      const alb = mocks.oneOfType('aws:lb/loadBalancer:LoadBalancer');
      expect((alb.inputs.name as string).length).toBeLessThanOrEqual(32);
      const tg = mocks.oneOfType('aws:lb/targetGroup:TargetGroup');
      expect((tg.inputs.name as string).length).toBeLessThanOrEqual(32);
    });

    it('enables ALB deletion protection in production stacks', async () => {
      const { config, network, secrets, email, dns, database } = await setup({
        dbDeletionProtection: true,
      });
      buildContainer(
        config,
        network,
        secrets,
        database,
        email,
        dns.certificate,
        dns.certificateValidation,
        TEST_TAGS,
      );
      await flushResources();

      const alb = mocks.oneOfType('aws:lb/loadBalancer:LoadBalancer');
      expect(alb.inputs.enableDeletionProtection).toBe(true);
    });
  });

  describe('Target group health check', () => {
    it('targets /health on the configured container port with sane thresholds', async () => {
      const { config, network, secrets, email, dns, database } = await setup({
        containerPort: 8080,
      });
      buildContainer(
        config,
        network,
        secrets,
        database,
        email,
        dns.certificate,
        dns.certificateValidation,
        TEST_TAGS,
      );
      await flushResources();

      const tg = mocks.oneOfType('aws:lb/targetGroup:TargetGroup');
      expect(tg.inputs.port).toBe(8080);
      expect(tg.inputs.protocol).toBe('HTTP');
      expect(tg.inputs.targetType).toBe('ip');
      expect(tg.inputs.healthCheck).toMatchObject({
        path: '/health',
        protocol: 'HTTP',
        matcher: '200',
        interval: 30,
        timeout: 5,
        healthyThreshold: 2,
        unhealthyThreshold: 3,
      });
      expect(tg.inputs.deregistrationDelay).toBe(30);
    });
  });

  describe('Listeners', () => {
    it('with no certificate (bootstrap), the HTTP listener forwards to the target group', async () => {
      const { config, network, secrets, email, database } = await setup();
      // Pass undefined cert + validation to simulate bootstrap mode.
      buildContainer(config, network, secrets, database, email, undefined, undefined, TEST_TAGS);
      await flushResources();

      const listeners = mocks.byType('aws:lb/listener:Listener');
      expect(listeners).toHaveLength(1);
      expect(listeners[0]?.inputs.protocol).toBe('HTTP');
      expect(listeners[0]?.inputs.defaultActions[0].type).toBe('forward');
    });

    it('with a certificate, creates HTTP→HTTPS redirect AND HTTPS forward listeners', async () => {
      const { config, network, secrets, email, dns, database } = await setup();
      buildContainer(
        config,
        network,
        secrets,
        database,
        email,
        dns.certificate,
        dns.certificateValidation,
        TEST_TAGS,
      );
      await flushResources();

      const listeners = mocks.byType('aws:lb/listener:Listener');
      expect(listeners).toHaveLength(2);

      const httpListener = listeners.find((l) => l.inputs.protocol === 'HTTP');
      expect(httpListener?.inputs.defaultActions[0]).toMatchObject({
        type: 'redirect',
        redirect: { port: '443', protocol: 'HTTPS', statusCode: 'HTTP_301' },
      });

      const httpsListener = listeners.find((l) => l.inputs.protocol === 'HTTPS');
      expect(httpsListener?.inputs.port).toBe(443);
      expect(httpsListener?.inputs.sslPolicy).toBe('ELBSecurityPolicy-TLS13-1-2-2021-06');
      expect(httpsListener?.inputs.defaultActions[0]).toMatchObject({ type: 'forward' });
    });
  });

  describe('Task definition', () => {
    async function getContainerDefinition(configOverrides: Parameters<typeof makeConfig>[0] = {}) {
      const { config, network, secrets, email, dns, database } = await setup(configOverrides);
      buildContainer(
        config,
        network,
        secrets,
        database,
        email,
        dns.certificate,
        dns.certificateValidation,
        TEST_TAGS,
      );
      await flushResources();

      const taskDef = mocks.oneOfType('aws:ecs/taskDefinition:TaskDefinition');
      // Pulumi resolves the Output<string> to a string by the time the mock
      // sees it, so we don't need to apply() here.
      const raw = taskDef.inputs.containerDefinitions;
      const containerJson = typeof raw === 'string' ? raw : await resolveOutput(raw);
      return { taskDef, parsed: JSON.parse(containerJson)[0] };
    }

    it('uses the configured CPU, memory, and image', async () => {
      const { taskDef, parsed } = await getContainerDefinition({
        taskCpu: 1024,
        taskMemoryMib: 2048,
        appImage: '12345.dkr.ecr.eu-west-1.amazonaws.com/repo:abc',
      });
      expect(taskDef.inputs.cpu).toBe('1024');
      expect(taskDef.inputs.memory).toBe('2048');
      expect(taskDef.inputs.requiresCompatibilities).toEqual(['FARGATE']);
      expect(taskDef.inputs.networkMode).toBe('awsvpc');
      expect(taskDef.inputs.runtimePlatform).toEqual({
        operatingSystemFamily: 'LINUX',
        cpuArchitecture: 'X86_64',
      });
      expect(parsed.image).toBe('12345.dkr.ecr.eu-west-1.amazonaws.com/repo:abc');
    });

    it('emits container env that includes NODE_ENV=production and BASE_URL', async () => {
      const { parsed } = await getContainerDefinition({
        frontendBaseUrl: 'https://app.example.com',
      });
      const env = parsed.environment as Array<{ name: string; value: string }>;
      const lookup = (k: string) => env.find((e) => e.name === k)?.value;

      expect(lookup('NODE_ENV')).toBe('production');
      expect(lookup('BASE_URL')).toBe('https://app.example.com');
      expect(lookup('PORT')).toBe('3000');
      expect(lookup('HOST')).toBe('0.0.0.0');
      expect(lookup('COOKIE_SECURE')).toBe('true');
      expect(lookup('CSRF_COOKIE_SECURE')).toBe('true');
    });

    it('honors operator-supplied appEnv and overrides built-in defaults of the same key', async () => {
      // appEnv sets EMAIL_PROVIDER explicitly; the built-in default for that
      // var must NOT also appear (would be ambiguous in ECS).
      const { parsed } = await getContainerDefinition({
        appEnv: { EMAIL_PROVIDER: 'resend', LOG_LEVEL: 'debug' },
      });
      const env = parsed.environment as Array<{ name: string; value: string }>;
      const emailProviderEntries = env.filter((e) => e.name === 'EMAIL_PROVIDER');
      expect(emailProviderEntries).toHaveLength(1);
      expect(emailProviderEntries[0]?.value).toBe('resend');

      const logLevelEntries = env.filter((e) => e.name === 'LOG_LEVEL');
      expect(logLevelEntries).toHaveLength(1);
      expect(logLevelEntries[0]?.value).toBe('debug');
    });

    it('emits container secrets for DATABASE_URL, DB_PASSWORD, and each declared secret env key', async () => {
      const { parsed } = await getContainerDefinition({
        secretEnvKeys: ['RESEND_API_KEY', 'GOOGLE_CLIENT_SECRET'],
      });
      const secrets = parsed.secrets as Array<{ name: string; valueFrom: string }>;
      const names = secrets.map((s) => s.name);
      expect(names).toContain('DATABASE_URL');
      expect(names).toContain('DB_PASSWORD');
      expect(names).toContain('RESEND_API_KEY');
      expect(names).toContain('GOOGLE_CLIENT_SECRET');
    });

    it('uses the awslogs driver pointed at the new log group', async () => {
      const { parsed } = await getContainerDefinition();
      expect(parsed.logConfiguration.logDriver).toBe('awslogs');
      expect(parsed.logConfiguration.options['awslogs-group']).toBe('/ecs/fortressauth-dev');
      expect(parsed.logConfiguration.options['awslogs-stream-prefix']).toBe('app');
    });

    it('configures a wget-based healthcheck pointing at /health on the container port', async () => {
      const { parsed } = await getContainerDefinition({ containerPort: 4000 });
      expect(parsed.healthCheck.command).toEqual([
        'CMD-SHELL',
        'wget --no-verbose --tries=1 --spider http://localhost:4000/health || exit 1',
      ]);
    });
  });

  describe('Fargate service', () => {
    it('uses public subnets with assignPublicIp because there are no NAT gateways', async () => {
      const { config, network, secrets, email, dns, database } = await setup();
      buildContainer(
        config,
        network,
        secrets,
        database,
        email,
        dns.certificate,
        dns.certificateValidation,
        TEST_TAGS,
      );
      await flushResources();

      const service = mocks.oneOfType('awsx:ecs:FargateService');
      expect(service.inputs.networkConfiguration.assignPublicIp).toBe(true);
    });

    it('exposes deployment min/max healthy and ECS Exec', async () => {
      const { config, network, secrets, email, dns, database } = await setup({
        desiredCount: 3,
      });
      buildContainer(
        config,
        network,
        secrets,
        database,
        email,
        dns.certificate,
        dns.certificateValidation,
        TEST_TAGS,
      );
      await flushResources();

      const service = mocks.oneOfType('awsx:ecs:FargateService');
      expect(service.inputs.desiredCount).toBe(3);
      expect(service.inputs.deploymentMinimumHealthyPercent).toBe(50);
      expect(service.inputs.deploymentMaximumPercent).toBe(200);
      expect(service.inputs.healthCheckGracePeriodSeconds).toBe(60);
      expect(service.inputs.enableExecuteCommand).toBe(true);
    });
  });
});
