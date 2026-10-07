import type OpenAI from 'openai';
import type { Decision } from 'openai/resources/decisions';
import {
  QUESTIONS,
  buildInput,
  classifyWithDecisions,
  toRouteDecision,
} from '../src/classifiers/openai-decisions';
import type { Ticket } from '../src/shared/routing';

const ticket: Ticket = {
  ticketId: 'T-1',
  subject: 'Charged twice',
  body: 'Please refund the duplicate charge.',
};

const usage: Decision['usage'] = {
  input_tokens: 400,
  input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
  output_tokens: 3,
  output_tokens_details: { reasoning_tokens: 0 },
  total_tokens: 403,
};

function decision(answers: Decision['answers']): Decision {
  return { model: 'gpt-6-luna', answers, usage };
}

const answers: Decision['answers'] = [
  {
    type: 'choice',
    name: 'route',
    choice: 'billing',
    confidence: 0.93,
    probabilities: [
      { value: 'billing', probability: 0.93 },
      { value: 'general', probability: 0.07 },
    ],
  },
  { type: 'score', name: 'urgency', score: 1.6, confidence: 0.7, probabilities: [] },
  { type: 'predicate', name: 'needs_human', probability: 0.12 },
];

describe('OpenAI Decisions classifier', () => {
  it('asks one question of each type, in a fixed order', () => {
    expect(QUESTIONS.map((question) => [question.type, question.name])).toEqual([
      ['choice', 'route'],
      ['score', 'urgency'],
      ['predicate', 'needs_human'],
    ]);
  });

  it('maps answers onto the routing contract', () => {
    expect(toRouteDecision(ticket, decision(answers), 120)).toEqual({
      ticketId: 'T-1',
      provider: 'openai-decisions',
      model: 'gpt-6-luna',
      route: 'billing',
      urgency: 'high', // 1.6 rounds to index 2
      needsHuman: false,
      routeConfidence: 0.93,
      latencyMs: 120,
      usage: { inputTokens: 400, outputTokens: 3 },
      estimatedCostUsd: 0.00004,
    });
  });

  it('escalates when any question is refused', () => {
    const refused = toRouteDecision(
      ticket,
      decision([answers[0], { type: 'refusal', name: 'urgency' }, answers[2]]),
      90,
    );
    expect(refused).toMatchObject({ route: 'billing', urgency: 'high', needsHuman: true });
  });

  it('rejects a route outside the routing contract', () => {
    const bogus = { ...answers[0], choice: 'sales' } as Decision['answers'][number];
    expect(() => toRouteDecision(ticket, decision([bogus, answers[1], answers[2]]), 1)).toThrow(
      'unknown route',
    );
  });

  it('sends screenshots as inline image parts', () => {
    const input = buildInput({ ...ticket, screenshot: 'data:image/png;base64,AAAA' });
    expect(input).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: 'Subject: Charged twice\n\nPlease refund the duplicate charge.',
          },
          { type: 'input_image', image_url: 'data:image/png;base64,AAAA', detail: 'low' },
        ],
      },
    ]);
  });

  it('calls the Decisions API with the shared questions', async () => {
    const create = jest.fn().mockResolvedValue(decision(answers));
    const client = { decisions: { create } } as unknown as OpenAI;

    const result = await classifyWithDecisions(client, ticket);

    expect(create).toHaveBeenCalledWith({
      model: 'gpt-6-luna',
      input: 'Subject: Charged twice\n\nPlease refund the duplicate charge.',
      questions: QUESTIONS,
    });
    expect(result.route).toBe('billing');
  });
});
