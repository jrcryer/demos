import { PutEventsCommand } from '@aws-sdk/client-eventbridge';
import type { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { LEAD_EVENT_DETAIL_TYPE, LEAD_EVENT_SOURCE } from '../shared/lead';
import type { LeadCapturedDetail } from '../shared/lead';

export type LeadPublisher = (lead: LeadCapturedDetail) => Promise<void>;

export function eventBridgeLeadPublisher(
  client: Pick<EventBridgeClient, 'send'>,
  eventBusName: string,
): LeadPublisher {
  return async (lead) => {
    const result = await client.send(
      new PutEventsCommand({
        Entries: [
          {
            EventBusName: eventBusName,
            Source: LEAD_EVENT_SOURCE,
            DetailType: LEAD_EVENT_DETAIL_TYPE,
            Detail: JSON.stringify(lead),
          },
        ],
      }),
    );

    // PutEvents reports per-entry failures in a 200 response.
    if (result.FailedEntryCount) {
      const entry = result.Entries?.[0];
      throw new Error(`Lead event was rejected: ${entry?.ErrorCode} ${entry?.ErrorMessage}`);
    }
  };
}

/** Local development: no AWS calls, the lead id is logged and nothing else. */
export const loggingLeadPublisher: LeadPublisher = async (lead) => {
  console.log(JSON.stringify({ message: 'Lead captured (not published)', leadId: lead.leadId }));
};
