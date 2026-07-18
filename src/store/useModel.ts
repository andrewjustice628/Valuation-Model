/**
 * Application state (zustand). Holds every input, plus market-fetch status and
 * the label-alias map (the "call it what your report calls it" layer). Pure
 * engine computation lives in src/engine and is called by selectors below.
 */
import { create } from 'zustand';
import { activeProvider } from '../lib/marketData';
import { RAMP_SEED_FIELDS, revenueGrowthFromHistory } from '../lib/seed';
import type { HistoricalYear } from '../lib/historicals';
import type { BaseYear, ForecastAssumptions } from '../engine/statements';
import type { NetDebtBridge, WaccAssumptions } from '../engine/types';

export interface CompanyInfo {
  ticker: string;
  name: string;
  unit: string;
  sharePrice: number;
  sharesOutstanding: number;
}

export interface Peer {
  ticker: string;
  multiple: number | null;
}

export interface CompsConfig {
  multipleName: string;
  peers: Peer[];
  /** Override the company metric the multiple is applied to (else terminal EBITDA). */
  companyMetricOverride: number | null;
}

export interface DcfConfig {
  stub: number;
  longTermGrowth: number;
  terminalBasis: 'nominal' | 'faithful';
}

type FetchStatus = 'idle' | 'loading' | 'ok' | 'error';

// Latest completed fiscal year (dynamic) → the model always spans the same
// number of years back and forward from the present until a filing overrides it.
const LATEST_ACTUAL_YEAR = new Date().getFullYear() - 1;
const forecastYears = (latestActual: number): number[] => [1, 2, 3, 4, 5].map((k) => latestActual + k);
const YEARS = forecastYears(LATEST_ACTUAL_YEAR);
const GROWTH = [0.1, 0.09, 0.08, 0.07, 0.06];
const DA = [50, 55, 60, 66, 73];
const CAPEX = [80, 85, 90, 95, 100];

const defaultAssumption = (fiscalYear: number, i: number): ForecastAssumptions => ({
  fiscalYear,
  revenueGrowth: GROWTH[i],
  grossMargin: 0.4,
  rdPctSales: 0.05,
  sgaPctSales: 0.15,
  taxRate: 0.21,
  da: DA[i],
  interestIncome: 5,
  interestExpense: 10,
  otherExpenses: 15,
  stockBasedComp: 15,
  capex: CAPEX[i],
  dividends: 20,
  shareRepurchases: 10,
  longTermDebtChange: 0,
  commercialPaperChange: 0,
  commonStockIssued: 0,
  arPctRevenue: 0.15,
  invPctCogs: 0.12,
  otherCurrentAssetsPctRevenue: 0.02,
  apPctCogs: 0.15,
  otherCurrentLiabilitiesPctRevenue: 0.04,
  deferredRevenuePctRevenue: 0.03,
  otherNonCurrentAssetsPctRevenue: 0.05,
  otherNonCurrentLiabilitiesPctRevenue: 0.06,
});

const defaultBase: BaseYear = {
  fiscalYear: LATEST_ACTUAL_YEAR, revenue: 1000, cogs: 600,
  cash: 100, accountsReceivable: 150, inventories: 80, otherCurrentAssets: 20,
  ppe: 500, otherNonCurrentAssets: 50,
  accountsPayable: 90, otherCurrentLiabilities: 40, deferredRevenue: 30,
  commercialPaper: 0, longTermDebt: 200, otherNonCurrentLiabilities: 60,
  retainedEarnings: 300, otherComprehensiveIncome: 10, commonStock: 170,
};

const defaultWacc: WaccAssumptions = {
  costOfDebt: 0.05, taxRate: 0.21, riskFreeRate: 0.04, beta: 1.1,
  marketReturn: 0.1, weightEquity: 0.8, weightDebt: 0.2,
};

const defaultBridge: NetDebtBridge = {
  debt: 200, convertibleStock: 0, preferredStock: 0, minorityInterest: 0,
  cashAndEquivalents: 100, equityInvestments: 0,
};

const NO_MANUAL = [false, false, false, false, false];

/** Geometric CAGR from the editable prior years + the (editable) latest year. */
function growthFromHistory(base: BaseYear, historicalBase: Array<Record<string, number>>): number | undefined {
  const priors = historicalBase.filter((h) => h.fiscalYear < base.fiscalYear);
  return revenueGrowthFromHistory([
    ...priors.map((p) => ({ year: p.fiscalYear, revenue: p.revenue })),
    { year: base.fiscalYear, revenue: base.revenue },
  ]);
}

/** Push the auto-derived growth into every forecast year that isn't overridden. */
function applyAutoGrowth(
  base: BaseYear,
  historicalBase: Array<Record<string, number>>,
  assumptions: ForecastAssumptions[],
  manual: boolean[],
): ForecastAssumptions[] {
  const g = growthFromHistory(base, historicalBase);
  if (g === undefined) return assumptions;
  return assumptions.map((a, i) => (manual[i] ? a : { ...a, revenueGrowth: g }));
}

