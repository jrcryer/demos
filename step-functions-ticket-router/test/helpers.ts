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
  const env = { account: '123456789012', region: 'eu-west-1' };

  const stateful = new StatefulStack(app, 'TestStatefulStack', { env, config });
  const stateless = new StatelessStack(app, 'TestStatelessStack', {
    env,
    config,
    decisionsTable: stateful.decisionsTable,
    openaiSecret: stateful.openaiSecret,
    queues: stateful.queues,
  });

  return { app, stateful, stateless };
}

/** Returns a state machine's ASL with CloudFormation references flattened to placeholders. */
export function stateMachineDefinition(template: Template, name: string): AslDefinition {
  const machines = template.findResources('AWS::StepFunctions::StateMachine', {
    Properties: { StateMachineName: name },
  });
  const [machine] = Object.values(machines) as Array<{
    Properties: { DefinitionString: { 'Fn::Join': [string, unknown[]] } };
  }>;
  const parts = machine.Properties.DefinitionString['Fn::Join'][1];
  return JSON.parse(parts.map((part) => (typeof part === 'string' ? part : 'REF')).join(''));
}

export interface AslDefinition {
  readonly StartAt: string;
  readonly States: Record<string, Record<string, unknown>>;
}
