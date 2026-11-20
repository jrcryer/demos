import type { PropertyType, SolarQuote } from '../shared/lead';

/** Illustrative numbers only — this is a demo, not a pricing engine. */
const USD_PER_KWH = 0.17;
const ANNUAL_KWH_PER_INSTALLED_KW = 1350;
const USD_PER_INSTALLED_KW: Record<PropertyType, number> = { house: 2800, commercial: 2100 };
const MAX_SYSTEM_KW: Record<PropertyType, number> = { house: 15, commercial: 250 };
/** Share of the bill a system is sized to offset. */
const OFFSET_TARGET = 0.9;

export const MIN_MONTHLY_BILL_USD = 20;
export const MAX_MONTHLY_BILL_USD = 20000;

const round = (value: number, decimals = 0): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

export function calculateQuote(propertyType: PropertyType, monthlyBillUsd: number): SolarQuote {
  const annualKwh = (monthlyBillUsd * 12) / USD_PER_KWH;
  const idealKw = (annualKwh * OFFSET_TARGET) / ANNUAL_KWH_PER_INSTALLED_KW;
  const systemSizeKw = round(Math.min(Math.max(idealKw, 1), MAX_SYSTEM_KW[propertyType]), 1);

  const estimatedCostUsd = round(systemSizeKw * USD_PER_INSTALLED_KW[propertyType]);
  const estimatedAnnualSavingsUsd = round(
    Math.min(systemSizeKw * ANNUAL_KWH_PER_INSTALLED_KW * USD_PER_KWH, monthlyBillUsd * 12),
  );

  return {
    systemSizeKw,
    estimatedCostUsd,
    estimatedAnnualSavingsUsd,
    paybackYears: round(estimatedCostUsd / estimatedAnnualSavingsUsd, 1),
  };
}
