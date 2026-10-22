import * as gcp from '@pulumi/gcp';
import * as pulumi from '@pulumi/pulumi';

import type { ResolvedConfig } from './config';
import type { RegistryResources } from './registry';
import type { RuntimeResources } from './secrets';

const GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';

export interface GithubDeployResources {
  readonly pool: gcp.iam.WorkloadIdentityPool;
  readonly provider: gcp.iam.WorkloadIdentityPoolProvider;
  readonly deployer: gcp.serviceaccount.Account;
}

/** The condition GitHub's OIDC token must meet before Google accepts it. */
export function githubAttributeCondition(repository: string, environment: string): string {
  return `assertion.repository == "${repository}" && assertion.environment == "${environment}"`;
}

/**
 * Lets the Deploy Cloud Run workflow push images and roll out revisions with
 * no long-lived key. GitHub's OIDC token is exchanged through Workload
 * Identity Federation for a short-lived token of the deployer account. Only
 * jobs in `githubRepository` running in the `githubEnvironment` GitHub
 * environment qualify, so the environment's branch rules decide who deploys.
 *
 * The deployer can push to this one repository, update Cloud Run services,
 * and run them as the runtime account. It has no other roles.
 */
export function buildGithubDeploy(
  config: ResolvedConfig,
  runtime: RuntimeResources,
  registry: RegistryResources,
  dependsOn: pulumi.Resource[],
): GithubDeployResources {
  const pool = new gcp.iam.WorkloadIdentityPool(
    `${config.namePrefix}-github-pool`,
    {
      project: config.project,
      workloadIdentityPoolId: 'github-actions',
      displayName: 'GitHub Actions',
      description: `Deploys from ${config.githubRepository}`,
    },
    { dependsOn },
  );

  const provider = new gcp.iam.WorkloadIdentityPoolProvider(`${config.namePrefix}-github-oidc`, {
    project: config.project,
    workloadIdentityPoolId: pool.workloadIdentityPoolId,
    workloadIdentityPoolProviderId: 'github',
    displayName: 'GitHub',
    attributeMapping: {
      'google.subject': 'assertion.sub',
      'attribute.repository': 'assertion.repository',
      'attribute.environment': 'assertion.environment',
      'attribute.ref': 'assertion.ref',
    },
    attributeCondition: githubAttributeCondition(config.githubRepository, config.githubEnvironment),
    oidc: { issuerUri: GITHUB_OIDC_ISSUER },
  });

  const deployer = new gcp.serviceaccount.Account(
    `${config.namePrefix}-deployer`,
    {
      project: config.project,
      accountId: `${config.serviceName}-deploy`.slice(0, 30),
      displayName: 'FortressAuth GitHub Actions deployer',
    },
    { dependsOn },
  );

  new gcp.serviceaccount.IAMMember(`${config.namePrefix}-deployer-from-github`, {
    serviceAccountId: deployer.name,
    role: 'roles/iam.workloadIdentityUser',
    member: pulumi.interpolate`principalSet://iam.googleapis.com/${pool.name}/attribute.repository/${config.githubRepository}`,
  });

  new gcp.projects.IAMMember(`${config.namePrefix}-deployer-run`, {
    project: config.project,
    role: 'roles/run.developer',
    member: deployer.member,
  });

  new gcp.artifactregistry.RepositoryIamMember(`${config.namePrefix}-deployer-push`, {
    project: config.project,
    location: config.region,
    repository: registry.repository.name,
    role: 'roles/artifactregistry.writer',
    member: deployer.member,
  });

  new gcp.serviceaccount.IAMMember(`${config.namePrefix}-deployer-act-as-runtime`, {
    serviceAccountId: runtime.serviceAccount.name,
    role: 'roles/iam.serviceAccountUser',
    member: deployer.member,
  });

  return { pool, provider, deployer };
}
