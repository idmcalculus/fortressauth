import * as gcp from '@pulumi/gcp';
import * as pulumi from '@pulumi/pulumi';

import type { ResolvedConfig } from './config';

/**
 * An email alert, sent to the billing account's admins, when this project
 * spends anything near `budgetAmount` a month. It counts spend before
 * credits, so Google's free-trial credit cannot hide a real charge. Created
 * only when `billingAccountId` is set.
 *
 * The Budgets API needs a quota project when Pulumi runs on user
 * credentials, hence the dedicated provider with `userProjectOverride`.
 */
export function buildBudget(
  config: ResolvedConfig,
  projectNumber: pulumi.Input<string>,
  dependsOn: pulumi.Resource[],
): gcp.billing.Budget | undefined {
  const budget = config.budget;
  if (budget === undefined) {
    return undefined;
  }

  const billingProvider = new gcp.Provider(`${config.namePrefix}-billing-provider`, {
    project: config.project,
    region: config.region,
    userProjectOverride: true,
    billingProject: config.project,
  });

  return new gcp.billing.Budget(
    `${config.namePrefix}-budget`,
    {
      billingAccount: budget.billingAccountId,
      displayName: `${config.namePrefix} free-tier guard`,
      budgetFilter: {
        projects: [pulumi.interpolate`projects/${projectNumber}`],
        creditTypesTreatment: 'EXCLUDE_ALL_CREDITS',
      },
      amount: {
        specifiedAmount: { currencyCode: budget.currency, units: String(budget.amount) },
      },
      thresholdRules: [
        { thresholdPercent: 0.5 },
        { thresholdPercent: 1.0 },
        { thresholdPercent: 1.0, spendBasis: 'FORECASTED_SPEND' },
      ],
    },
    { provider: billingProvider, dependsOn },
  );
}
