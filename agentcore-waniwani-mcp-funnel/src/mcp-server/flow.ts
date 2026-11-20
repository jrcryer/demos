import { createHash } from 'node:crypto';
import { createFlow, END, neverPrefilled, START } from '@waniwani/sdk/mcp';
import { z } from 'zod';
import type { LeadCapturedDetail } from '../shared/lead';
import { calculateQuote, MAX_MONTHLY_BILL_USD, MIN_MONTHLY_BILL_USD } from './quote';

export const QUOTE_FLOW_ID = 'solar_quote';
/** Display tool the flow's last step tells the model to call. */
export const RESULT_TOOL_NAME = 'show_solar_quote_result';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const flowDefinition = () =>
  createFlow({
    id: QUOTE_FLOW_ID,
    title: 'Solar quote',
    description:
      'Guides someone through getting an indicative rooftop solar quote. Use when the user asks ' +
      'about the cost of, savings from, or a quote for solar panels.',
    intro: {
      instructions:
        'Say in one sentence that you can produce an indicative solar quote in three questions.',
    },
    state: {
      propertyType: z
        .enum(['house', 'apartment', 'commercial'])
        .describe('Kind of property the panels would go on'),
      monthlyBillUsd: z.number().describe('Average monthly electricity bill in US dollars'),
      name: z.string().describe("The person's full name"),
      email: z.string().describe('Email address to send the quote to'),
      // Results the flow writes. `neverPrefilled` means a value is accepted only
      // once the flow has asked for it — and the flow never asks for these, so
      // the conversation cannot set them.
      outcome: neverPrefilled(z.enum(['quoted', 'not_eligible']).describe('How the flow ended')),
      quote: neverPrefilled(
        z
          .object({
            systemSizeKw: z.number(),
            estimatedCostUsd: z.number(),
            estimatedAnnualSavingsUsd: z.number(),
            paybackYears: z.number(),
          })
          .describe('The indicative quote'),
      ),
    },
  });

/** The store type `compile()` accepts; the SDK does not export it by name. */
export type FlowStore = NonNullable<
  NonNullable<Parameters<ReturnType<typeof flowDefinition>['compile']>[0]>['store']
>;

export interface QuoteFlowDependencies {
  readonly store: FlowStore;
  readonly publishLead: (lead: LeadCapturedDetail) => Promise<void>;
  readonly now?: () => Date;
}

/** One lead per flow session, however many times the final step is retried. */
export function leadIdFor(sessionId: string | undefined, email: string): string {
  return createHash('sha256')
    .update(`${sessionId ?? 'no-session'}:${email.toLowerCase()}`)
    .digest('hex')
    .slice(0, 32);
}

export function createQuoteFlow({
  store,
  publishLead,
  now = () => new Date(),
}: QuoteFlowDependencies) {
  return flowDefinition()
    .addNode({
      id: 'ask_property',
      label: 'Property type',
      run: ({ interrupt }) =>
        interrupt({
          propertyType: {
            question: 'What kind of property is it?',
            suggestions: ['house', 'apartment', 'commercial'],
          },
        }),
    })
    .addNode({
      id: 'not_eligible',
      label: 'Not eligible',
      run: () => ({ outcome: 'not_eligible' as const }),
    })
    .addNode({
      id: 'ask_usage',
      label: 'Electricity bill',
      run: ({ interrupt }) =>
        interrupt({
          monthlyBillUsd: {
            question: 'Roughly how much is the monthly electricity bill, in US dollars?',
            validate: (value) => {
              if (
                !Number.isFinite(value) ||
                value < MIN_MONTHLY_BILL_USD ||
                value > MAX_MONTHLY_BILL_USD
              ) {
                throw new Error(
                  `The monthly bill must be between $${MIN_MONTHLY_BILL_USD} and $${MAX_MONTHLY_BILL_USD}.`,
                );
              }
            },
          },
        }),
    })
    .addNode({
      id: 'ask_contact',
      label: 'Contact details',
      run: ({ interrupt }) =>
        interrupt({
          name: { question: 'What name should the quote be made out to?' },
          email: {
            question: 'Which email address should the quote go to?',
            validate: (value) => {
              if (!EMAIL_PATTERN.test(value)) {
                throw new Error('That does not look like a valid email address.');
              }
            },
          },
        }),
    })
    .addNode({
      id: 'quote',
      label: 'Quote',
      run: async ({ state, sessionId }) => {
        const { propertyType, monthlyBillUsd, name, email } = state;
        if (!propertyType || propertyType === 'apartment' || !monthlyBillUsd || !name || !email) {
          throw new Error('The quote step was reached without the answers it needs.');
        }

        // Computed here, never read back from state: every state field is
        // writable from the conversation, and a price must not be.
        const quote = calculateQuote(propertyType, monthlyBillUsd);

        await publishLead({
          leadId: leadIdFor(sessionId, email),
          capturedAt: now().toISOString(),
          name,
          email,
          propertyType,
          monthlyBillUsd,
          quote,
        });

        return { outcome: 'quoted' as const, quote };
      },
    })
    .addNode({
      id: 'show_result',
      label: 'Result',
      // A finished flow returns only `status: "complete"`, so the result is
      // handed to the model through a display tool instead.
      run: ({ state, showWidget }) =>
        showWidget({
          tool: RESULT_TOOL_NAME,
          interactive: false,
          data: { outcome: state.outcome, quote: state.quote },
        }),
    })
    .addEdge(START, 'ask_property')
    .addConditionalEdge('ask_property', ['not_eligible', 'ask_usage'], (state) =>
      state.propertyType === 'apartment' ? 'not_eligible' : 'ask_usage',
    )
    .addEdge('not_eligible', 'show_result')
    .addEdge('ask_usage', 'ask_contact')
    .addEdge('ask_contact', 'quote')
    .addEdge('quote', 'show_result')
    .addEdge('show_result', END)
    .compile({ store });
}
