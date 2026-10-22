import * as gcp from '@pulumi/gcp';

import type { ResolvedConfig } from './config';

export const REQUIRED_APIS = [
  'run.googleapis.com',
  'artifactregistry.googleapis.com',
  'secretmanager.googleapis.com',
  'iam.googleapis.com',
  'iamcredentials.googleapis.com',
  'sts.googleapis.com',
] as const;

export const BUDGET_API = 'billingbudgets.googleapis.com';

/**
 * Turns on the Google APIs the stack uses. Enabling an API is free. They stay
 * on after `pulumi destroy`, so tearing down never breaks anything else in
 * the project that happens to use them.
 */
export function enableApis(config: ResolvedConfig): gcp.projects.Service[] {
  const apis: string[] = [...REQUIRED_APIS];
  if (config.budget !== undefined) {
    apis.push(BUDGET_API);
  }
  return apis.map(
    (service) =>
      new gcp.projects.Service(`${config.namePrefix}-api-${service.split('.')[0]}`, {
        project: config.project,
        service,
        disableOnDestroy: false,
        disableDependentServices: false,
      }),
  );
}
