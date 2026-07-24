/**
 * Application state (zustand). Holds every input, plus market-fetch status and
 * the label-alias map (the "call it what your report calls it" layer). Pure
 * engine computation lives in src/engine and is called by selectors below.
 */
import { create } from 'zustand';
import { activeProvider } from '../lib/marketData';
import { RAMP_SEED_FIELDS, revenueGrowthFromHistory, effectiveTaxRate } from '../lib/seed';
import { blumeAdjustedBeta } from '../engine/finance';
import { runMonteCarlo, mulberry32, type MonteCarloResult } from '../engine/monteCarlo';
import { loadAll, saveAll, type SavedModel } from '../lib/persistence';
import type { HistoricalYear } from '../lib/historicals';
import type { BaseYear, ForecastAssumptions } from '../engine/statements';
import type { NetDebtBridge, WaccAssumptions } from '../engine/types';

export type Sector = 'corporate' | 'financial' | 'reit' | 'utility';

export interface CompanyInfo {
  ticker: string;
  name: string;
  unit: string;
  sharePrice: number;
  sharesOutstanding: number;
  sector: Sector;
}

/** Which valuation methods fit each sector (recommended, not exclusive). */
export const SECTOR_METHODS: Record<Sector, string[]> = {
  corporate: ['dcf', 'comps', 'precedent'],
  financial: ['ddm', 'pb', 'comps', 'precedent'],
  reit: ['ddm', 'comps', 'precedent'],
  utility: ['ddm', 'dcf'],
};

