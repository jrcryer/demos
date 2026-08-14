import { Template } from 'aws-cdk-lib/assertions';
import { createTestStacks, templateJson } from './helpers';

describe('StatefulStack', () => {
  const { stateful } = createTestStacks();
  const template = Template.fromStack(stateful);

  it('creates a single DynamoDB table', () => {
    template.resourceCountIs('AWS::DynamoDB::Table', 1);
  });

  it('bills the table on demand', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      BillingMode: 'PAY_PER_REQUEST',
    });
  });

  it('matches the snapshot', () => {
    expect(templateJson(stateful)).toMatchSnapshot();
  });
});
