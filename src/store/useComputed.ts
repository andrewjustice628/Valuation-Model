/**
 * Derived valuation results from current inputs. Recomputes only when the
 * relevant slices of state change. All math is delegated to the pure engine.
 */
import { useMemo } from 'react';
import { useModel } from './useModel';
import { buildStatements } from '../engine/statements';
import { runDcf } from '../engine/dcf';
import { runComps } from '../engine/comps';
import { runDiagnostics } from '../engine/diagnostics';
import { sensitivityMatrix } from '../engine/sensitivity';
import { impliedRevenueGrowth } from '../engine/reverseDcf';
import { runDdm } from '../engine/ddm';
import { runFcfe } from '../engine/fcfe';
import { runJustifiedPb } from '../engine/justifiedPb';
import { SECTOR_METHODS } from './useModel';

export function useComputed() {
  const base = useModel((s) => s.base);
  const assumptions = useModel((s) => s.assumptions);
  const wacc = useModel((s) => s.wacc);
  const bridge = useModel((s) => s.bridge);
  const dcfCfg = useModel((s) => s.dcf);
  const comps = useModel((s) => s.comps);
  const shares = useModel((s) => s.company.sharesOutstanding);
  const sharePrice = useModel((s) => s.company.sharePrice);
  const sector = useModel((s) => s.company.sector);

  return useMemo(() => {
    const statements = buildStatements(base, assumptions);
    // Net debt derives from the base year (debt & cash) plus the bridge's other
    // items, so editing the base-year balance sheet flows straight into the DCF.
    const effectiveBridge = {
      ...bridge,
      debt: base.longTermDebt + base.commercialPaper,
      cashAndEquivalents: base.cash,
    };
    const dcfInput = {
      years: statements.dcfYears,
      wacc,
      stub: dcfCfg.stub,
      longTermGrowth: dcfCfg.longTermGrowth,
      bridge: effectiveBridge,
      sharesOutstanding: shares,
      terminalBasis: dcfCfg.terminalBasis,
      terminalMethod: dcfCfg.terminalMethod,
      exitMultiple: dcfCfg.exitMultiple,
    };
    const dcf = runDcf(dcfInput);
    const last = statements.years[statements.years.length - 1];
    const terminalEbitda = last ? last.incomeStatement.ebitda : 0;
    const companyMetric = comps.companyMetricOverride ?? terminalEbitda;
    const peerMultiples = comps.peers
      .map((p) => p.multiple)
      .filter((m): m is number => typeof m === 'number' && Number.isFinite(m));
    const compsResult = runComps({
      multipleName: comps.multipleName,
      companyMetric,
      peerMultiples,
      netDebt: dcf.netDebt,
      sharesOutstanding: shares,
    });
    const diagnostics = runDiagnostics({ dcf, statements, longTermGrowth: dcfCfg.longTermGrowth, sharePrice });
    const sensitivity = sensitivityMatrix(dcfInput, { n: 5 });

    // Reverse DCF — the revenue growth the current price implies.
    const impliedGrowth = sharePrice > 0
      ? impliedRevenueGrowth({ base, assumptions, wacc, stub: dcfCfg.stub, longTermGrowth: dcfCfg.longTermGrowth, bridge: effectiveBridge, sharesOutstanding: shares, terminalBasis: dcfCfg.terminalBasis, targetPerShare: sharePrice })
      : null;
    const assumedGrowth = assumptions.length
      ? assumptions.reduce((s, a) => s + a.revenueGrowth, 0) / assumptions.length
      : 0;

    // Sector-appropriate methods (inputs auto-derived from the model).
    const costOfEquity = dcf.wacc.costOfEquity;
    const ddm = runDdm({ dividends: assumptions.map((a) => a.dividends), costOfEquity, stub: dcfCfg.stub, terminalGrowth: dcfCfg.longTermGrowth, sharesOutstanding: shares });
    const fcfe = runFcfe({
      years: statements.years.map((y, i) => ({
        netIncome: y.incomeStatement.netIncome, da: y.incomeStatement.da,
        capex: dcf.years[i].capex, changeInNwc: dcf.years[i].changeInNwc,
        netBorrowing: assumptions[i].longTermDebtChange + assumptions[i].commercialPaperChange,
      })),
      costOfEquity, stub: dcfCfg.stub, terminalGrowth: dcfCfg.longTermGrowth, sharesOutstanding: shares,
    });
    const bookEquity = base.retainedEarnings + base.otherComprehensiveIncome + base.commonStock;
    const roe = bookEquity !== 0 ? statements.years[0].incomeStatement.netIncome / bookEquity : NaN;
    const pb = runJustifiedPb({ bookEquity, roe, costOfEquity, growth: dcfCfg.longTermGrowth, sharesOutstanding: shares });

    const rec = new Set(SECTOR_METHODS[sector]);
    const methods = [
      { id: 'dcf', label: 'Discounted Cash Flow', perShare: dcf.equityValuePerShare, note: 'Unlevered FCF → enterprise value', recommended: rec.has('dcf') },
      { id: 'comps', label: 'Comparable Companies', perShare: compsResult.equityValuePerShare, note: comps.multipleName, recommended: rec.has('comps') },
      { id: 'ddm', label: 'Dividend Discount', perShare: ddm.perShare, note: 'Dividends @ cost of equity', recommended: rec.has('ddm') },
      { id: 'fcfe', label: 'FCFE (levered)', perShare: fcfe.perShare, note: 'Equity cash flow @ cost of equity', recommended: rec.has('fcfe') },
      { id: 'pb', label: 'Justified P/B (ROE)', perShare: pb.perShare, note: `Implied P/B ${Number.isFinite(pb.justifiedPb) ? `${pb.justifiedPb.toFixed(2)}×` : '—'}`, recommended: rec.has('pb') },
    ];

    // Football field — DCF & comps ranges, plus recommended point-methods.
    const dcfVals = sensitivity.perShare.flat().filter((v) => Number.isFinite(v));
    const ranges: { label: string; low: number; base: number; high: number }[] = [
      { label: 'DCF (WACC/growth range)', low: Math.min(...dcfVals), base: dcf.equityValuePerShare, high: Math.max(...dcfVals) },
    ];
    if (peerMultiples.length > 0) {
      const psFromMultiple = (m: number) => (shares > 0 ? (companyMetric * m - dcf.netDebt) / shares : NaN);
      const compPs = peerMultiples.map(psFromMultiple).filter((v) => Number.isFinite(v));
      if (compPs.length) ranges.push({ label: `Comps (${comps.multipleName})`, low: Math.min(...compPs), base: compsResult.equityValuePerShare, high: Math.max(...compPs) });
    }
    for (const m of methods) {
      if (m.recommended && (m.id === 'ddm' || m.id === 'fcfe' || m.id === 'pb') && Number.isFinite(m.perShare)) {
        ranges.push({ label: m.label, low: m.perShare, base: m.perShare, high: m.perShare });
      }
    }
    const footballField = { ranges, price: sharePrice };

    return { statements, dcf, compsResult, terminalEbitda, companyMetric, diagnostics, sensitivity, impliedGrowth, assumedGrowth, footballField, methods, sector };
  }, [base, assumptions, wacc, bridge, dcfCfg, comps, shares, sharePrice, sector]);
}
