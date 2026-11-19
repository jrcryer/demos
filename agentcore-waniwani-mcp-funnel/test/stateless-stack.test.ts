import { Match, Template } from 'aws-cdk-lib/assertions';
import { createTestStacks, templateJson } from './helpers';

describe('StatelessStack', () => {
  const { stateless } = createTestStacks();
  const template = Template.fromStack(stateless);

  it('hosts the MCP server on AgentCore Runtime behind a JWT authorizer', () => {
    template.resourceCountIs('AWS::BedrockAgentCore::Runtime', 1);
    template.hasResourceProperties('AWS::BedrockAgentCore::Runtime', {
      ProtocolConfiguration: 'MCP',
      AuthorizerConfiguration: {
        CustomJWTAuthorizer: {
          AllowedClients: Match.anyValue(),
          AllowedScopes: ['solar-quote/invoke'],
        },
      },
    });
  });

  it('gives the server its table and event bus, and no WaniWani key by default', () => {
    const runtimes = template.findResources('AWS::BedrockAgentCore::Runtime');
    const [runtime] = Object.values(runtimes);
    expect(Object.keys(runtime.Properties.EnvironmentVariables).sort()).toEqual([
      'ENVIRONMENT',
      'EVENT_BUS_NAME',
      'FLOW_STATE_TABLE_NAME',
    ]);
  });

  it('routes LeadCaptured events to the recorder with a dead-letter queue', () => {
    template.hasResourceProperties('AWS::Events::Rule', {
      EventPattern: { source: ['demo.solar-quote'], 'detail-type': ['LeadCaptured'] },
      Targets: [
        Match.objectLike({
          DeadLetterConfig: Match.anyValue(),
          RetryPolicy: { MaximumRetryAttempts: 3 },
        }),
      ],
    });
  });

  it('runs the lead recorder on the expected runtime and architecture', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs22.x',
      Architectures: ['arm64'],
      Handler: 'index.handler',
    });
  });

  it('matches the snapshot', () => {
    expect(templateJson(stateless)).toMatchSnapshot();
  });
});

describe('StatelessStack with a WaniWani Platform key', () => {
  const secretArn = 'arn:aws:secretsmanager:us-east-1:123456789012:secret:waniwani-AbCdEf';
  const { stateless } = createTestStacks({ waniwaniApiKeySecretArn: secretArn });
  const template = Template.fromStack(stateless);

  it('passes the secret ARN, not the key, to the server', () => {
    template.hasResourceProperties('AWS::BedrockAgentCore::Runtime', {
      EnvironmentVariables: Match.objectLike({ WANIWANI_API_KEY_SECRET_ARN: secretArn }),
    });
  });

  it('lets the runtime read that secret', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: Match.arrayWith(['secretsmanager:GetSecretValue']),
            Resource: secretArn,
          }),
        ]),
      },
    });
  });
});
