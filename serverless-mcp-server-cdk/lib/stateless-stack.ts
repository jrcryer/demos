import * as path from 'node:path';
import { CfnOutput, Stack, StackProps } from 'aws-cdk-lib';
import { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { APP_NAME, EnvironmentConfig } from './shared/config';

export interface StatelessStackProps extends StackProps {
  readonly config: EnvironmentConfig;
  /** Table created by the stateful stack. */
  readonly table: ITable;
}

/**
 * Stateless resources: compute and the glue around it. Everything in this stack
 * can be torn down and recreated without data loss.
 */
export class StatelessStack extends Stack {
  /** Placeholder handler — replace with the real Serverless MCP Server implementation. */
  public readonly handlerFunction: NodejsFunction;

  constructor(scope: Construct, id: string, props: StatelessStackProps) {
    super(scope, id, props);

    const { config, table } = props;
    const functionName = `${APP_NAME}-${config.envName}-mcp-server`;

    const logGroup = new LogGroup(this, 'McpServerLogGroup', {
      logGroupName: `/aws/lambda/${functionName}`,
      retention: config.logRetention,
      removalPolicy: config.removalPolicy,
    });

    this.handlerFunction = new NodejsFunction(this, 'McpServerFunction', {
      functionName,
      description: `Serverless MCP Server placeholder handler (${config.envName})`,
      entry: path.join(__dirname, '..', 'src', 'handlers', 'mcp-server', 'index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      memorySize: config.lambdaMemorySize,
      timeout: config.lambdaTimeout,
      logGroup,
      environment: {
        ENVIRONMENT: config.envName,
        TABLE_NAME: table.tableName,
        NODE_OPTIONS: '--enable-source-maps',
      },
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node22',
      },
    });

    table.grantReadWriteData(this.handlerFunction);

    new CfnOutput(this, 'McpServerFunctionName', {
      value: this.handlerFunction.functionName,
      description: 'Name of the Serverless MCP Server placeholder function',
    });
  }
}
