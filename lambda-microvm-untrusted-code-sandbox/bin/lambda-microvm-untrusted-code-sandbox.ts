#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { APP_NAME, getConfig } from '../lib/shared/config';
import { StatefulStack } from '../lib/stateful-stack';
import { StatelessStack } from '../lib/stateless-stack';

const app = new cdk.App();
const config = getConfig(app);

const env: cdk.Environment = {
  account: config.account,
  region: config.region,
};

const stateful = new StatefulStack(app, `${APP_NAME}-stateful-${config.envName}`, {
  env,
  config,
  description: `Stateful resources for ${APP_NAME} (${config.envName})`,
});

new StatelessStack(app, `${APP_NAME}-stateless-${config.envName}`, {
  env,
  config,
  table: stateful.table,
  description: `Stateless resources for ${APP_NAME} (${config.envName})`,
});

cdk.Tags.of(app).add('project', APP_NAME);
cdk.Tags.of(app).add('environment', config.envName);