export interface ModelState {
  company: CompanyInfo;
  base: BaseYear;
  assumptions: ForecastAssumptions[];
  wacc: WaccAssumptions;
  bridge: NetDebtBridge;
  dcf: DcfConfig;
  comps: CompsConfig;
  labels: Record<string, string>;
  historicals: HistoricalYear[];
  historicalBase: Array<Record<string, number>>;
  /** Per-forecast-year flag: true = user overrode revenue growth (stop auto). */
  revenueGrowthManual: boolean[];
  quoteStatus: FetchStatus;
  quoteError: string | null;
  financialsStatus: FetchStatus;
  financialsMessage: string | null;

  setCompany: (patch: Partial<CompanyInfo>) => void;
  setBase: (field: keyof BaseYear, value: number) => void;
  setAssumption: (index: number, field: keyof ForecastAssumptions, value: number) => void;
  copyAcross: (field: keyof ForecastAssumptions) => void;
  setWacc: (field: keyof WaccAssumptions, value: number) => void;
  setBridge: (field: keyof NetDebtBridge, value: number) => void;
  setDcf: (patch: Partial<DcfConfig>) => void;
  setComps: (patch: Partial<CompsConfig>) => void;
  setPeer: (index: number, patch: Partial<Peer>) => void;
  addPeer: () => void;
  removePeer: (index: number) => void;
  setLabel: (fieldId: string, label: string) => void;
  setHistorical: (fiscalYear: number, field: string, value: number) => void;
  resetGrowthAuto: () => void;
  fetchQuote: () => Promise<void>;
  fetchPeerMultiple: (index: number) => Promise<void>;
  fetchFinancials: () => Promise<void>;
}

