# Lambda Durable Functions Order Workflow

Durable, resumable order-fulfilment workflows on AWS Lambda, deployed with the AWS CDK.

> [!NOTE]
> This is a prototype scaffold. The stacks deploy a minimal, working placeholder
> (one DynamoDB table, one Lambda function and its log group) so that the real
> architecture can be built on top of a deployable baseline.

## Architecture

![Architecture diagram](docs/images/architecture.png)

_Add the architecture diagram to `docs/images/architecture.png`._

The infrastructure is split into two stacks, following the stateful/stateless
pattern:

| Stack                              | Contents                                                        |
| ---------------------------------- | --------------------------------------------------------------- |
| `lambda-durable-functions-order-workflow-stateful-<env>`       | Data that must survive a redeploy — the DynamoDB table.          |
| `lambda-durable-functions-order-workflow-stateless-<env>`      | Compute and glue — the Lambda function and its CloudWatch group. |

## Prerequisites

- [Node.js](https://nodejs.org/) 20 or later and npm 10 or later
- An AWS account and credentials available to the AWS CLI / SDK
- The target account and region [bootstrapped for CDK v2](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping.html)

## Deploy

```bash
git clone https://github.com/aws-samples/lambda-durable-functions-order-workflow.git
cd lambda-durable-functions-order-workflow

npm ci

# One-time per account/region.
npx cdk bootstrap

npx cdk deploy --all
```

Deploy the production configuration by passing the environment through CDK
context:

```bash
npx cdk deploy --all -c env=prod
```

Environment-specific settings (log retention, removal policy, point-in-time
recovery, Lambda sizing) live in `lib/shared/config.ts`.

## Project structure

```text
bin/lambda-durable-functions-order-workflow.ts        CDK app entry point
lib/stateful-stack.ts     Stateful resources (DynamoDB table)
lib/stateless-stack.ts    Stateless resources (Lambda function, log group)
lib/shared/config.ts      Per-environment configuration (dev/prod)
src/handlers/             Lambda handlers, bundled with esbuild
test/                     Jest tests, including CDK assertions snapshots
docs/images/              Architecture diagrams
```

## Useful commands

| Command                | Description                                     |
| ---------------------- | ----------------------------------------------- |
| `npm run build`        | Type-check and compile the TypeScript sources    |
| `npm test`             | Run the Jest test suite                          |
| `npm run lint`         | Run ESLint                                       |
| `npm run synth`        | Synthesize the CloudFormation templates          |
| `npm run deploy`       | Deploy all stacks                                |
| `npm run destroy`      | Destroy all stacks                               |

Snapshot tests are updated with `npm test -- -u`.

## CI/CD

Two GitHub Actions workflows are included:

- `.github/workflows/ci.yml` — on pull requests: install, lint, test, `cdk synth`.
- `.github/workflows/deploy.yml` — on push to `main`: assume an AWS role via
  OIDC and run `cdk deploy --all --require-approval never`.

The deploy workflow expects two repository variables:

| Variable              | Example                                          |
| --------------------- | ------------------------------------------------ |
| `AWS_DEPLOY_ROLE_ARN` | `arn:aws:iam::123456789012:role/github-deploy`    |
| `AWS_REGION`          | `us-east-1`                                       |

The role must trust the GitHub OIDC provider and be able to assume the CDK
bootstrap roles in the target account.

## Cleanup

Avoid ongoing charges by destroying the stacks when you are finished:

```bash
npx cdk destroy --all
```

In `prod` the DynamoDB table is created with a `RETAIN` removal policy, so it
survives stack deletion and must be removed manually if it is no longer needed.

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more
information.

## License

This library is licensed under the MIT-0 License. See the [LICENSE](LICENSE)
file.
