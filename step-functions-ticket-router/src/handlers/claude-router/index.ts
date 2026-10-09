import {
  DEFAULT_CLAUDE_MODEL,
  classifyWithClaude,
  createClaudeClient,
} from '../../classifiers/claude-bedrock';
import type { RouteDecision, Ticket } from '../../shared/routing';

const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? DEFAULT_CLAUDE_MODEL;

export interface RouterEvent {
  readonly ticket: Ticket;
}

// Created once per execution environment; credentials come from the function role.
const client = createClaudeClient(process.env.AWS_REGION);

/** Classifies a ticket with Claude on Amazon Bedrock, using structured outputs. */
export const handler = async (event: RouterEvent): Promise<RouteDecision> => {
  const decision = await classifyWithClaude(client, event.ticket, CLAUDE_MODEL);
  console.log(JSON.stringify({ message: 'Ticket classified', ...decision }));
  return decision;
};
