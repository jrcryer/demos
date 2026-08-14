import { Template } from 'aws-cdk-lib/assertions';
import { createTestStacks, templateJson } from './helpers';

describe('StatelessStack', () => {
  const { stateless } = createTestStacks();
  const template = Template.fromStack(stateless);

  it('creates a single Lambda function', () => {
    template.resourceCountIs('AWS::Lambda::Function', 1);
  });

  it('runs the function on the expected runtime and architecture', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs22.x',
      Architectures: ['arm64'],
      Handler: 'index.handler',
    });
  });

  it('creates an explicit log group for the function', () => {
    template.resourceCountIs('AWS::Logs::LogGroup', 1);
  });

  it('matches the snapshot', () => {
    expect(templateJson(stateless)).toMatchSnapshot();
  });
});
