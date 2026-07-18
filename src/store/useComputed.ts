/**
 * Derived valuation results from current inputs. Recomputes only when the
 * relevant slices of state change. All math is delegated to the pure engine.
 */
import { useMemo } from 'react';
import { useModel } from './useModel';
import { buildStatements } from '../engine/statements';
import { runDcf } from '../engine/dcf';
import { runComps } from '../engine/comps';

export function useComputed() {
  const base = useModel((s) => s.base);
  const assumptions = useModel((s) => s.assumptions);
  const wacc = useModel((s) => s.wacc);
  const bridge = useModel((s) => s.bridge);
  const dcfCfg = useModel((s) => s.dcf);
  const comps = useModel((s) => s.comps);
  const shares = useModel((s) => s.company.sharesOutstanding);

  return useMemo(() => {
    const statements = buildStatements(base, assumptions);
    // Net debt derives from the base year (debt & cash) plus the bridge's other
    // items, so editing the base-year balance sheet flows straight into the DCF.
    const effectiveBridge = {
      ...bridge,
      debt: base.longTermDebt + base.commercialPaper,
      cashAndEquivalents: base.cash,
    };
    const dcf = runDcf({
      years: statements.dcfYears,
      wacc,
      stub: dcfCfg.stub,
      longTermGrowth: dcfCfg.longTermGrowth,
      bridge: effectiveBridge,
      sharesOutstanding: shares,
      terminalBasis: dcfCfg.terminalBasis,
    });
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
    return { statements, dcf, compsResult, terminalEbitda, companyMetric };
  }, [base, assumptions, wacc, bridge, dcfCfg, comps, shares]);
}
