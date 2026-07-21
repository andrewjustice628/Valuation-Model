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

export function useComputed() {
  const base = useModel((s) => s.base);
  const assumptions = useModel((s) => s.assumptions);
  const wacc = useModel((s) => s.wacc);
  const bridge = useModel((s) => s.bridge);
  const dcfCfg = useModel((s) => s.dcf);
  const comps = useModel((s) => s.comps);
  const shares = useModel((s) => s.company.sharesOutstanding);
  const sharePrice = useModel((s) => s.company.sharePrice);

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

    // Football field — value-per-share ranges by method.
    const dcfVals = sensitivity.perShare.flat().filter((v) => Number.isFinite(v));
    const ranges: { label: string; low: number; base: number; high: number }[] = [
      { label: 'DCF (WACC/growth range)', low: Math.min(...dcfVals), base: dcf.equityValuePerShare, high: Math.max(...dcfVals) },
    ];
    if (peerMultiples.length > 0) {
      const psFromMultiple = (m: number) => (shares > 0 ? (companyMetric * m - dcf.netDebt) / shares : NaN);
      const compPs = peerMultiples.map(psFromMultiple).filter((v) => Number.isFinite(v));
      if (compPs.length) ranges.push({ label: `Comps (${comps.multipleName})`, low: Math.min(...compPs), base: compsResult.equityValuePerShare, high: Math.max(...compPs) });
    }
    const footballField = { ranges, price: sharePrice };

    return { statements, dcf, compsResult, terminalEbitda, companyMetric, diagnostics, sensitivity, impliedGrowth, assumedGrowth, footballField };
  }, [base, assumptions, wacc, bridge, dcfCfg, comps, shares, sharePrice]);
}
