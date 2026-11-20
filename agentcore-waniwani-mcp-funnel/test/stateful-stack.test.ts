import { Match, Template } from 'aws-cdk-lib/assertions';
import { createTestStacks, templateJson } from './helpers';

describe('StatefulStack', () => {
  const { stateful } = createTestStacks();
  const template = Template.fromStack(stateful);

  it('creates the flow state table with a TTL attribute', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
      BillingMode: 'PAY_PER_REQUEST',
      TimeToLiveSpecification: { AttributeName: 'ttl', Enabled: true },
    });
  });

  it('creates the leads table keyed by lead id', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      KeySchema: [{ AttributeName: 'leadId', KeyType: 'HASH' }],
    });
  });

  it('creates a confidential client limited to the client-credentials grant', () => {
    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      GenerateSecret: true,
      AllowedOAuthFlows: ['client_credentials'],
      AllowedOAuthScopes: [Match.objectLike({ 'Fn::Join': Match.anyValue() })],
    });
  });

  it('disables self sign-up', () => {
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
    });
  });

  it('matches the snapshot', () => {
    expect(templateJson(stateful)).toMatchSnapshot();
  });
});
