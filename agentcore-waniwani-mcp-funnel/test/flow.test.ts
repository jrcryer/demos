import { createFlowTestHarness, MemoryKvStore } from '@waniwani/sdk/mcp';
import { createQuoteFlow, leadIdFor, RESULT_TOOL_NAME } from '../src/mcp-server/flow';
import type { LeadCapturedDetail } from '../src/shared/lead';

async function setup() {
  const leads: LeadCapturedDetail[] = [];
  const flow = createQuoteFlow({
    store: new MemoryKvStore(),
    publishLead: async (lead) => {
      leads.push(lead);
    },
    now: () => new Date('2026-01-02T03:04:05.000Z'),
  });
  const harness = await createFlowTestHarness(flow);
  return { harness, leads };
}

describe('solar quote flow', () => {
  it('asks for the property type first', async () => {
    const { harness } = await setup();

    const step = await harness.start('wants a solar quote');

    expect(step).toMatchObject({ status: 'interrupt', field: 'propertyType' });
  });

  it('walks a house owner through to a quote and publishes one lead', async () => {
    const { harness, leads } = await setup();

    await harness.start('wants a solar quote');
    expect(await harness.continueWith({ propertyType: 'house' })).toMatchObject({
      status: 'interrupt',
      field: 'monthlyBillUsd',
    });
    expect(await harness.continueWith({ monthlyBillUsd: 180 })).toMatchObject({
      status: 'interrupt',
      questions: [{ field: 'name' }, { field: 'email' }],
    });
    const result = await harness.continueWith({ name: 'Ada Lovelace', email: 'ada@example.com' });

    expect(result).toMatchObject({
      status: 'widget',
      tool: RESULT_TOOL_NAME,
      data: { outcome: 'quoted', quote: { systemSizeKw: 8.5, estimatedCostUsd: 23800 } },
    });
    expect(leads).toEqual([
      {
        leadId: expect.stringMatching(/^[a-f0-9]{32}$/),
        capturedAt: '2026-01-02T03:04:05.000Z',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        propertyType: 'house',
        monthlyBillUsd: 180,
        quote: {
          systemSizeKw: 8.5,
          estimatedCostUsd: 23800,
          estimatedAnnualSavingsUsd: 1951,
          paybackYears: 12.2,
        },
      },
    ]);
    expect(await harness.continueWith()).toMatchObject({ status: 'complete' });
  });

  it('skips questions the user already answered', async () => {
    const { harness } = await setup();

    const step = await harness.start('quote for my shop, bill is about $900', {
      propertyType: 'commercial',
      monthlyBillUsd: 900,
    });

    expect(step).toMatchObject({
      status: 'interrupt',
      questions: [{ field: 'name' }, { field: 'email' }],
    });
  });

  it('routes apartments to the not-eligible result without capturing a lead', async () => {
    const { harness, leads } = await setup();

    await harness.start('wants a solar quote');
    const result = await harness.continueWith({ propertyType: 'apartment' });

    expect(result).toMatchObject({
      status: 'widget',
      tool: RESULT_TOOL_NAME,
      data: { outcome: 'not_eligible' },
    });
    expect(leads).toHaveLength(0);
  });

  it('re-asks when the bill is out of range', async () => {
    const { harness } = await setup();

    await harness.start('wants a solar quote', { propertyType: 'house' });
    const step = await harness.continueWith({ monthlyBillUsd: 3 });

    expect(step).toMatchObject({
      status: 'interrupt',
      field: 'monthlyBillUsd',
      context: expect.stringContaining('between $20 and $20000'),
    });
  });

  it('re-asks only for the email when it is malformed', async () => {
    const { harness, leads } = await setup();

    await harness.start('wants a solar quote', { propertyType: 'house', monthlyBillUsd: 180 });
    const step = await harness.continueWith({ name: 'Ada', email: 'not-an-email' });

    expect(step).toMatchObject({ status: 'interrupt', field: 'email' });
    expect(leads).toHaveLength(0);
  });

  it('ignores a quote the conversation tries to supply', async () => {
    const { harness, leads } = await setup();

    const result = await harness.start('wants a solar quote', {
      propertyType: 'house',
      monthlyBillUsd: 180,
      name: 'Ada',
      email: 'ada@example.com',
      outcome: 'quoted',
      quote: {
        systemSizeKw: 99,
        estimatedCostUsd: 1,
        estimatedAnnualSavingsUsd: 99999,
        paybackYears: 0,
      },
    });

    expect(result).toMatchObject({
      status: 'widget',
      data: { quote: { estimatedCostUsd: 23800 } },
    });
    expect(leads[0].quote.estimatedCostUsd).toBe(23800);
  });
});

describe('leadIdFor', () => {
  it('is stable for a session and case-insensitive on the email', () => {
    expect(leadIdFor('session-1', 'Ada@Example.com')).toBe(
      leadIdFor('session-1', 'ada@example.com'),
    );
  });

  it('differs between sessions', () => {
    expect(leadIdFor('session-1', 'ada@example.com')).not.toBe(
      leadIdFor('session-2', 'ada@example.com'),
    );
  });
});
