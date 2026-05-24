import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';
import type * as pulumi from '@pulumi/pulumi';

import type { ResolvedConfig } from './config';

export interface NetworkResources {
  readonly vpc: awsx.ec2.Vpc;
  readonly publicSubnetIds: pulumi.Output<string[]>;
  readonly privateSubnetIds: pulumi.Output<string[]>;
  readonly albSecurityGroup: aws.ec2.SecurityGroup;
  readonly serviceSecurityGroup: aws.ec2.SecurityGroup;
  readonly databaseSecurityGroup: aws.ec2.SecurityGroup;
}

export function buildNetwork(
  config: ResolvedConfig,
  tags: Record<string, string>,
): NetworkResources {
  const vpc = new awsx.ec2.Vpc(`${config.namePrefix}-vpc`, {
    cidrBlock: config.vpcCidr,
    numberOfAvailabilityZones: config.availabilityZones,
    // Skip NAT gateway by giving each AZ a public + private subnet but routing
    // private subnets through the IGW only via tasks placed in public subnets
    // with assignPublicIp=true. RDS lives in the private subnets without an
    // egress route, which is fine because RDS does not need outbound internet.
    natGateways: { strategy: 'None' },
    enableDnsHostnames: true,
    enableDnsSupport: true,
    subnetSpecs: [
      { type: 'Public', cidrMask: 24, name: 'public' },
      { type: 'Private', cidrMask: 24, name: 'private' },
    ],
    tags,
  });

  const albSecurityGroup = new aws.ec2.SecurityGroup(`${config.namePrefix}-alb-sg`, {
    vpcId: vpc.vpcId,
    description: 'FortressAuth ALB ingress (443/80) and unrestricted egress',
    ingress: [
      {
        description: 'HTTPS from anywhere',
        protocol: 'tcp',
        fromPort: 443,
        toPort: 443,
        cidrBlocks: ['0.0.0.0/0'],
        ipv6CidrBlocks: ['::/0'],
      },
      {
        description: 'HTTP from anywhere for ACM HTTP-01 fallbacks and redirect to HTTPS',
        protocol: 'tcp',
        fromPort: 80,
        toPort: 80,
        cidrBlocks: ['0.0.0.0/0'],
        ipv6CidrBlocks: ['::/0'],
      },
    ],
    egress: [
      {
        description: 'All egress',
        protocol: '-1',
        fromPort: 0,
        toPort: 0,
        cidrBlocks: ['0.0.0.0/0'],
        ipv6CidrBlocks: ['::/0'],
      },
    ],
    tags: { ...tags, Component: 'alb' },
  });

  const serviceSecurityGroup = new aws.ec2.SecurityGroup(`${config.namePrefix}-svc-sg`, {
    vpcId: vpc.vpcId,
    description: 'FortressAuth ECS service: ingress from ALB only, all egress',
    ingress: [
      {
        description: 'App port from ALB',
        protocol: 'tcp',
        fromPort: config.containerPort,
        toPort: config.containerPort,
        securityGroups: [albSecurityGroup.id],
      },
    ],
    egress: [
      {
        description: 'All egress (RDS, SES API, ECR, CloudWatch, OAuth providers)',
        protocol: '-1',
        fromPort: 0,
        toPort: 0,
        cidrBlocks: ['0.0.0.0/0'],
        ipv6CidrBlocks: ['::/0'],
      },
    ],
    tags: { ...tags, Component: 'service' },
  });

  const databaseSecurityGroup = new aws.ec2.SecurityGroup(`${config.namePrefix}-db-sg`, {
    vpcId: vpc.vpcId,
    description: 'FortressAuth RDS: ingress from service SG only',
    ingress: [
      {
        description: 'PostgreSQL from ECS service',
        protocol: 'tcp',
        fromPort: 5432,
        toPort: 5432,
        securityGroups: [serviceSecurityGroup.id],
      },
    ],
    egress: [],
    tags: { ...tags, Component: 'database' },
  });

  return {
    vpc,
    publicSubnetIds: vpc.publicSubnetIds,
    privateSubnetIds: vpc.privateSubnetIds,
    albSecurityGroup,
    serviceSecurityGroup,
    databaseSecurityGroup,
  };
}
