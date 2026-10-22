import * as gcp from '@pulumi/gcp';

import { enableApis } from './apis';
import { buildBudget } from './budget';
import { COMMON_LABELS, loadConfig } from './config';
import { buildDomains } from './domains';
import { buildGithubDeploy } from './github';
import { buildRegistry } from './registry';
import { buildRuntime } from './secrets';
import { buildService } from './service';

const config = loadConfig();
const labels = COMMON_LABELS(config.stack);

const apis = enableApis(config);
const projectNumber = gcp.organizations.getProjectOutput({ projectId: config.project }).number;

const registry = buildRegistry(config, labels, apis);
const runtime = buildRuntime(config, labels, apis);
const api = buildService(config, runtime, labels, apis);
const domains = buildDomains(config, api);
const github = buildGithubDeploy(config, runtime, registry, apis);
const budget = buildBudget(config, projectNumber, apis);

export const region = config.region;
export const serviceName = api.service.name;
export const serviceUrl = api.service.uri;
export const imageName = registry.imageName;
export const runtimeServiceAccount = runtime.serviceAccount.email;
export const deployServiceAccount = github.deployer.email;
export const workloadIdentityProvider = github.provider.name;
export const dnsRecords = domains.dnsRecords;
export const budgetName = budget?.name;
