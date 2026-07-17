/**
 * Canonical domain types for the valuation engine.
 *
 * The UI maps arbitrary report labels onto these canonical names; the engine
 * only ever sees canonical fields. Keep this file free of UI/store concerns.
 */

/** One forecast year of the unlevered-FCF build (DCF sheet rows). */
export interface ForecastYear {
  fiscalYear: number;
  revenue: number;
  ebit: number;
  /** Depreciation & amortization (positive magnitude added back). */
  da: number;
  /** Effective tax rate applied to EBIT, e.g. 0.21. */
  taxRate: number;
  /** Net working capital at period end (WC assets − WC liabilities). */
  netWorkingCapital: number;
  /** Capital expenditures (positive magnitude; subtracted from UFCF). */
  capex: number;
}

/** CAPM / capital-structure assumptions for WACC. */
export interface WaccAssumptions {
  costOfDebt: number;
  taxRate: number;
  riskFreeRate: number;
  beta: number;
  marketReturn: number;
  weightEquity: number;
  weightDebt: number;
}

/** Enterprise → equity bridge. */
export interface NetDebtBridge {
  debt: number;
  convertibleStock: number;
  preferredStock: number;
  minorityInterest: number;
  cashAndEquivalents: number;
  equityInvestments: number;
}

export interface DcfInputs {
  years: ForecastYear[];
  wacc: WaccAssumptions;
  /** Portion of year-1 cash flows still in the forecast window (0–1]. */
  stub: number;
  /** Perpetuity long-term growth rate, e.g. 0.025. */
  longTermGrowth: number;
  bridge: NetDebtBridge;
  sharesOutstanding: number;
  /**
   * Terminal-value basis. 'nominal' grows the last forecast year's UFCF
   * (financially correct; spec Q1 fix). 'faithful' reproduces the sheet's
   * grow-the-discounted-value behavior. Default 'nominal'.
   */
  terminalBasis?: 'nominal' | 'faithful';
}

export interface WaccResult {
  costOfDebtAfterTax: number;
  marketRiskPremium: number;
  costOfEquity: number;
  wacc: number;
}

export interface DcfYearDetail extends ForecastYear {
  ebitda: number;
  ebitdaMargin: number;
  nopat: number;
  changeInNwc: number;
  ufcf: number;
  ufcfStubAdjusted: number;
  discountPeriod: number;
  presentValue: number;
}

export interface DcfResult {
  wacc: WaccResult;
  years: DcfYearDetail[];
  pvOfForecast: number;
  terminalValue: number;
  pvOfTerminalValue: number;
  enterpriseValue: number;
  netDebt: number;
  equityValue: number;
  equityValuePerShare: number;
}

/** Comparable-companies (multiples) valuation. */
export interface CompsInputs {
  /** Label of the chosen multiple, e.g. 'EV/EBITDA'. */
  multipleName: string;
  /** Company metric the multiple is applied to (e.g. terminal-year EBITDA). */
  companyMetric: number;
  /** Peer multiples (blanks filtered out by the caller). */
  peerMultiples: number[];
  netDebt: number;
  sharesOutstanding: number;
}

export interface CompsResult {
  averageMultiple: number;
  enterpriseValue: number;
  equityValue: number;
  equityValuePerShare: number;
}
