# Tearing down the AWS stacks

This removes both FortressAuth AWS stacks after the API has moved to Oracle
Cloud ([`deploy/oracle/README.md`](../../deploy/oracle/README.md)). Nothing
here runs on its own. Each `pulumi destroy` prints its plan and asks before
deleting anything; read the plan before you answer.

**What goes:** for dev and prod, the ALB, Fargate service, RDS instance, VPC
and its public IPv4 addresses, Secrets Manager secrets, CloudWatch logs,
Container Insights, ECR repository, ACM certificate, and the SES
configuration set and SNS topic. Together these cost about $131 a month.

**What stays:**

- The SES domain identity for `fortressauth.com`. It was made outside Pulumi,
  and the VM still sends mail through it.
- The SES sender IAM user from the Oracle README.
- The AWS accounts and the Organization.
- The GitHub OIDC deploy roles. They are free; step 7 removes them if you
  want.

## Before you start

- [ ] `api.fortressauth.com` has answered from the Oracle VM for a few days.
- [ ] Sign-in, OAuth sign-in and password-reset email all work there.
- [ ] The VM has a nightly backup, and you have restored one at least once.
- [ ] You have copied the secrets out:
      `scripts/aws-export-app-env.sh prod ./app.env.from-aws`. After the
      destroy, AWS keeps them for 7 days and then deletes them for good.
- [ ] Optional: a last copy of the prod data (Oracle README, section 6). The
      destroy also leaves a final RDS snapshot.

## 1. Stop AWS deploys

Otherwise the next push to `main` would deploy to AWS again:

```bash
gh workflow disable "Deploy AWS"
```

Delete `.github/workflows/deploy-aws.yml` in a later pull request.

## 2. Check which account you are in, every time

`pulumi destroy` works from the saved state and does not run the program,
so the account guard in `src/index.ts` does not protect it. With the wrong
credentials, Pulumi can fail to find the resources and drop them from state
while they keep running and billing. Check the account before each destroy.

## 3. Destroy dev

Dev has no deletion protection and skips the final snapshot, so its data goes
with it.

```bash
cd packages/infra-aws
export AWS_PROFILE=fortressauth-dev
aws sso login --profile fortressauth-dev
aws sts get-caller-identity --query Account --output text   # must print 552072248716
pulumi stack select idmcalculus/fortressauth-aws/dev
pulumi destroy
```

## 4. Turn off deletion protection on prod

Prod's RDS instance and ALB have deletion protection, and its ECR repository
refuses to delete while it holds images. The one `dbDeletionProtection` flag
controls all three. Change only those three resources: a full `pulumi up`
from your machine could also roll the service back to whatever image your
local `Pulumi.prod.yaml` names.

```bash
export AWS_PROFILE=fortressauth-prod
aws sso login --profile fortressauth-prod
aws sts get-caller-identity --query Account --output text   # must print 437040615654
pulumi stack select idmcalculus/fortressauth-aws/prod
pulumi config set fortressauth-aws:dbDeletionProtection false

# Confirm the three URNs:
pulumi stack --show-urns | grep -E 'rds/instance:Instance|lb/loadBalancer:LoadBalancer|ecr/repository:Repository'

TARGETS=(
  --target 'urn:pulumi:prod::fortressauth-aws::aws:rds/instance:Instance::fortressauth-prod-db'
  --target 'urn:pulumi:prod::fortressauth-aws::aws:lb/loadBalancer:LoadBalancer::fortressauth-prod-alb'
  --target 'urn:pulumi:prod::fortressauth-aws::aws:ecr/repository:Repository::fortressauth-prod-repo'
)
pulumi preview --diff "${TARGETS[@]}"
pulumi up "${TARGETS[@]}"
```

The preview should show three in-place updates and nothing else:
`deletionProtection`, `enableDeletionProtection` and `forceDelete`.

## 5. Destroy prod

```bash
aws sts get-caller-identity --query Account --output text   # still 437040615654
pulumi destroy
```

RDS takes a final snapshot, `fortressauth-prod-db-final-prod`, before it
deletes the instance. Expect 10 to 20 minutes.

## 6. Delete what AWS made outside Pulumi

AWS creates some log groups itself, and Pulumi does not track them. In each
account (switch `AWS_PROFILE` and check the account as above):

```bash
for prefix in /aws/rds/instance/fortressauth- /aws/ecs/containerinsights/fortressauth-; do
  aws logs describe-log-groups --log-group-name-prefix "${prefix}" \
    --query 'logGroups[].logGroupName' --output text
done
# Then, for each name printed:
aws logs delete-log-group --log-group-name <name>
```

Look for anything else still tagged for the project. Expect only the final
snapshot and secrets waiting for deletion:

```bash
aws resourcegroupstaggingapi get-resources \
  --tag-filters Key=Project,Values=fortressauth \
  --query 'ResourceTagMappingList[].ResourceARN' --output text
```

At your DNS provider, delete the ACM validation CNAMEs (the `_…` records under
`api` and `dev-api`) and the `dev-api.fortressauth.com` record.

The final snapshot costs a few cents a month. When you are sure you will not
need it, delete it:

```bash
aws rds delete-db-snapshot --db-snapshot-identifier fortressauth-prod-db-final-prod
```

## 7. Optional clean-up

- Delete the GitHub environments that held the AWS deploy settings:
  `gh api -X DELETE repos/idmcalculus/fortressauth/environments/aws-dev`, then
  the same for `aws-prod`.
- In each account, delete the `github-actions-fortressauth-deploy` role and
  the `token.actions.githubusercontent.com` OIDC provider that
  `scripts/aws-bootstrap.sh` created. They cost nothing, but they still grant
  deploy rights.
- Once a stack is empty, `pulumi stack rm` removes it and its history.

## 8. Watch the bill

In the management account (Jaydeetech, `275859940703`), go to **Billing and
Cost Management → Budgets → Create budget** and make a monthly cost budget of
$5 with an email alert. Under the advanced options, make sure **Credits** is
not ticked; otherwise the Activate credit hides real spending until it runs
out.

After the teardown, the only regular AWS charge should be a few cents for
SES. Kiro ($40 a month) is a separate subscription on its own promotional
credit, and none of this changes it.
