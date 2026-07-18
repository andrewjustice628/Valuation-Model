/**
 * Historical statement actuals (income statement, balance sheet, cash flow) for
 * display alongside the forecast. Pure module; source-specific extraction
 * (Finnhub / Yahoo) builds the raw per-year figures and calls
 * computeHistoricalYear. Reported totals pass through; a few lines are derived.
 */
export interface HistoricalYear {
  fiscalYear: number;
  // Income statement
  revenue: number | null;
  grossProfit: number | null;
  ebit: number | null;
  ebitda: number | null;
  netIncome: number | null;
  // Balance sheet
  totalAssets: number | null;
  totalLiabilities: number | null;
  totalEquity: number | null;
  cash: number | null;
  netWorkingCapital: number | null;
  balanceCheck: number | null;
  // Cash flow
  cashFromOperations: number | null;
  cashFromInvesting: number | null;
  cashFromFinancing: number | null;
  netChangeInCash: number | null;
}

export interface HistoricalRaw {
  fiscalYear: number;
  revenue?: number; cogs?: number; rd?: number; sga?: number; da?: number; netIncome?: number;
  totalAssets?: number; totalLiabilities?: number; totalEquity?: number; cash?: number;
  accountsReceivable?: number; inventories?: number; otherCurrentAssets?: number;
  accountsPayable?: number; otherCurrentLiabilities?: number; deferredRevenue?: number;
  cashFromOperations?: number; cashFromInvesting?: number; cashFromFinancing?: number; netChangeInCash?: number;
}

const fin = (x?: number): number | undefined =>
  typeof x === 'number' && Number.isFinite(x) ? x : undefined;

export function computeHistoricalYear(r: HistoricalRaw): HistoricalYear {
  // Income statement
  const revenue = fin(r.revenue);
  const cogs = fin(r.cogs);
  const da = fin(r.da) ?? 0;
  const rd = fin(r.rd) ?? 0;
  const sga = fin(r.sga) ?? 0;
  const grossProfit = revenue != null && cogs != null ? revenue - cogs : undefined;
  const ebit = grossProfit != null ? grossProfit - rd - sga - da : undefined;
  const ebitda = ebit != null ? ebit + da : undefined;

  // Balance sheet (reported totals pass through)
  const totalAssets = fin(r.totalAssets);
  const totalLiabilities = fin(r.totalLiabilities);
  const totalEquity = fin(r.totalEquity);
  const balanceCheck =
    totalAssets != null && totalLiabilities != null && totalEquity != null
      ? totalAssets - (totalLiabilities + totalEquity)
      : undefined;
  const wc = [r.accountsReceivable, r.inventories, r.otherCurrentAssets, r.accountsPayable, r.otherCurrentLiabilities, r.deferredRevenue];
  const netWorkingCapital = wc.some((x) => fin(x) != null)
    ? (fin(r.accountsReceivable) ?? 0) + (fin(r.inventories) ?? 0) + (fin(r.otherCurrentAssets) ?? 0) -
      ((fin(r.accountsPayable) ?? 0) + (fin(r.otherCurrentLiabilities) ?? 0) + (fin(r.deferredRevenue) ?? 0))
    : undefined;

  const nn = (x?: number) => (x != null ? x : null);
  return {
    fiscalYear: r.fiscalYear,
    revenue: revenue ?? null,
    grossProfit: grossProfit ?? null,
    ebit: ebit ?? null,
    ebitda: ebitda ?? null,
    netIncome: nn(fin(r.netIncome)),
    totalAssets: nn(totalAssets),
    totalLiabilities: nn(totalLiabilities),
    totalEquity: nn(totalEquity),
    cash: nn(fin(r.cash)),
    netWorkingCapital: netWorkingCapital ?? null,
    balanceCheck: balanceCheck ?? null,
    cashFromOperations: nn(fin(r.cashFromOperations)),
    cashFromInvesting: nn(fin(r.cashFromInvesting)),
    cashFromFinancing: nn(fin(r.cashFromFinancing)),
    netChangeInCash: nn(fin(r.netChangeInCash)),
  };
}
