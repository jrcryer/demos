import { App } from 'aws-cdk-lib';
import { getConfig } from '../lib/shared/config';

describe('getConfig', () => {
  it('deploys to eu-west-1 by default', () => {
    expect(getConfig(new App()).region).toBe('eu-west-1');
  });

  it('lets CDK context override the region', () => {
    const app = new App({ context: { region: 'us-east-1' } });
    expect(getConfig(app).region).toBe('us-east-1');
  });
});
