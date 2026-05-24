import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';
import * as pulumi from '@pulumi/pulumi';

import type { ResolvedConfig } from './config';
import type { DatabaseResources } from './database';
import type { EmailResources } from './email';
import type { NetworkResources } from './network';
import type { SecretsResources } from './secrets';

export interface ContainerResources {
  readonly cluster: aws.ecs.Cluster;
  readonly service: awsx.ecs.FargateService;
  readonly alb: aws.lb.LoadBalancer;
  readonly targetGroup: aws.lb.TargetGroup;
  readonly httpsListener?: aws.lb.Listener;
  readonly logGroup: aws.cloudwatch.LogGroup;
  readonly executionRole: aws.iam.Role;
  readonly taskRole: aws.iam.Role;
}

const ECS_TASK_TRUST = JSON.stringify({
  Version: '2012-10-17',
  Statement: [
    {
      Effect: 'Allow',
      Principal: { Service: 'ecs-tasks.amazonaws.com' },
      Action: 'sts:AssumeRole',
    },
  ],
});

export function buildContainer(
  config: ResolvedConfig,
  network: NetworkResources,
  secrets: SecretsResources,
  database: DatabaseResources,
  email: EmailResources,
  certificate: aws.acm.Certificate | undefined,
  certificateValidation: aws.acm.CertificateValidation | undefined,
  tags: Record<string, string>,
): ContainerResources {
  const logGroup = new aws.cloudwatch.LogGroup(`${config.namePrefix}-logs`, {
    name: `/ecs/${config.namePrefix}`,
    retentionInDays: config.logRetentionDays,
    tags: { ...tags, Component: 'logs' },
  });

  const executionRole = new aws.iam.Role(`${config.namePrefix}-exec-role`, {
    name: `${config.namePrefix}-task-execution`,
    assumeRolePolicy: ECS_TASK_TRUST,
    tags: { ...tags, Component: 'iam' },
  });

  new aws.iam.RolePolicyAttachment(`${config.namePrefix}-exec-managed`, {
    role: executionRole.name,
    policyArn: 'arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy',
  });

  const secretArns = pulumi
    .all([
      database.databaseUrlSecretArn,
      secrets.dbPasswordSecret.arn,
      ...secrets.appSecretEnvSecrets.map((entry) => entry.arn),
    ])
    .apply((arns) => arns);

  new aws.iam.RolePolicy(`${config.namePrefix}-exec-secrets`, {
    role: executionRole.id,
    policy: secretArns.apply((arns) =>
      JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: ['secretsmanager:GetSecretValue', 'secretsmanager:DescribeSecret'],
            Resource: arns,
          },
        ],
      }),
    ),
  });

  const taskRole = new aws.iam.Role(`${config.namePrefix}-task-role`, {
    name: `${config.namePrefix}-task`,
    assumeRolePolicy: ECS_TASK_TRUST,
    tags: { ...tags, Component: 'iam' },
  });

  new aws.iam.RolePolicy(`${config.namePrefix}-task-ses`, {
    role: taskRole.id,
    policy: pulumi
      .all([email.configurationSet.configurationSetName] as const)
      .apply(([configSetName]) =>
        JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Action: ['ses:SendEmail', 'ses:SendRawEmail'],
              Resource: '*',
              Condition: {
                StringEquals: {
                  'ses:FromAddress': config.sesFromAddress,
                },
                ...(configSetName
                  ? {
                      StringEqualsIfExists: {
                        'ses:configuration-set': configSetName,
                      },
                    }
                  : {}),
              },
            },
          ],
        }),
      ),
  });

  // Allow ECS Exec for break-glass debugging via Session Manager.
  new aws.iam.RolePolicy(`${config.namePrefix}-task-exec`, {
    role: taskRole.id,
    policy: JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: [
            'ssmmessages:CreateControlChannel',
            'ssmmessages:CreateDataChannel',
            'ssmmessages:OpenControlChannel',
            'ssmmessages:OpenDataChannel',
          ],
          Resource: '*',
        },
      ],
    }),
  });

  const alb = new aws.lb.LoadBalancer(`${config.namePrefix}-alb`, {
    name: `${config.namePrefix}-alb`.slice(0, 32),
    loadBalancerType: 'application',
    securityGroups: [network.albSecurityGroup.id],
    subnets: network.publicSubnetIds,
    ipAddressType: 'ipv4',
    enableHttp2: true,
    enableDeletionProtection: config.dbDeletionProtection,
    tags: { ...tags, Component: 'alb' },
  });

  const targetGroup = new aws.lb.TargetGroup(`${config.namePrefix}-tg`, {
    name: `${config.namePrefix}-tg`.slice(0, 32),
    port: config.containerPort,
    protocol: 'HTTP',
    vpcId: network.vpc.vpcId,
    targetType: 'ip',
    deregistrationDelay: 30,
    healthCheck: {
      enabled: true,
      path: '/health',
      protocol: 'HTTP',
      port: 'traffic-port',
      matcher: '200',
      interval: 30,
      timeout: 5,
      healthyThreshold: 2,
      unhealthyThreshold: 3,
    },
    tags: { ...tags, Component: 'alb' },
  });

  // HTTP listener: in bootstrap mode (no certificate yet), forward HTTP
  // directly to the target group so health checks have somewhere to land.
  // After the cert is issued, the second apply switches this to a
  // redirect-to-HTTPS while the HTTPS listener takes over traffic.
  const httpListener = new aws.lb.Listener(`${config.namePrefix}-http-listener`, {
    loadBalancerArn: alb.arn,
    port: 80,
    protocol: 'HTTP',
    defaultActions: certificate
      ? [
          {
            type: 'redirect',
            redirect: {
              port: '443',
              protocol: 'HTTPS',
              statusCode: 'HTTP_301',
            },
          },
        ]
      : [
          {
            type: 'forward',
            targetGroupArn: targetGroup.arn,
          },
        ],
  });

  const httpsListener = certificate
    ? new aws.lb.Listener(
        `${config.namePrefix}-https-listener`,
        {
          loadBalancerArn: alb.arn,
          port: 443,
          protocol: 'HTTPS',
          sslPolicy: 'ELBSecurityPolicy-TLS13-1-2-2021-06',
          certificateArn: certificate.arn,
          defaultActions: [
            {
              type: 'forward',
              targetGroupArn: targetGroup.arn,
            },
          ],
        },
        certificateValidation ? { dependsOn: [certificateValidation] } : undefined,
      )
    : undefined;

  const cluster = new aws.ecs.Cluster(`${config.namePrefix}-cluster`, {
    name: `${config.namePrefix}-cluster`,
    settings: [{ name: 'containerInsights', value: 'enhanced' }],
    tags: { ...tags, Component: 'ecs' },
  });

  const containerEnv = pulumi.all([database.endpoint] as const).apply(([endpoint]) => {
    void endpoint;

    const baseEnv: Array<{ name: string; value: string }> = [
      { name: 'NODE_ENV', value: 'production' },
      { name: 'PORT', value: String(config.containerPort) },
      { name: 'HOST', value: '0.0.0.0' },
      { name: 'BASE_URL', value: config.frontendBaseUrl },
      { name: 'COOKIE_SECURE', value: 'true' },
      { name: 'COOKIE_SAMESITE', value: config.cookieSameSite },
      { name: 'CSRF_COOKIE_SECURE', value: 'true' },
      { name: 'CSRF_COOKIE_SAMESITE', value: config.csrfCookieSameSite },
      { name: 'METRICS_ENABLED', value: 'true' },
      { name: 'LOG_LEVEL', value: 'info' },
      { name: 'AWS_REGION', value: aws.config.region ?? 'eu-west-1' },
      { name: 'EMAIL_PROVIDER', value: config.appEnv.EMAIL_PROVIDER ?? 'ses' },
      { name: 'SES_REGION', value: aws.config.region ?? 'eu-west-1' },
      { name: 'SES_FROM_ADDRESS', value: config.sesFromAddress },
      { name: 'SES_FROM_NAME', value: config.sesFromName },
      { name: 'SES_CONFIGURATION_SET_NAME', value: config.sesConfigurationSetName },
      { name: 'EMAIL_FROM_ADDRESS', value: config.sesFromAddress },
      { name: 'EMAIL_FROM_NAME', value: config.sesFromName },
      { name: 'EMAIL_REPLY_TO', value: config.sesReplyToAddress },
    ];

    const appEnvEntries = Object.entries(config.appEnv)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, value]) => ({ name, value }));

    const appKeys = new Set(appEnvEntries.map((entry) => entry.name));
    const filteredBase = baseEnv.filter((entry) => !appKeys.has(entry.name));

    return [...filteredBase, ...appEnvEntries];
  });

  const containerSecrets = pulumi
    .all([
      database.databaseUrlSecretArn,
      secrets.dbPasswordSecret.arn,
      pulumi.all(secrets.appSecretEnvSecrets.map((entry) => entry.arn)),
    ] as const)
    .apply(([databaseUrlArn, dbPasswordArn, appSecretArns]) => {
      const list: Array<{ name: string; valueFrom: string }> = [
        { name: 'DATABASE_URL', valueFrom: databaseUrlArn },
        { name: 'DB_PASSWORD', valueFrom: dbPasswordArn },
      ];
      secrets.appSecretEnvSecrets.forEach((entry, index) => {
        list.push({ name: entry.name, valueFrom: appSecretArns[index] });
      });
      return list;
    });

  const containerDefinition = pulumi
    .all([logGroup.name, containerEnv, containerSecrets] as const)
    .apply(([logGroupName, envList, secretsList]) =>
      JSON.stringify([
        {
          name: 'app',
          image: config.appImage,
          essential: true,
          portMappings: [
            {
              containerPort: config.containerPort,
              hostPort: config.containerPort,
              protocol: 'tcp',
            },
          ],
          environment: envList,
          secrets: secretsList,
          readonlyRootFilesystem: false,
          ulimits: [{ name: 'nofile', softLimit: 65536, hardLimit: 65536 }],
          logConfiguration: {
            logDriver: 'awslogs',
            options: {
              'awslogs-group': logGroupName,
              'awslogs-region': aws.config.region ?? 'eu-west-1',
              'awslogs-stream-prefix': 'app',
            },
          },
          healthCheck: {
            command: [
              'CMD-SHELL',
              `wget --no-verbose --tries=1 --spider http://localhost:${config.containerPort}/health || exit 1`,
            ],
            interval: 30,
            timeout: 5,
            retries: 3,
            startPeriod: 30,
          },
        },
      ]),
    );

  const taskDefinition = new aws.ecs.TaskDefinition(`${config.namePrefix}-task`, {
    family: `${config.namePrefix}-app`,
    cpu: String(config.taskCpu),
    memory: String(config.taskMemoryMib),
    networkMode: 'awsvpc',
    requiresCompatibilities: ['FARGATE'],
    runtimePlatform: {
      operatingSystemFamily: 'LINUX',
      cpuArchitecture: 'X86_64',
    },
    executionRoleArn: executionRole.arn,
    taskRoleArn: taskRole.arn,
    containerDefinitions: containerDefinition,
    tags: { ...tags, Component: 'ecs' },
  });

  const service = new awsx.ecs.FargateService(
    `${config.namePrefix}-service`,
    {
      cluster: cluster.arn,
      desiredCount: config.desiredCount,
      taskDefinitionArgs: undefined,
      taskDefinition: taskDefinition.arn,
      enableExecuteCommand: true,
      networkConfiguration: {
        assignPublicIp: true,
        subnets: network.publicSubnetIds,
        securityGroups: [network.serviceSecurityGroup.id],
      },
      loadBalancers: [
        {
          targetGroupArn: targetGroup.arn,
          containerName: 'app',
          containerPort: config.containerPort,
        },
      ],
      deploymentMinimumHealthyPercent: 50,
      deploymentMaximumPercent: 200,
      healthCheckGracePeriodSeconds: 60,
      tags: { ...tags, Component: 'ecs' },
    },
    { dependsOn: httpsListener ? [httpsListener] : [httpListener] },
  );

  return {
    cluster,
    service,
    alb,
    targetGroup,
    ...(httpsListener ? { httpsListener } : {}),
    logGroup,
    executionRole,
    taskRole,
  };
}
