import OpenAI from 'openai';
import type {
  Decision,
  DecisionCreateParams,
  DecisionInputMessage,
} from 'openai/resources/decisions';
import { DEFAULT_OPENAI_MODEL } from '../shared/models';
import { OPENAI_DECISIONS_PRICE, estimateCostUsd } from '../shared/pricing';
import {
  ROUTES,
  ROUTE_DESCRIPTIONS,
  ROUTING_INSTRUCTIONS,
  RouteDecision,
  Ticket,
  URGENCY_DESCRIPTIONS,
  URGENCY_LEVELS,
  isRoute,
  renderTicket,
  urgencyFromScore,
} from '../shared/routing';

export { DEFAULT_OPENAI_MODEL };

type Answer = Decision['answers'][number];

/**
 * The three questions asked of every ticket, one of each Decisions API type.
 * Answers come back in this order, and each carries its `name`.
 */
export const QUESTIONS: DecisionCreateParams['questions'] = [
  {
    type: 'choice',
    name: 'route',
    instructions: ROUTING_INSTRUCTIONS.route,
    choices: ROUTES.map((value) => ({ value, description: ROUTE_DESCRIPTIONS[value] })),
  },
  {
    type: 'score',
    name: 'urgency',
    instructions: ROUTING_INSTRUCTIONS.urgency,
    levels: URGENCY_LEVELS.map((label) => ({ label, description: URGENCY_DESCRIPTIONS[label] })),
  },
  {
    type: 'predicate',
    name: 'needs_human',
    instructions: ROUTING_INSTRUCTIONS.needsHuman,
  },
];

/** Probability above which the `needs_human` predicate counts as true. */
export const NEEDS_HUMAN_THRESHOLD = 0.5;

function findAnswer<T extends Answer['type']>(
  answers: Decision['answers'],
  name: string,
  type: T,
): Extract<Answer, { type: T }> | undefined {
  const answer = answers.find((candidate) => candidate.name === name);
  if (!answer || answer.type === 'refusal') return undefined;
  if (answer.type !== type) {
    throw new Error(`Decisions API answered "${name}" as ${answer.type}, expected ${type}`);
  }
  return answer as Extract<Answer, { type: T }>;
}

export function buildInput(ticket: Ticket): DecisionCreateParams['input'] {
  if (!ticket.screenshot) return renderTicket(ticket);

  const message: DecisionInputMessage = {
    role: 'user',
    content: [
      { type: 'input_text', text: renderTicket(ticket) },
      { type: 'input_image', image_url: ticket.screenshot, detail: 'low' },
    ],
  };
  return [message];
}

/**
 * Maps a Decisions API response onto the shared routing contract.
 *
 * A refused question never silently becomes a default: a refused route or
 * urgency sends the ticket to a human, which is the safe failure mode.
 */
export function toRouteDecision(
  ticket: Ticket,
  decision: Decision,
  latencyMs: number,
): RouteDecision {
  const route = findAnswer(decision.answers, 'route', 'choice');
  const urgency = findAnswer(decision.answers, 'urgency', 'score');
  const needsHuman = findAnswer(decision.answers, 'needs_human', 'predicate');

  if (route && !isRoute(route.choice)) {
    throw new Error(`Decisions API returned an unknown route: ${String(route.choice)}`);
  }

  const refused = !route || !urgency || !needsHuman;
  const { input_tokens: inputTokens, output_tokens: outputTokens } = decision.usage;

  return {
    ticketId: ticket.ticketId,
    provider: 'openai-decisions',
    model: decision.model,
    route: route && isRoute(route.choice) ? route.choice : 'general',
    urgency: urgency ? urgencyFromScore(urgency.score) : 'high',
    needsHuman: refused || needsHuman.probability >= NEEDS_HUMAN_THRESHOLD,
    routeConfidence: route ? route.confidence : null,
    latencyMs,
    usage: { inputTokens, outputTokens },
    estimatedCostUsd: estimateCostUsd(OPENAI_DECISIONS_PRICE, inputTokens, outputTokens),
  };
}

export async function classifyWithDecisions(
  client: OpenAI,
  ticket: Ticket,
  model: string = DEFAULT_OPENAI_MODEL,
): Promise<RouteDecision> {
  const started = performance.now();
  const decision = await client.decisions.create({
    model,
    input: buildInput(ticket),
    questions: QUESTIONS,
  });
  const latencyMs = Math.round(performance.now() - started);

  return toRouteDecision(ticket, decision, latencyMs);
}
