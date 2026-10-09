import { Template } from 'aws-cdk-lib/assertions';
import { createTestStacks, templateJson } from './helpers';

describe('StatefulStack', () => {
  const { stateful } = createTestStacks();
  const template = Template.fromStack(stateful);

  it('keys decisions by ticket and provider', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      BillingMode: 'PAY_PER_REQUEST',
      KeySchema: [
        { AttributeName: 'ticketId', KeyType: 'HASH' },
        { AttributeName: 'provider', KeyType: 'RANGE' },
      ],
    });
  });

  it('creates one queue per route plus human review', () => {
    template.resourceCountIs('AWS::SQS::Queue', 5);
  });

  it('creates the OpenAI secret with a placeholder, never a real key', () => {
    template.hasResourceProperties('AWS::SecretsManager::Secret', {
      SecretString: 'REPLACE_ME',
    });
  });

  it('matches the snapshot', () => {
    expect(templateJson(stateful)).toMatchSnapshot();
  });
});
