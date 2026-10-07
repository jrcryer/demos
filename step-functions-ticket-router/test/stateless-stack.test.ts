import { Match, Template } from 'aws-cdk-lib/assertions';
import { AslDefinition, createTestStacks, stateMachineDefinition, templateJson } from './helpers';

describe('StatelessStack', () => {
  const { stateless } = createTestStacks();
  const template = Template.fromStack(stateless);

  const decisions = stateMachineDefinition(template, 'step-functions-ticket-router-dev-decisions');
  const claude = stateMachineDefinition(template, 'step-functions-ticket-router-dev-claude');

  it('creates one classifier function per provider', () => {
    template.resourceCountIs('AWS::Lambda::Function', 2);
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs22.x',
      Architectures: ['arm64'],
      Environment: { Variables: Match.objectLike({ OPENAI_MODEL: 'gpt-6-luna' }) },
    });
    template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: {
        Variables: Match.objectLike({ CLAUDE_MODEL: 'anthropic.claude-opus-5-5' }),
      },
    });
  });

  it('lets the Claude function call the Bedrock Mantle endpoint', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({ Action: 'bedrock-mantle:CreateInference', Effect: 'Allow' }),
        ]),
      },
    });
  });

  it('creates two express state machines', () => {
    template.resourceCountIs('AWS::StepFunctions::StateMachine', 2);
    template.allResourcesProperties('AWS::StepFunctions::StateMachine', {
      StateMachineType: 'EXPRESS',
    });
  });

  it('uses the same definition for both providers', () => {
    // Only the classifier Lambda differs, and references are flattened.
    expect(claude).toEqual(decisions);
  });

  describe('definition', () => {
    const definition: AslDefinition = decisions;
    const choice = definition.States['Route ticket'] as {
      Choices: Array<Record<string, unknown>>;
      Default: string;
    };

    it('classifies, records, then routes', () => {
      expect(definition.StartAt).toBe('Classify ticket');
      expect(definition.States['Classify ticket'].Next).toBe('Record decision');
      expect(definition.States['Record decision'].Next).toBe('Route ticket');
    });

    it('sends classification failures to human review', () => {
      expect(definition.States['Classify ticket'].Catch).toEqual([
        expect.objectContaining({ ErrorEquals: ['States.ALL'], Next: 'Send to human review' }),
      ]);
    });

    it('checks escalation rules before routing to a queue', () => {
      const targets = choice.Choices.map((rule) => rule.Next);
      expect(targets.slice(0, 3)).toEqual([
        'Send to human review',
        'Send to human review',
        'Send to human review',
      ]);
      expect(targets.slice(3)).toEqual([
        'Send to billing',
        'Send to technical',
        'Send to account_access',
      ]);
      expect(choice.Default).toBe('Send to general');
    });

    it('only applies the confidence rule when a confidence is present', () => {
      expect(choice.Choices[2]).toMatchObject({
        And: [
          { Variable: '$.decision.routeConfidence', IsNumeric: true },
          { Variable: '$.decision.routeConfidence', NumericLessThan: 0.6 },
        ],
      });
    });
  });

  it('matches the snapshot', () => {
    expect(templateJson(stateless)).toMatchSnapshot();
  });
});
