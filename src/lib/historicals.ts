/**
 * Historical income-statement actuals for display alongside the forecast.
 * Pure module; source-specific extraction (Finnhub / Yahoo) builds the raw
 * per-year figures and calls computeHistoricalIS.
 */
export interface HistoricalYear {
  fiscalYear: number;
  revenue: number | null;
  grossProfit: number | null;
  ebit: number | null;
  ebitda: number | null;
  netIncome: number | null;
}

export interface HistoricalRaw {
  fiscalYear: number;
  revenue?: number;
  cogs?: number;
  rd?: number;
  sga?: number;
  da?: number;
  netIncome?: number;
}

const fin = (x?: number): number | undefined =>
  typeof x === 'number' && Number.isFinite(x) ? x : undefined;

export function computeHistoricalIS(r: HistoricalRaw): HistoricalYear {
  const revenue = fin(r.revenue);
  const cogs = fin(r.cogs);
  const da = fin(r.da) ?? 0;
  const rd = fin(r.rd) ?? 0;
  const sga = fin(r.sga) ?? 0;
  const grossProfit = revenue != null && cogs != null ? revenue - cogs : undefined;
  const ebit = grossProfit != null ? grossProfit - rd - sga - da : undefined;
  const ebitda = ebit != null ? ebit + da : undefined;
  const netIncome = fin(r.netIncome);
  return {
    fiscalYear: r.fiscalYear,
    revenue: revenue ?? null,
    grossProfit: grossProfit ?? null,
    ebit: ebit ?? null,
    ebitda: ebitda ?? null,
    netIncome: netIncome ?? null,
  };
}
