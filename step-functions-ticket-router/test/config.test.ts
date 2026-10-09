import { App } from 'aws-cdk-lib';
import { getConfig } from '../lib/shared/config';
import { foundationModelId } from '../src/shared/models';

describe('getConfig', () => {
  it('deploys to eu-west-1 by default', () => {
    expect(getConfig(new App()).region).toBe('eu-west-1');
  });

  it('lets CDK context override the region', () => {
    const app = new App({ context: { region: 'us-east-1' } });
    expect(getConfig(app).region).toBe('us-east-1');
  });
});

describe('foundationModelId', () => {
  it('strips inference profile prefixes', () => {
    expect(foundationModelId('global.anthropic.claude-opus-5-5')).toBe('anthropic.claude-opus-5-5');
    expect(foundationModelId('eu.anthropic.claude-opus-5-5')).toBe('anthropic.claude-opus-5-5');
    expect(foundationModelId('anthropic.claude-haiku-4-5')).toBe('anthropic.claude-haiku-4-5');
  });
});
