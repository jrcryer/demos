import type { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import {
  RoutingSchema,
  buildContent,
  classifyWithClaude,
  toRouteDecision,
} from '../src/classifiers/claude-bedrock';
import type { Ticket } from '../src/shared/routing';

const ticket: Ticket = {
  ticketId: 'T-2',
  subject: 'API returning 500s',
  body: 'Every POST fails.',
};

describe('Claude on Bedrock classifier', () => {
  it('requires every field and allows nothing extra', () => {
    const { schema } = betaZodOutputFormat(RoutingSchema);
    expect(schema).toMatchObject({
      type: 'object',
      required: ['route', 'urgency', 'needs_human'],
      additionalProperties: false,
    });
  });

  it('rejects a route outside the routing contract when parsing', () => {
    const format = betaZodOutputFormat(RoutingSchema);
    expect(() => format.parse('{"route":"sales","urgency":"low","needs_human":false}')).toThrow();
  });

  it('maps a parsed output onto the routing contract', () => {
    const decision = toRouteDecision(
      ticket,
      {
        model: 'global.anthropic.claude-opus-5-5',
        stopReason: 'end_turn',
        output: { route: 'technical', urgency: 'high', needs_human: false },
        inputTokens: 600,
        outputTokens: 40,
      },
      800,
    );

    expect(decision).toEqual({
      ticketId: 'T-2',
      provider: 'claude-bedrock',
      model: 'global.anthropic.claude-opus-5-5',
      route: 'technical',
      urgency: 'high',
      needsHuman: false,
      routeConfidence: null,
      latencyMs: 800,
      usage: { inputTokens: 600, outputTokens: 40 },
      estimatedCostUsd: (600 * 4 + 40 * 20) / 1_000_000,
    });
  });

  it('escalates when the model chain refuses', () => {
    const decision = toRouteDecision(
      ticket,
      {
        model: 'global.anthropic.claude-opus-4-8',
        stopReason: 'refusal',
        output: null,
        inputTokens: 600,
        outputTokens: 0,
      },
      500,
    );
    expect(decision).toMatchObject({ route: 'general', needsHuman: true });
  });

  it('puts the screenshot before the ticket text', () => {
    const content = buildContent({ ...ticket, screenshot: 'data:image/jpeg;base64,BBBB' });
    expect(content.map((block) => block.type)).toEqual(['image', 'text']);
  });

  it('rejects screenshots that are not image data URLs', () => {
    expect(() => buildContent({ ...ticket, screenshot: 'https://example.com/a.png' })).toThrow(
      'data URL',
    );
  });

  it('asks for a structured output at low effort', async () => {
    const parse = jest.fn().mockResolvedValue({
      model: 'global.anthropic.claude-opus-5-5',
      stop_reason: 'end_turn',
      parsed_output: { route: 'technical', urgency: 'critical', needs_human: false },
      usage: { input_tokens: 600, output_tokens: 40 },
    });
    const client = { beta: { messages: { parse } } } as unknown as AnthropicBedrock;

    const result = await classifyWithClaude(client, ticket);

    expect(parse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'global.anthropic.claude-opus-5-5',
        output_config: expect.objectContaining({
          effort: 'low',
          format: expect.objectContaining({ type: 'json_schema' }),
        }),
      }),
    );
    expect(result).toMatchObject({ route: 'technical', urgency: 'critical' });
  });
});
