import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import OpenAI from 'openai';
import { DEFAULT_OPENAI_MODEL, classifyWithDecisions } from '../../classifiers/openai-decisions';
import type { RouteDecision, Ticket } from '../../shared/routing';

const OPENAI_SECRET_ARN = process.env.OPENAI_SECRET_ARN ?? '';
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL;

export interface RouterEvent {
  readonly ticket: Ticket;
}

const secrets = new SecretsManagerClient({});
let client: Promise<OpenAI> | undefined;

/** Reads the API key once per execution environment, not once per ticket. */
async function getClient(): Promise<OpenAI> {
  client ??= secrets
    .send(new GetSecretValueCommand({ SecretId: OPENAI_SECRET_ARN }))
    .then(({ SecretString }) => {
      if (!SecretString || SecretString === 'REPLACE_ME') {
        throw new Error(`Set the OpenAI API key in secret ${OPENAI_SECRET_ARN}`);
      }
      // Step Functions owns retries, so the SDK makes one attempt.
      return new OpenAI({ apiKey: SecretString, timeout: 20_000, maxRetries: 0 });
    })
    .catch((error: unknown) => {
      client = undefined;
      throw error;
    });
  return client;
}

/** Classifies a ticket with the OpenAI Decisions API. */
export const handler = async (event: RouterEvent): Promise<RouteDecision> => {
  const decision = await classifyWithDecisions(await getClient(), event.ticket, OPENAI_MODEL);
  console.log(JSON.stringify({ message: 'Ticket classified', ...decision }));
  return decision;
};
