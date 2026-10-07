/** Default models. Kept free of SDK imports so the CDK app can read them. */
export const DEFAULT_OPENAI_MODEL = 'gpt-6-luna';

/** Bedrock model ID; override with `-c claudeModel=anthropic.claude-haiku-4-5` and similar. */
export const DEFAULT_CLAUDE_MODEL = 'anthropic.claude-opus-5-5';

/** Tried if the primary Claude model declines a ticket on safety grounds. */
export const CLAUDE_FALLBACK_MODEL = 'anthropic.claude-opus-4-8';
