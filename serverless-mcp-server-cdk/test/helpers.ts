import { App, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { getConfig } from '../lib/shared/config';
import { StatefulStack } from '../lib/stateful-stack';
import { StatelessStack } from '../lib/stateless-stack';

const ASSET_HASH_PATTERN = /[a-f0-9]{64}/g;

/**
 * Asset hashes change whenever the bundler output changes, which would make the
 * snapshots churn for reasons unrelated to the infrastructure. Normalise them.
 */
export function templateJson(stack: Stack): unknown {
  const rendered = JSON.stringify(Template.fromStack(stack).toJSON());
  return JSON.parse(rendered.replace(ASSET_HASH_PATTERN, 'ASSET_HASH'));
}

export interface TestStacks {
  readonly app: App;
  readonly stateful: StatefulStack;
  readonly stateless: StatelessStack;
}

/** Synthesises both stacks with a fixed environment for deterministic tests. */
export function createTestStacks(): TestStacks {
  const app = new App({ context: { env: 'dev' } });
  const config = getConfig(app);
  const env = { account: '123456789012', region: 'us-east-1' };

  const stateful = new StatefulStack(app, 'TestStatefulStack', { env, config });
  const stateless = new StatelessStack(app, 'TestStatelessStack', {
    env,
    config,
    table: stateful.table,
  });

  return { app, stateful, stateless };
}
