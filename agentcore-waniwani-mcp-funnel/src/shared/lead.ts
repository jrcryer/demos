/** EventBridge contract between the MCP server and the lead recorder. */
export const LEAD_EVENT_SOURCE = 'demo.solar-quote';
export const LEAD_EVENT_DETAIL_TYPE = 'LeadCaptured';

export type PropertyType = 'house' | 'commercial';

export interface SolarQuote {
  readonly systemSizeKw: number;
  readonly estimatedCostUsd: number;
  readonly estimatedAnnualSavingsUsd: number;
  readonly paybackYears: number;
}

export interface LeadCapturedDetail {
  /** Stable per flow session, so a retried publish overwrites rather than duplicates. */
  readonly leadId: string;
  readonly capturedAt: string;
  readonly name: string;
  readonly email: string;
  readonly propertyType: PropertyType;
  readonly monthlyBillUsd: number;
  readonly quote: SolarQuote;
}
