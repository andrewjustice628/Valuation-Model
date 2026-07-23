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
import { runFinancialValuation } from '../engine/financialValuation';
import { bottomUpBeta, targetDebtEquity } from '../engine/bottomUpBeta';
import { SECTOR_METHODS } from './useModel';

export function useComputed() {
  const base = useModel((s) => s.base);
  const assumptions = useModel((s) => s.assumptions);
  const wacc = useModel((s) => s.wacc);
  const betaConfig = useModel((s) => s.betaConfig);
  const bridge = useModel((s) => s.bridge);
  const dcfCfg = useModel((s) => s.dcf);
  const comps = useModel((s) => s.comps);
  const precedent = useModel((s) => s.precedent);
  const shares = useModel((s) => s.company.sharesOutstanding);
  const sharePrice = useModel((s) => s.company.sharePrice);
  const sector = useModel((s) => s.company.sector);
  const financials = useModel((s) => s.financials);

  return useMemo(() => {
    const statements = buildStatements(base, assumptions);

    // Effective beta: bottom-up industry beta when selected, else the fetched/manual beta.
    // Target D/E for relevering derives from the company's own leverage (base-year
    // debt over equity market cap) unless the user has overridden it.
    const autoTargetDE = targetDebtEquity(base.longTermDebt + base.commercialPaper, sharePrice * shares);
    const effectiveTargetDE = betaConfig.targetDEAuto && Number.isFinite(autoTargetDE) ? autoTargetDE : betaConfig.targetDE;
    const bu = bottomUpBeta(
      betaConfig.peers.map((p) => ({ leveredBeta: p.leveredBeta ?? NaN, deRatio: p.deRatio ?? NaN })),
      effectiveTargetDE,
      wacc.taxRate,
    );
    const effectiveBeta = betaConfig.method === 'bottomUp' && Number.isFinite(bu.releveredBeta) ? bu.releveredBeta : wacc.beta;
    const effWacc = { ...wacc, beta: effectiveBeta };
    // Net debt derives from the base year (debt & cash) plus the bridge's other
    // items, so editing the base-year balance sheet flows straight into the DCF.
    const effectiveBridge = {
      ...bridge,
      debt: base.longTermDebt + base.commercialPaper,
      cashAndEquivalents: base.cash,
    };
    const dcfInput = {
      years: statements.dcfYears,
      wacc: effWacc,
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
    const precedentMultiples = precedent.deals
      .map((d) => d.multiple)
      .filter((m): m is number => typeof m === 'number' && Number.isFinite(m));
    const precedentResult = runComps({
      multipleName: precedent.multipleName,
      companyMetric,
      peerMultiples: precedentMultiples,
      netDebt: dcf.netDebt,
      sharesOutstanding: shares,
    });
    const diagnostics = runDiagnostics({ dcf, statements, longTermGrowth: dcfCfg.longTermGrowth, sharePrice });
    const sensitivity = sensitivityMatrix(dcfInput, { n: 5 });

    // Reverse DCF — the revenue growth the current price implies.
    const impliedGrowth = sharePrice > 0
      ? impliedRevenueGrowth({ base, assumptions, wacc: effWacc, stub: dcfCfg.stub, longTermGrowth: dcfCfg.longTermGrowth, bridge: effectiveBridge, sharesOutstanding: shares, terminalBasis: dcfCfg.terminalBasis, targetPerShare: sharePrice })
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
    // Financials (banks/insurers): two-stage model from dedicated inputs —
    // book/dividends compound at ROE×(1−payout) for a high-growth stage, then
    // fade to a terminal rate. Removes the single-stage g < cost-of-equity limit.
    const usesFinancials = sector === 'financial' || sector === 'reit';
    const fin = runFinancialValuation({
      bookValuePerShare: financials.bookValuePerShare, roe: financials.roe, payoutRatio: financials.payoutRatio,
      highGrowthYears: financials.highGrowthYears, terminalGrowth: financials.terminalGrowth, costOfEquity,
    });
    const ddmPerShare = usesFinancials ? fin.ddmPerShare : ddm.perShare;
    const ddmNote = usesFinancials
      ? `Two-stage: ${(fin.gHigh * 100).toFixed(1)}% for ${financials.highGrowthYears}y → ${(financials.terminalGrowth * 100).toFixed(1)}%`
      : 'Forecast dividends @ cost of equity';
    const pbPerShare = usesFinancials ? fin.pbPerShare : NaN;

    const financialsWarning =
      usesFinancials && !fin.valid
        ? `Cost of equity ${(costOfEquity * 100).toFixed(1)}% is at or below the terminal growth ${(financials.terminalGrowth * 100).toFixed(1)}% — lower the terminal growth or set the bank's WACC/CAPM inputs (a higher beta raises cost of equity).`
        : null;

    const rec = new Set(SECTOR_METHODS[sector]);
    const methods = [
      { id: 'dcf', label: 'Discounted Cash Flow', perShare: dcf.equityValuePerShare, note: 'Unlevered FCF → enterprise value', recommended: rec.has('dcf') },
      { id: 'comps', label: 'Comparable Companies', perShare: compsResult.equityValuePerShare, note: comps.multipleName, recommended: rec.has('comps') },
      { id: 'precedent', label: 'Precedent Transactions', perShare: precedentResult.equityValuePerShare, note: `${precedent.multipleName} · ${precedentMultiples.length} deals`, recommended: rec.has('precedent') },
      { id: 'ddm', label: 'Dividend Discount', perShare: ddmPerShare, note: ddmNote, recommended: rec.has('ddm') },
      { id: 'fcfe', label: 'FCFE (levered)', perShare: fcfe.perShare, note: 'Equity cash flow @ cost of equity', recommended: rec.has('fcfe') },
      { id: 'pb', label: 'Justified P/B (steady-state)', perShare: pbPerShare, note: `Implied P/B ${Number.isFinite(fin.justifiedPb) ? `${fin.justifiedPb.toFixed(2)}×` : '—'}`, recommended: rec.has('pb') },
    ];

    // Football field — DCF & comps ranges, plus recommended point-methods.
    const dcfVals = sensitivity.perShare.flat().filter((v) => Number.isFinite(v));
    const ranges: { label: string; low: number; base: number; high: number }[] = [
      { label: 'DCF (WACC/growth range)', low: Math.min(...dcfVals), base: dcf.equityValuePerShare, high: Math.max(...dcfVals) },
    ];
    const perShareFromMultiple = (m: number) => (shares > 0 ? (companyMetric * m - dcf.netDebt) / shares : NaN);
    if (peerMultiples.length > 0) {
      const compPs = peerMultiples.map(perShareFromMultiple).filter((v) => Number.isFinite(v));
      if (compPs.length) ranges.push({ label: `Comps (${comps.multipleName})`, low: Math.min(...compPs), base: compsResult.equityValuePerShare, high: Math.max(...compPs) });
    }
    if (precedentMultiples.length > 0) {
      const precPs = precedentMultiples.map(perShareFromMultiple).filter((v) => Number.isFinite(v));
      if (precPs.length) ranges.push({ label: `Precedent (${precedent.multipleName})`, low: Math.min(...precPs), base: precedentResult.equityValuePerShare, high: Math.max(...precPs) });
    }
    for (const m of methods) {
      if (m.recommended && (m.id === 'ddm' || m.id === 'fcfe' || m.id === 'pb') && Number.isFinite(m.perShare)) {
        ranges.push({ label: m.label, low: m.perShare, base: m.perShare, high: m.perShare });
      }
    }
    const footballField = { ranges, price: sharePrice };

    const betaInfo = { method: betaConfig.method, assetBeta: bu.assetBeta, releveredBeta: bu.releveredBeta, count: bu.count, effectiveBeta, targetDE: effectiveTargetDE, targetDEAuto: betaConfig.targetDEAuto && Number.isFinite(autoTargetDE) };
    return { statements, dcf, compsResult, terminalEbitda, companyMetric, diagnostics, sensitivity, impliedGrowth, assumedGrowth, footballField, methods, sector, financialsWarning, betaInfo };
  }, [base, assumptions, wacc, betaConfig, bridge, dcfCfg, comps, precedent, shares, sharePrice, sector, financials]);
}
