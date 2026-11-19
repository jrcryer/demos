import { calculateQuote } from '../src/mcp-server/quote';

describe('calculateQuote', () => {
  it('sizes a house system to offset most of the bill', () => {
    expect(calculateQuote('house', 180)).toEqual({
      systemSizeKw: 8.5,
      estimatedCostUsd: 23800,
      estimatedAnnualSavingsUsd: 1951,
      paybackYears: 12.2,
    });
  });

  it('caps a house at the largest residential system', () => {
    expect(calculateQuote('house', 5000).systemSizeKw).toBe(15);
  });

  it('prices commercial systems at a lower rate per kW', () => {
    const house = calculateQuote('house', 200);
    const commercial = calculateQuote('commercial', 200);

    expect(commercial.systemSizeKw).toBe(house.systemSizeKw);
    expect(commercial.estimatedCostUsd).toBeLessThan(house.estimatedCostUsd);
  });

  it('floors tiny bills at a 1 kW system without overstating the savings', () => {
    const quote = calculateQuote('house', 20);

    expect(quote.systemSizeKw).toBe(1);
    expect(quote.estimatedAnnualSavingsUsd).toBeLessThanOrEqual(20 * 12);
  });
});
