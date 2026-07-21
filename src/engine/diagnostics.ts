/**
 * Diagnostics / sanity checks — surfaces the classic ways a DCF misleads, so
 * bad inputs get flagged instead of silently producing a confident wrong number.
 * Pure module; consumes engine outputs and returns ranked findings.
 */
import type { DcfResult } from './types';
import type { StatementsResult } from './statements';

export interface Finding {
  level: 'error' | 'warn' | 'info';
  title: string;
  detail: string;
}

export interface DiagnosticsInput {
  dcf: DcfResult;
  statements: StatementsResult;
  longTermGrowth: number;
  sharePrice: number;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function runDiagnostics({ dcf, statements, longTermGrowth, sharePrice }: DiagnosticsInput): Finding[] {
  const f: Finding[] = [];
  const wacc = dcf.wacc.wacc;

  // --- Errors: the math is invalid ---
  if (wacc <= longTermGrowth) {
    f.push({
      level: 'error',
      title: 'WACC is below the terminal growth rate',
      detail: `WACC ${pct(wacc)} ≤ terminal growth ${pct(longTermGrowth)}. The terminal value formula divides by (WACC − g), so the result is meaningless. Lower terminal growth or raise WACC.`,
    });
  }
  if (!Number.isFinite(dcf.equityValuePerShare)) {
    f.push({ level: 'error', title: 'Per-share value is not a number', detail: 'Check shares outstanding and the inputs feeding the DCF.' });
  }

  // --- Warnings: plausible-looking but suspicious ---
  if (dcf.enterpriseValue > 0) {
    const tvShare = dcf.pvOfTerminalValue / dcf.enterpriseValue;
    if (tvShare > 0.75) {
      f.push({
        level: 'warn',
        title: `Terminal value is ${pct(tvShare)} of enterprise value`,
        detail: 'Most of the valuation rests on assumptions beyond the explicit forecast (terminal growth, WACC). Extend the forecast horizon or double-check those assumptions.',
      });
    }
  }

  if (Number.isFinite(dcf.equityValuePerShare) && dcf.equityValuePerShare <= 0) {
    f.push({ level: 'warn', title: 'Equity value is negative', detail: 'Enterprise value is below net debt. Verify debt/cash in the base year and the forecast cash flows.' });
  }

  if (wacc > 0 && wacc < 0.07) {
    f.push({
      level: 'warn',
      title: `WACC ${pct(wacc)} is low`,
      detail: 'A low discount rate inflates the value, especially when the terminal value dominates. If beta was auto-fetched, verify it — a low beta (common for defensive names) pulls WACC down sharply.',
    });
  }

  if (longTermGrowth > 0.05) {
    f.push({ level: 'warn', title: `Terminal growth ${pct(longTermGrowth)} looks high`, detail: 'A perpetual growth rate above ~long-run GDP (2–4%) implies the company outgrows the economy forever.' });
  }
  if (longTermGrowth < 0) {
    f.push({ level: 'warn', title: 'Terminal growth is negative', detail: 'Implies perpetual decline — intentional? Otherwise set it to a small positive rate.' });
  }

  // Working-capital sanity — catches broken/incorrect NWC lines.
  for (const y of dcf.years) {
    if (y.revenue > 0 && Math.abs(y.changeInNwc) > 0.08 * y.revenue) {
      f.push({
        level: 'warn',
        title: `Large working-capital swing in FY ${y.fiscalYear}`,
        detail: `Change in net working capital (${y.changeInNwc.toFixed(0)}) is ${pct(Math.abs(y.changeInNwc) / y.revenue)} of revenue. A swing this size usually means the working-capital inputs are off.`,
      });
      break; // one flag is enough
    }
  }

  // Balance sheet must tie every year (articulated model → should be 0).
  const unbalanced = statements.years.find((y) => Math.abs(y.balanceSheet.balanceCheck) > 1);
  if (unbalanced) {
    f.push({ level: 'warn', title: `Balance sheet doesn't tie in FY ${unbalanced.balanceSheet.fiscalYear}`, detail: `Off by ${unbalanced.balanceSheet.balanceCheck.toFixed(0)}.` });
  }

  // Margin & tax sanity from the projected income statement.
  const first = statements.years[0]?.incomeStatement;
  if (first && first.revenue > 0) {
    const gm = first.grossProfit / first.revenue;
    if (gm < 0 || gm > 1) f.push({ level: 'warn', title: `Gross margin ${pct(gm)} is out of range`, detail: 'Expected between 0% and 100%. Check revenue and COGS.' });
    const ebitM = first.ebit / first.revenue;
    if (ebitM > 0.6) f.push({ level: 'warn', title: `Operating margin ${pct(ebitM)} looks very high`, detail: 'Verify R&D/SG&A/D&A assumptions.' });
    if (first.pretaxProfit > 0) {
      const etr = first.taxes / first.pretaxProfit;
      if (etr < 0 || etr > 0.45) f.push({ level: 'warn', title: `Effective tax rate ${pct(etr)} is unusual`, detail: 'Typical corporate effective rates are ~10–35%.' });
    }
  }

  // Revenue growth realism.
  const growth = statements.dcfYears;
  for (let i = 1; i < growth.length; i++) {
    if (growth[i - 1].revenue > 0) {
      const g = growth[i].revenue / growth[i - 1].revenue - 1;
      if (g > 0.4) { f.push({ level: 'warn', title: `Revenue growth ${pct(g)} in FY ${growth[i].fiscalYear}`, detail: 'Sustained growth above 40% is rare — confirm this is intended.' }); break; }
    }
  }

  // --- Info ---
  if (Number.isFinite(dcf.equityValuePerShare) && sharePrice > 0) {
    const upside = dcf.equityValuePerShare / sharePrice - 1;
    f.push({
      level: 'info',
      title: `${upside >= 0 ? 'Upside' : 'Downside'} of ${pct(Math.abs(upside))} vs. market`,
      detail: `DCF ${dcf.equityValuePerShare.toFixed(2)} vs. current price ${sharePrice.toFixed(2)}.`,
    });
  }

  return f;
}
