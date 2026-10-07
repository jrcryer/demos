/**
 * Per-token prices used to estimate the cost of each routing decision.
 *
 * These are list prices at the time of writing (October 2026). Check the
 * provider pricing pages before quoting numbers:
 *   - OpenAI:         https://openai.com/api/pricing
 *   - Amazon Bedrock: https://aws.amazon.com/bedrock/pricing/
 *
 * Bedrock prices for Claude are set by AWS and can differ by region and
 * inference profile. The defaults below are Anthropic's first-party list
 * prices; override them with CLAUDE_INPUT_USD_PER_MTOK and
 * CLAUDE_OUTPUT_USD_PER_MTOK if your Bedrock rate differs.
 */

export interface TokenPrice {
  /** USD per million input tokens. */
  readonly inputPerMTok: number;
  /** USD per million output tokens. */
  readonly outputPerMTok: number;
}

/** Decisions API: input billed, output, cache reads and cache writes unbilled. */
export const OPENAI_DECISIONS_PRICE: TokenPrice = {
  inputPerMTok: 0.1,
  outputPerMTok: 0,
};

const CLAUDE_LIST_PRICES: Record<string, TokenPrice> = {
  'claude-opus-5-5': { inputPerMTok: 4, outputPerMTok: 20 },
  'claude-sonnet-5-5': { inputPerMTok: 2, outputPerMTok: 10 },
  'claude-haiku-4-5': { inputPerMTok: 1, outputPerMTok: 5 },
};

function envNumber(name: string): number | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

/** Resolves the price for a Bedrock model ID such as `anthropic.claude-opus-5-5`. */
export function claudePrice(modelId: string): TokenPrice {
  const key = Object.keys(CLAUDE_LIST_PRICES).find((name) => modelId.includes(name));
  const listPrice = key ? CLAUDE_LIST_PRICES[key] : CLAUDE_LIST_PRICES['claude-opus-5-5'];

  return {
    inputPerMTok: envNumber('CLAUDE_INPUT_USD_PER_MTOK') ?? listPrice.inputPerMTok,
    outputPerMTok: envNumber('CLAUDE_OUTPUT_USD_PER_MTOK') ?? listPrice.outputPerMTok,
  };
}

export function estimateCostUsd(
  price: TokenPrice,
  inputTokens: number,
  outputTokens: number,
): number {
  return (inputTokens * price.inputPerMTok + outputTokens * price.outputPerMTok) / 1_000_000;
}
