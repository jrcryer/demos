import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { EventBridgeEvent } from 'aws-lambda';
import type { LEAD_EVENT_DETAIL_TYPE, LeadCapturedDetail } from '../../shared/lead';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

type LeadCapturedEvent = EventBridgeEvent<typeof LEAD_EVENT_DETAIL_TYPE, LeadCapturedDetail>;

/**
 * Persists a captured lead. The write is keyed by `leadId`, which is stable per
 * funnel session, so a redelivered event overwrites the same item.
 */
export const handler = async (event: LeadCapturedEvent): Promise<void> => {
  const tableName = process.env.LEADS_TABLE_NAME;
  if (!tableName) throw new Error('Missing required environment variable LEADS_TABLE_NAME');

  const lead = event.detail;
  if (!lead?.leadId || !lead.email) {
    throw new Error(`Event ${event.id} is not a valid LeadCaptured event`);
  }

  await client.send(new PutCommand({ TableName: tableName, Item: { ...lead, eventId: event.id } }));

  // The lead id only: names and email addresses stay out of the logs.
  console.log(JSON.stringify({ message: 'Lead recorded', leadId: lead.leadId }));
};
