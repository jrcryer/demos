import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { RESULT_TOOL_NAME } from './flow';

const quoteSchema = z.object({
  systemSizeKw: z.number(),
  estimatedCostUsd: z.number(),
  estimatedAnnualSavingsUsd: z.number(),
  paybackYears: z.number(),
});

const usd = (value: number): string => `$${value.toLocaleString('en-US')}`;

/**
 * The display tool the flow's last step points the model at. It renders the
 * outcome as text; a client with MCP Apps support could attach a widget here.
 */
export function registerResultTool(server: McpServer): void {
  server.registerTool(
    RESULT_TOOL_NAME,
    {
      title: 'Show solar quote result',
      description:
        'Presents the outcome of the solar quote flow. Call it only when the flow asks you to, ' +
        'with the data the flow provides.',
      inputSchema: {
        outcome: z.enum(['quoted', 'not_eligible']),
        quote: quoteSchema.optional(),
      },
      annotations: { readOnlyHint: true },
    },
    ({ outcome, quote }) => {
      const text =
        outcome === 'quoted' && quote
          ? `Indicative quote: a ${quote.systemSizeKw} kW system for about ` +
            `${usd(quote.estimatedCostUsd)}, saving about ${usd(quote.estimatedAnnualSavingsUsd)} ` +
            `a year (payback in roughly ${quote.paybackYears} years). A specialist will follow ` +
            `up by email. Figures are estimates, not an offer.`
          : 'No quote was produced: rooftop solar for a single apartment needs the building ' +
            'owner to apply. Suggest asking the building manager about a shared installation.';

      return { content: [{ type: 'text', text }] };
    },
  );
}
