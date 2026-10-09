/**
 * The routing contract shared by both classifiers and the state machine.
 *
 * Both the OpenAI Decisions API router and the Claude-on-Bedrock router must
 * produce a {@link RouteDecision}. The Step Functions Choice state only ever
 * reads the fields defined here, so the two providers are interchangeable.
 */

/** Queues a ticket can be routed to. The order is the order shown to the model. */
export const ROUTES = ['billing', 'technical', 'account_access', 'general'] as const;
export type Route = (typeof ROUTES)[number];

export const ROUTE_DESCRIPTIONS: Record<Route, string> = {
  billing: 'Charges, invoices, refunds, payment methods, plan or pricing changes.',
  technical: 'Errors, outages, bugs, integrations, API or performance problems.',
  account_access: 'Login failures, password resets, MFA, locked or compromised accounts.',
  general: 'Anything else: feature requests, feedback, how-to questions.',
};

/** Ordered urgency levels, lowest first. The index is the numeric score. */
export const URGENCY_LEVELS = ['low', 'normal', 'high', 'critical'] as const;
export type Urgency = (typeof URGENCY_LEVELS)[number];

export const URGENCY_DESCRIPTIONS: Record<Urgency, string> = {
  low: 'No customer impact; a question or suggestion.',
  normal: 'A single user is inconvenienced but has a workaround.',
  high: 'A user or team is blocked, or money is at stake.',
  critical: 'Production down, data loss, a security incident, or many customers affected.',
};

export const ROUTING_INSTRUCTIONS = {
  route: 'Which support queue should handle this ticket?',
  urgency: 'How urgent is this ticket?',
  needsHuman:
    'Does this ticket need a senior human agent immediately? True for legal threats, ' +
    'explicit cancellation or churn threats, safety concerns, or suspected account compromise.',
} as const;

export interface Ticket {
  readonly ticketId: string;
  readonly subject: string;
  readonly body: string;
  /** Optional screenshot as a base64 data URL (`data:image/png;base64,...`). */
  readonly screenshot?: string;
}

export type Provider = 'openai-decisions' | 'claude-bedrock';

export interface DecisionUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

/** What every classifier returns, and what the Choice state branches on. */
export interface RouteDecision {
  readonly ticketId: string;
  readonly provider: Provider;
  readonly model: string;
  readonly route: Route;
  readonly urgency: Urgency;
  readonly needsHuman: boolean;
  /**
   * Confidence in `route`, from 0 to 1, or `null` when the provider does not
   * report one. The Decisions API returns calibrated probabilities; Claude's
   * structured output returns a value that conforms to the schema, not a
   * probability, so the Claude router reports `null`.
   */
  readonly routeConfidence: number | null;
  /** Wall-clock time of the model call alone, in milliseconds. */
  readonly latencyMs: number;
  readonly usage: DecisionUsage;
  /** Estimated cost of this call in USD, from `src/shared/pricing.ts`. */
  readonly estimatedCostUsd: number;
}

/** A Decisions API score is a probability-weighted index; snap it to a level. */
export function urgencyFromScore(score: number): Urgency {
  const index = Math.min(URGENCY_LEVELS.length - 1, Math.max(0, Math.round(score)));
  return URGENCY_LEVELS[index];
}

export function isRoute(value: unknown): value is Route {
  return typeof value === 'string' && (ROUTES as readonly string[]).includes(value);
}

/** Renders a ticket as the plain-text evidence both providers receive. */
export function renderTicket(ticket: Ticket): string {
  return `Subject: ${ticket.subject}\n\n${ticket.body}`;
}

export function parseDataUrl(dataUrl: string): { mediaType: string; data: string } {
  const match = /^data:(image\/(?:png|jpeg|gif|webp));base64,(.+)$/.exec(dataUrl);
  if (!match) {
    throw new Error('screenshot must be a base64 data URL for a png, jpeg, gif or webp image');
  }
  return { mediaType: match[1], data: match[2] };
}