export const useModel = create<ModelState>((set, get) => ({
  company: { ticker: 'AAPL', name: 'Example Corp', unit: 'Thousands', sharePrice: 0, sharesOutstanding: 1000 },
  base: { ...defaultBase },
  assumptions: YEARS.map((y, i) => defaultAssumption(y, i)),
  wacc: { ...defaultWacc },
  bridge: { ...defaultBridge },
  dcf: { stub: 1, longTermGrowth: 0.025, terminalBasis: 'nominal' },
  comps: {
    multipleName: 'EV/EBITDA',
    peers: [
      { ticker: '', multiple: null },
      { ticker: '', multiple: null },
      { ticker: '', multiple: null },
    ],
    companyMetricOverride: null,
  },
  labels: {},
  historicals: [],
  historicalBase: [],
  revenueGrowthManual: [...NO_MANUAL],
  quoteStatus: 'idle',
  quoteError: null,
  financialsStatus: 'idle',
  financialsMessage: null,

  setCompany: (patch) => set((s) => ({ company: { ...s.company, ...patch } })),
  setBase: (field, value) =>
    set((s) => {
      const base = { ...s.base, [field]: value };
      if (field !== 'revenue') return { base };
      return { base, assumptions: applyAutoGrowth(base, s.historicalBase, s.assumptions, s.revenueGrowthManual) };
    }),
  setAssumption: (index, field, value) =>
    set((s) => {
      const assumptions = s.assumptions.map((a, i) => (i === index ? { ...a, [field]: value } : a));
      if (field !== 'revenueGrowth') return { assumptions };
      // Manually editing a growth cell detaches it from the auto CAGR.
      return { assumptions, revenueGrowthManual: s.revenueGrowthManual.map((m, i) => (i === index ? true : m)) };
    }),
  copyAcross: (field) =>
    set((s) => {
      const v = s.assumptions[0][field];
      const assumptions = s.assumptions.map((a) => ({ ...a, [field]: v }));
      if (field !== 'revenueGrowth') return { assumptions };
      return { assumptions, revenueGrowthManual: s.revenueGrowthManual.map(() => true) };
    }),
  setWacc: (field, value) => set((s) => ({ wacc: { ...s.wacc, [field]: value } })),
  setBridge: (field, value) => set((s) => ({ bridge: { ...s.bridge, [field]: value } })),
  setDcf: (patch) => set((s) => ({ dcf: { ...s.dcf, ...patch } })),
  setComps: (patch) => set((s) => ({ comps: { ...s.comps, ...patch } })),
  setPeer: (index, patch) =>
    set((s) => ({ comps: { ...s.comps, peers: s.comps.peers.map((p, i) => (i === index ? { ...p, ...patch } : p)) } })),
  addPeer: () => set((s) => ({ comps: { ...s.comps, peers: [...s.comps.peers, { ticker: '', multiple: null }] } })),
  removePeer: (index) => set((s) => ({ comps: { ...s.comps, peers: s.comps.peers.filter((_, i) => i !== index) } })),
  setLabel: (fieldId, label) =>
    set((s) => {
      const labels = { ...s.labels };
      if (label.trim()) labels[fieldId] = label.trim();
      else delete labels[fieldId];
      return { labels };
    }),
  setHistorical: (fiscalYear, field, value) =>
    set((s) => {
      const historicalBase = s.historicalBase.map((h) =>
        h.fiscalYear === fiscalYear ? { ...h, [field]: value } : h,
      );
      if (field !== 'revenue') return { historicalBase };
      return { historicalBase, assumptions: applyAutoGrowth(s.base, historicalBase, s.assumptions, s.revenueGrowthManual) };
    }),
  resetGrowthAuto: () =>
    set((s) => ({
      revenueGrowthManual: [...NO_MANUAL],
      assumptions: applyAutoGrowth(s.base, s.historicalBase, s.assumptions, NO_MANUAL),
    })),

  fetchQuote: async () => {
    const ticker = get().company.ticker.trim();
    if (!ticker) return;
    set({ quoteStatus: 'loading', quoteError: null });
    try {
      const q = await activeProvider.fetchQuote(ticker);
      set((s) => ({
        quoteStatus: 'ok',
        company: {
          ...s.company,
          name: q.name || s.company.name,
          sharePrice: q.price ?? q.previousClose ?? s.company.sharePrice,
          sharesOutstanding: q.sharesOutstanding ?? s.company.sharesOutstanding,
        },
      }));
    } catch (e) {
      set({ quoteStatus: 'error', quoteError: e instanceof Error ? e.message : 'Fetch failed.' });
    }
  },
  fetchPeerMultiple: async (index) => {
    const { comps } = get();
    const peer = comps.peers[index];
    if (!peer?.ticker.trim()) return;
    try {
      const value = await activeProvider.fetchMultiple(peer.ticker.trim(), comps.multipleName);
      get().setPeer(index, { multiple: value });
    } catch {
      // Leave the field for manual entry on failure.
    }
  },
  fetchFinancials: async () => {
    const ticker = get().company.ticker.trim();
    if (!ticker) return;
    set({ financialsStatus: 'loading', financialsMessage: null });
    try {
      const r = await activeProvider.fetchFinancials(ticker);
      set((s) => {
        const base = { ...s.base };
        // Found fields → the actual value; fields the source couldn't provide →
        // reset to 0 so a prior company's data never lingers (the message lists
        // these for manual entry).
        for (const [k, v] of Object.entries(r.values)) {
          if (k in base && typeof v === 'number') (base as Record<string, number>)[k] = v;
        }
        for (const k of r.missing) {
          if (k in base) (base as Record<string, number>)[k] = 0;
        }
        if (r.fiscalYear) base.fiscalYear = r.fiscalYear;
        // Net debt derives from the base year in useComputed — no bridge prefill.
        // Rebuild every forecast year from clean defaults (so a prior company's
        // seeded assumptions don't linger), then apply this company's seed:
        // rates/ratios flat; dollar drivers ramp at the geometric revenue-growth
        // rate g (forecast year k value = actual × (1 + g)^k).
        const seed = r.seed ?? {};
        const seededKeys = Object.keys(seed).filter((k) => typeof seed[k] === 'number' && Number.isFinite(seed[k]));
        const g = typeof seed.revenueGrowth === 'number' && Number.isFinite(seed.revenueGrowth) ? seed.revenueGrowth : 0;
        const ramp = new Set<string>(RAMP_SEED_FIELDS);
        // Forecast years run forward dynamically from the latest actual year.
        const latestActual = base.fiscalYear;
        const assumptions = [0, 1, 2, 3, 4].map((i) => {
          const na = defaultAssumption(latestActual + i + 1, i);
          for (const k of seededKeys) {
            if (!(k in na)) continue;
            const value = ramp.has(k) ? seed[k] * Math.pow(1 + g, i + 1) : seed[k];
            (na as unknown as Record<string, number>)[k] = value;
          }
          return na;
        });
        const missing = r.missing.length
          ? ` Base fields to enter manually: ${r.missing.join(', ')}.`
          : '';
        const src = r.source === 'yahoo' ? 'Yahoo Finance' : r.form ?? 'filing';
        const cur = r.currency ?? 'actual';
        const verify = r.source === 'yahoo' ? ' Source is unofficial — verify against the report.' : '';
        return {
          base,
          assumptions,
          revenueGrowthManual: [...NO_MANUAL],
          historicals: r.historicals ?? [],
          historicalBase: r.historicalBase ?? [],
          company: { ...s.company, unit: cur === 'USD' ? 'Actual ($)' : `Actual (${cur})` },
          financialsStatus: 'ok',
          financialsMessage:
            `Filled ${r.found.length} base fields + seeded ${seededKeys.length} forecast ` +
            `assumptions from ${src} (FY ${r.fiscalYear ?? '?'}), in ${cur}. ` +
            `Revenue growth = ${(g * 100).toFixed(1)}% (5-yr geometric avg); dollar drivers ramp with it. ` +
            `Starting points from actuals — review & adjust.${verify}${missing}`,
        };
      });
    } catch (e) {
      set({ financialsStatus: 'error', financialsMessage: e instanceof Error ? e.message : 'Fetch failed.' });
    }
  },
}));