/** Map a data-provider industry string to a sector. */
export function sectorFromIndustry(industry: string | null | undefined): Sector {
  const s = (industry ?? '').toLowerCase();
  if (/bank|insurance|financ|capital markets|asset management/.test(s)) return 'financial';
  if (/reit|real estate/.test(s)) return 'reit';
  if (/utilit/.test(s)) return 'utility';
  return 'corporate';
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

export interface PrecedentDeal {
  label: string;
  multiple: number | null;
}

/** Precedent M&A transaction multiples (manual — include control premium). */
export interface PrecedentConfig {
  multipleName: string;
  deals: PrecedentDeal[];
}

export interface DcfConfig {
  stub: number;
  longTermGrowth: number;
  terminalBasis: 'nominal' | 'faithful';
  terminalMethod: 'perpetuity' | 'exitMultiple';
  exitMultiple: number;
}

export interface BetaPeer {
  ticker: string;
  leveredBeta: number | null;
  deRatio: number | null;
}

/** Monte Carlo settings: trial count, per-driver shock std devs, and RNG seed. */
export interface McConfig {
  trials: number;
  revenueGrowthSd: number;
  marginSd: number;
  waccSd: number;
  terminalGrowthSd: number;
  seed: number;
}

export const defaultMcConfig: McConfig = {
  trials: 5000, revenueGrowthSd: 0.03, marginSd: 0.02, waccSd: 0.01, terminalGrowthSd: 0.005, seed: 12345,
};

/** Beta source for CAPM: the fetched (Blume-adjusted) beta, or bottom-up industry. */
export interface BetaConfig {
  method: 'fetched' | 'bottomUp';
  peers: BetaPeer[];
  targetDE: number;
  /** When true, targetDE is derived from the base-year debt & equity market cap. */
  targetDEAuto: boolean;
}

/** Dedicated inputs for valuing financials (banks/insurers) — drive DDM & P/B. */
export interface FinancialsConfig {
  bookValuePerShare: number;
  roe: number;
  payoutRatio: number;
  highGrowthYears: number;
  terminalGrowth: number;
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
  rd: 50, sga: 150, da: 50, interestIncome: 5, interestExpense: 10, otherExpenses: 15, taxes: 27,
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

/** Geometric CAGR from the editable prior years + the (editable) latest year. */
function growthFromHistory(base: BaseYear, historicalBase: Array<Record<string, number>>): number | undefined {
  const priors = historicalBase.filter((h) => h.fiscalYear < base.fiscalYear);
  return revenueGrowthFromHistory([
    ...priors.map((p) => ({ year: p.fiscalYear, revenue: p.revenue })),
    { year: base.fiscalYear, revenue: base.revenue },
  ]);
}

/**
 * Ratios derived by looking back at the (editable) base-year actuals. Each
 * recomputes live when the underlying base figures are edited.
 */
const RATIO_FROM_BASE: Record<string, (b: BaseYear) => number | undefined> = {
  grossMargin: (b) => (b.revenue > 0 ? (b.revenue - b.cogs) / b.revenue : undefined),
  rdPctSales: (b) => (b.revenue > 0 ? b.rd / b.revenue : undefined),
  sgaPctSales: (b) => (b.revenue > 0 ? b.sga / b.revenue : undefined),
  taxRate: (b) => {
    const ebit = b.revenue - b.cogs - b.rd - b.sga - b.da;
    const pretax = ebit + b.interestIncome - b.interestExpense - b.otherExpenses;
    return effectiveTaxRate(b.taxes, pretax);
  },
  arPctRevenue: (b) => (b.revenue > 0 ? b.accountsReceivable / b.revenue : undefined),
  invPctCogs: (b) => (b.cogs > 0 ? b.inventories / b.cogs : undefined),
  otherCurrentAssetsPctRevenue: (b) => (b.revenue > 0 ? b.otherCurrentAssets / b.revenue : undefined),
  apPctCogs: (b) => (b.cogs > 0 ? b.accountsPayable / b.cogs : undefined),
  otherCurrentLiabilitiesPctRevenue: (b) => (b.revenue > 0 ? b.otherCurrentLiabilities / b.revenue : undefined),
  deferredRevenuePctRevenue: (b) => (b.revenue > 0 ? b.deferredRevenue / b.revenue : undefined),
  otherNonCurrentAssetsPctRevenue: (b) => (b.revenue > 0 ? b.otherNonCurrentAssets / b.revenue : undefined),
  otherNonCurrentLiabilitiesPctRevenue: (b) => (b.revenue > 0 ? b.otherNonCurrentLiabilities / b.revenue : undefined),
};

/** Assumption fields that auto-derive from historical actuals. */
export const AUTO_FIELDS = new Set<string>(['revenueGrowth', ...Object.keys(RATIO_FROM_BASE)]);

function autoValue(field: string, base: BaseYear, historicalBase: Array<Record<string, number>>): number | undefined {
  if (field === 'revenueGrowth') return growthFromHistory(base, historicalBase);
  return RATIO_FROM_BASE[field]?.(base);
}

/** Recompute every auto field into the forecast years that aren't overridden. */
function applyAuto(
  base: BaseYear,
  historicalBase: Array<Record<string, number>>,
  assumptions: ForecastAssumptions[],
  overrides: Record<string, boolean[]>,
): ForecastAssumptions[] {
  return assumptions.map((a, i) => {
    const na = { ...a } as Record<string, number>;
    for (const field of AUTO_FIELDS) {
      if (overrides[field]?.[i]) continue;
      const v = autoValue(field, base, historicalBase);
      if (v !== undefined) na[field] = v;
    }
    return na as unknown as ForecastAssumptions;
  });
}

const markOverride = (o: Record<string, boolean[]>, field: string, index: number): Record<string, boolean[]> => {
  const arr = o[field] ? [...o[field]] : [false, false, false, false, false];
  arr[index] = true;
  return { ...o, [field]: arr };
};
const markAll = (o: Record<string, boolean[]>, field: string): Record<string, boolean[]> => ({
  ...o,
  [field]: [true, true, true, true, true],
});

/** The serializable definition of a model (everything a save/load must carry). */
export interface ModelSnapshot {
  company: CompanyInfo;
  base: BaseYear;
  assumptions: ForecastAssumptions[];
  wacc: WaccAssumptions;
  bridge: NetDebtBridge;
  dcf: DcfConfig;
  comps: CompsConfig;
  precedent: PrecedentConfig;
  financials: FinancialsConfig;
  betaConfig: BetaConfig;
  mc: McConfig;
  labels: Record<string, string>;
  historicals: HistoricalYear[];
  historicalBase: Array<Record<string, number>>;
  manualOverrides: Record<string, boolean[]>;
}

function initialModel(): ModelSnapshot {
  return {
    company: { ticker: 'AAPL', name: 'Example Corp', unit: 'Thousands', sharePrice: 0, sharesOutstanding: 1000, sector: 'corporate' },
    base: { ...defaultBase },
    assumptions: YEARS.map((y, i) => defaultAssumption(y, i)),
    wacc: { ...defaultWacc },
    bridge: { ...defaultBridge },
    dcf: { stub: 1, longTermGrowth: 0.025, terminalBasis: 'nominal', terminalMethod: 'perpetuity', exitMultiple: 12 },
    comps: {
      multipleName: 'EV/EBITDA',
      peers: [{ ticker: '', multiple: null }, { ticker: '', multiple: null }, { ticker: '', multiple: null }],
      companyMetricOverride: null,
    },
    precedent: {
      multipleName: 'EV/EBITDA',
      deals: [{ label: '', multiple: null }, { label: '', multiple: null }, { label: '', multiple: null }],
    },
    financials: { bookValuePerShare: 50, roe: 0.12, payoutRatio: 0.4, highGrowthYears: 10, terminalGrowth: 0.025 },
    betaConfig: {
      method: 'fetched',
      peers: [{ ticker: '', leveredBeta: null, deRatio: null }, { ticker: '', leveredBeta: null, deRatio: null }, { ticker: '', leveredBeta: null, deRatio: null }],
      targetDE: 0.5,
      targetDEAuto: true,
    },
    mc: { ...defaultMcConfig },
    labels: {},
    historicals: [],
    historicalBase: [],
    manualOverrides: {},
  };
}

const TRANSIENT = {
  quoteStatus: 'idle' as FetchStatus, quoteError: null,
  financialsStatus: 'idle' as FetchStatus, financialsMessage: null,
  betaFetch: null as { raw: number; adjusted: number } | null,
  mcResult: null as MonteCarloResult | null,
};

export interface ModelState {
  company: CompanyInfo;
  base: BaseYear;
  assumptions: ForecastAssumptions[];
  wacc: WaccAssumptions;
  bridge: NetDebtBridge;
  dcf: DcfConfig;
  comps: CompsConfig;
  precedent: PrecedentConfig;
  financials: FinancialsConfig;
  betaConfig: BetaConfig;
  mc: McConfig;
  labels: Record<string, string>;
  historicals: HistoricalYear[];
  historicalBase: Array<Record<string, number>>;
  /** Per auto-field, per-forecast-year: true = user overrode it (stop auto). */
  manualOverrides: Record<string, boolean[]>;
  quoteStatus: FetchStatus;
  quoteError: string | null;
  financialsStatus: FetchStatus;
  financialsMessage: string | null;
  /** Raw vs Blume-adjusted beta from the last quote fetch (for display). */
  betaFetch: { raw: number; adjusted: number } | null;
  /** Last Monte Carlo run (on-demand; null until the user runs one). */
  mcResult: MonteCarloResult | null;
  savedModels: SavedModel<ModelSnapshot>[];
  currentName: string;

  saveModel: (name: string) => void;
  loadModel: (id: string) => void;
  deleteModel: (id: string) => void;
  newModel: () => void;
  importSnapshot: (snapshot: ModelSnapshot) => void;
  snapshot: () => ModelSnapshot;
  setCompany: (patch: Partial<CompanyInfo>) => void;
  setBase: (field: keyof BaseYear, value: number) => void;
  setAssumption: (index: number, field: keyof ForecastAssumptions, value: number) => void;
  copyAcross: (field: keyof ForecastAssumptions) => void;
  setWacc: (field: keyof WaccAssumptions, value: number) => void;
  setBridge: (field: keyof NetDebtBridge, value: number) => void;
  setDcf: (patch: Partial<DcfConfig>) => void;
  setComps: (patch: Partial<CompsConfig>) => void;
  setPrecedent: (patch: Partial<PrecedentConfig>) => void;
  setFinancials: (patch: Partial<FinancialsConfig>) => void;
  setBetaConfig: (patch: Partial<BetaConfig>) => void;
  fetchBetaPeer: (index: number) => Promise<void>;
  setMc: (patch: Partial<McConfig>) => void;
  runSimulation: (derived: { wacc: WaccAssumptions; baseWacc: number; bridge: NetDebtBridge }) => void;
  setPeer: (index: number, patch: Partial<Peer>) => void;
  addPeer: () => void;
  removePeer: (index: number) => void;
  setLabel: (fieldId: string, label: string) => void;
  setHistorical: (fiscalYear: number, field: string, value: number) => void;
  resetAuto: (field: string) => void;
  fetchQuote: () => Promise<void>;
  fetchPeerMultiple: (index: number) => Promise<void>;
  fetchFinancials: () => Promise<void>;
}

export const useModel = create<ModelState>((set, get) => ({
  ...initialModel(),
  ...TRANSIENT,
  savedModels: loadAll<ModelSnapshot>(),
  currentName: 'Untitled',

  snapshot: () => {
    const s = get();
    return {
      company: s.company, base: s.base, assumptions: s.assumptions, wacc: s.wacc, bridge: s.bridge,
      dcf: s.dcf, comps: s.comps, precedent: s.precedent, financials: s.financials, betaConfig: s.betaConfig,
      mc: s.mc, labels: s.labels, historicals: s.historicals, historicalBase: s.historicalBase, manualOverrides: s.manualOverrides,
    };
  },
  saveModel: (name) =>
    set((s) => {
      const snapshot = get().snapshot();
      const list = [...s.savedModels];
      const idx = list.findIndex((m) => m.name === name);
      const entry: SavedModel<ModelSnapshot> = {
        id: idx >= 0 ? list[idx].id : `m_${Date.now()}`, name, savedAt: Date.now(), snapshot,
      };
      if (idx >= 0) list[idx] = entry;
      else list.push(entry);
      saveAll(list);
      return { savedModels: list, currentName: name };
    }),
  loadModel: (id) =>
    set((s) => {
      const m = s.savedModels.find((x) => x.id === id);
      if (!m) return {};
      return { ...m.snapshot, ...TRANSIENT, currentName: m.name };
    }),
  deleteModel: (id) =>
    set((s) => {
      const list = s.savedModels.filter((x) => x.id !== id);
      saveAll(list);
      return { savedModels: list };
    }),
  newModel: () => set(() => ({ ...initialModel(), ...TRANSIENT, currentName: 'Untitled' })),
  importSnapshot: (snapshot) => set(() => ({ ...snapshot, ...TRANSIENT, currentName: 'Imported' })),

  setCompany: (patch) => set((s) => ({ company: { ...s.company, ...patch } })),
  setBase: (field, value) =>
    set((s) => {
      const base = { ...s.base, [field]: value };
      // Editing any base actual re-derives the history-based assumptions.
      return { base, assumptions: applyAuto(base, s.historicalBase, s.assumptions, s.manualOverrides) };
    }),
  setAssumption: (index, field, value) =>
    set((s) => {
      const assumptions = s.assumptions.map((a, i) => (i === index ? { ...a, [field]: value } : a));
      if (!AUTO_FIELDS.has(field)) return { assumptions };
      // Manually editing an auto field detaches that cell from the live formula.
      return { assumptions, manualOverrides: markOverride(s.manualOverrides, field, index) };
    }),
  copyAcross: (field) =>
    set((s) => {
      const v = s.assumptions[0][field];
      const assumptions = s.assumptions.map((a) => ({ ...a, [field]: v }));
      if (!AUTO_FIELDS.has(field)) return { assumptions };
      return { assumptions, manualOverrides: markAll(s.manualOverrides, field) };
    }),
  setWacc: (field, value) => set((s) => ({ wacc: { ...s.wacc, [field]: value } })),
  setBridge: (field, value) => set((s) => ({ bridge: { ...s.bridge, [field]: value } })),
  setDcf: (patch) => set((s) => ({ dcf: { ...s.dcf, ...patch } })),
  setComps: (patch) => set((s) => ({ comps: { ...s.comps, ...patch } })),
  setPrecedent: (patch) => set((s) => ({ precedent: { ...s.precedent, ...patch } })),
  setFinancials: (patch) => set((s) => ({ financials: { ...s.financials, ...patch } })),
  setBetaConfig: (patch) => set((s) => ({ betaConfig: { ...s.betaConfig, ...patch } })),
  fetchBetaPeer: async (index) => {
    const peer = get().betaConfig.peers[index];
    if (!peer?.ticker.trim()) return;
    try {
      const { beta, deRatio } = await activeProvider.fetchBeta(peer.ticker.trim());
      set((s) => ({
        betaConfig: {
          ...s.betaConfig,
          peers: s.betaConfig.peers.map((p, i) =>
            i === index ? { ...p, leveredBeta: beta ?? p.leveredBeta, deRatio: deRatio ?? p.deRatio } : p,
          ),
        },
      }));
    } catch {
      // leave the row for manual entry
    }
  },
  setMc: (patch) => set((s) => ({ mc: { ...s.mc, ...patch } })),
  runSimulation: (derived) => {
    const s = get();
    const { trials, revenueGrowthSd, marginSd, waccSd, terminalGrowthSd, seed } = s.mc;
    const result = runMonteCarlo({
      base: s.base,
      assumptions: s.assumptions,
      wacc: derived.wacc,
      baseWacc: derived.baseWacc,
      stub: s.dcf.stub,
      longTermGrowth: s.dcf.longTermGrowth,
      bridge: derived.bridge,
      sharesOutstanding: s.company.sharesOutstanding,
      terminalBasis: s.dcf.terminalBasis,
      terminalMethod: s.dcf.terminalMethod,
      exitMultiple: s.dcf.exitMultiple,
      sharePrice: s.company.sharePrice,
      config: { trials, revenueGrowthSd, marginSd, waccSd, terminalGrowthSd },
      rng: mulberry32(seed),
    });
    set({ mcResult: result });
  },
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
      return { historicalBase, assumptions: applyAuto(s.base, historicalBase, s.assumptions, s.manualOverrides) };
    }),
  resetAuto: (field) =>
    set((s) => {
      const manualOverrides = { ...s.manualOverrides };
      delete manualOverrides[field];
      return { manualOverrides, assumptions: applyAuto(s.base, s.historicalBase, s.assumptions, manualOverrides) };
    }),

  fetchQuote: async () => {
    const ticker = get().company.ticker.trim();
    if (!ticker) return;
    set({ quoteStatus: 'loading', quoteError: null });
    try {
      const q = await activeProvider.fetchQuote(ticker);
      const rawBeta = typeof q.beta === 'number' && Number.isFinite(q.beta) ? q.beta : null;
      const adjustedBeta = rawBeta != null ? blumeAdjustedBeta(rawBeta) : null;
      set((s) => ({
        quoteStatus: 'ok',
        company: {
          ...s.company,
          name: q.name || s.company.name,
          sharePrice: q.price ?? q.previousClose ?? s.company.sharePrice,
          sharesOutstanding: q.sharesOutstanding ?? s.company.sharesOutstanding,
          sector: q.industry ? sectorFromIndustry(q.industry) : s.company.sector,
        },
        // Fetched beta is a raw regression beta; use the Blume-adjusted value in CAPM.
        wacc: adjustedBeta != null ? { ...s.wacc, beta: adjustedBeta } : s.wacc,
        betaFetch: rawBeta != null && adjustedBeta != null ? { raw: rawBeta, adjusted: adjustedBeta } : s.betaFetch,
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
          manualOverrides: {},
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
