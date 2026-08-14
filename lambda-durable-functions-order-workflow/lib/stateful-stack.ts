import { CfnOutput, Stack, StackProps } from 'aws-cdk-lib';
import {
  AttributeType,
  BillingMode,
  ITable,
  Table,
  TableEncryption,
} from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { EnvironmentConfig } from './shared/config';

export interface StatefulStackProps extends StackProps {
  readonly config: EnvironmentConfig;
}

/**
 * Stateful resources: anything whose lifecycle must outlive a deployment of the
 * application code (data stores, buckets, queues with retained messages).
 */
export class StatefulStack extends Stack {
  /** Table holding durable order workflow state. */
  public readonly table: ITable;

  constructor(scope: Construct, id: string, props: StatefulStackProps) {
    super(scope, id, props);

    const { config } = props;

    const table = new Table(this, 'OrderWorkflowTable', {
      partitionKey: { name: 'pk', type: AttributeType.STRING },
      sortKey: { name: 'sk', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      encryption: TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: config.pointInTimeRecovery,
      },
      timeToLiveAttribute: 'ttl',
      removalPolicy: config.removalPolicy,
    });

    this.table = table;

    new CfnOutput(this, 'TableName', {
      value: table.tableName,
      description: 'DynamoDB table holding durable order workflow state',
      exportName: `${id}-table-name`,
    });
  }
}
