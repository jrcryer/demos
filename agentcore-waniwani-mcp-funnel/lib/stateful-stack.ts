import { Aws, CfnOutput, Duration, Stack, StackProps } from 'aws-cdk-lib';
import {
  IUserPool,
  IUserPoolClient,
  OAuthScope,
  ResourceServerScope,
  UserPool,
} from 'aws-cdk-lib/aws-cognito';
import {
  AttributeType,
  BillingMode,
  ITable,
  Table,
  TableEncryption,
} from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { EnvironmentConfig, INVOKE_SCOPE_NAME, RESOURCE_SERVER_IDENTIFIER } from './shared/config';

export interface StatefulStackProps extends StackProps {
  readonly config: EnvironmentConfig;
}

/**
 * Stateful resources: anything whose lifecycle must outlive a deployment of the
 * application code — the tables and the identity provider.
 */
export class StatefulStack extends Stack {
  /** In-flight funnel state, one item per MCP session, expired by TTL. */
  public readonly flowStateTable: ITable;
  /** Leads captured by completed funnels. */
  public readonly leadsTable: ITable;
  public readonly userPool: IUserPool;
  /** Machine-to-machine client allowed to call the MCP server. */
  public readonly mcpClient: IUserPoolClient;

  constructor(scope: Construct, id: string, props: StatefulStackProps) {
    super(scope, id, props);

    const { config } = props;

    this.flowStateTable = new Table(this, 'FlowStateTable', {
      partitionKey: { name: 'pk', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      encryption: TableEncryption.AWS_MANAGED,
      timeToLiveAttribute: 'ttl',
      // Abandoned conversations are disposable in every environment.
      removalPolicy: config.removalPolicy,
    });

    this.leadsTable = new Table(this, 'LeadsTable', {
      partitionKey: { name: 'leadId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      encryption: TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: config.pointInTimeRecovery,
      },
      removalPolicy: config.removalPolicy,
    });

    const userPool = new UserPool(this, 'UserPool', {
      selfSignUpEnabled: false,
      removalPolicy: config.removalPolicy,
    });

    const invokeScope = new ResourceServerScope({
      scopeName: INVOKE_SCOPE_NAME,
      scopeDescription: 'Call the solar quote MCP server',
    });
    const resourceServer = userPool.addResourceServer('ResourceServer', {
      identifier: RESOURCE_SERVER_IDENTIFIER,
      scopes: [invokeScope],
    });

    // The hosted domain serves the OAuth token endpoint. Prefixes are unique
    // per region across all accounts, hence the account id.
    const domain = userPool.addDomain('Domain', {
      cognitoDomain: { domainPrefix: `solar-quote-${config.envName}-${Aws.ACCOUNT_ID}` },
    });

    this.mcpClient = userPool.addClient('McpClient', {
      generateSecret: true,
      oAuth: {
        flows: { clientCredentials: true },
        scopes: [OAuthScope.resourceServer(resourceServer, invokeScope)],
      },
      accessTokenValidity: Duration.hours(1),
    });
    this.userPool = userPool;

    new CfnOutput(this, 'FlowStateTableName', { value: this.flowStateTable.tableName });
    new CfnOutput(this, 'LeadsTableName', { value: this.leadsTable.tableName });
    new CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new CfnOutput(this, 'McpClientId', { value: this.mcpClient.userPoolClientId });
    new CfnOutput(this, 'TokenEndpoint', {
      value: `${domain.baseUrl()}/oauth2/token`,
      description: 'OAuth 2.0 token endpoint for the client-credentials grant',
    });
  }
}
