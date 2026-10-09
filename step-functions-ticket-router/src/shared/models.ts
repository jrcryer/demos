/** Defaults shared by the CDK app and the compare script. Kept free of SDK imports. */

/** AWS region the stacks deploy to and the compare script calls; override with `-c region=...`. */
export const DEFAULT_REGION = 'eu-west-1';

export const DEFAULT_OPENAI_MODEL = 'gpt-6-luna';

/**
 * Bedrock global cross-Region inference profile for Claude. Claude Opus 5.5
 * isn't served in-Region in eu-west-1, so requests go through the global
 * profile, which routes to any commercial Region with capacity. Override with
 * `-c claudeModel=eu.anthropic.claude-opus-5-5` to keep traffic in EU Regions.
 */
export const DEFAULT_CLAUDE_MODEL = 'global.anthropic.claude-opus-5-5';

/** Tried if the primary Claude model declines a ticket on safety grounds. */
export const CLAUDE_FALLBACK_MODEL = 'global.anthropic.claude-opus-4-8';

/** Strips an inference profile prefix: `global.anthropic.x` becomes `anthropic.x`. */
export function foundationModelId(modelId: string): string {
  return modelId.replace(/^(global|us|eu|apac|jp|au|ca|us-gov)\./, '');
}
