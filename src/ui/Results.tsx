import { useState } from 'react';
import { useModel } from '../store/useModel';
import { useComputed } from '../store/useComputed';
import type { HistoricalYear } from '../lib/historicals';
import type { YearStatements } from '../engine/statements';

type StmtRow = { label: string; h: (h: HistoricalYear) => number | null; f: (y: YearStatements) => number; em?: boolean };
const TITLES = { is: 'Income Statement', bs: 'Balance Sheet', cf: 'Cash Flow' } as const;
const ROWS: Record<'is' | 'bs' | 'cf', StmtRow[]> = {
  is: [
    { label: 'Revenue', h: (h) => h.revenue, f: (y) => y.incomeStatement.revenue },
    { label: 'Gross Profit', h: (h) => h.grossProfit, f: (y) => y.incomeStatement.grossProfit },
    { label: 'EBIT', h: (h) => h.ebit, f: (y) => y.incomeStatement.ebit },
    { label: 'EBITDA', h: (h) => h.ebitda, f: (y) => y.incomeStatement.ebitda },
    { label: 'Net Income', h: (h) => h.netIncome, f: (y) => y.incomeStatement.netIncome },
  ],
  bs: [
    { label: 'Total Assets', h: (h) => h.totalAssets, f: (y) => y.balanceSheet.totalAssets },
    { label: 'Total Liabilities', h: (h) => h.totalLiabilities, f: (y) => y.balanceSheet.totalLiabilities },
    { label: 'Total Equity', h: (h) => h.totalEquity, f: (y) => y.balanceSheet.totalEquity },
    { label: 'Cash', h: (h) => h.cash, f: (y) => y.balanceSheet.cash },
    { label: 'Net Working Capital', h: (h) => h.netWorkingCapital, f: (y) => y.balanceSheet.netWorkingCapital },
    { label: 'Balance Check', h: (h) => h.balanceCheck, f: (y) => y.balanceSheet.balanceCheck, em: true },
  ],
  cf: [
    { label: 'Cash from Ops', h: (h) => h.cashFromOperations, f: (y) => y.cashFlow.cashFromOperations },
    { label: 'Cash from Investing', h: (h) => h.cashFromInvesting, f: (y) => y.cashFlow.cashFromInvesting },
    { label: 'Cash from Financing', h: (h) => h.cashFromFinancing, f: (y) => y.cashFlow.cashFromFinancing },
    { label: 'Net Change in Cash', h: (h) => h.netChangeInCash, f: (y) => y.cashFlow.netChangeInCash },
  ],
};

const money = (x: number) =>
  Number.isFinite(x) ? x.toLocaleString(undefined, { maximumFractionDigits: 1 }) : '—';
const price = (x: number) =>
  Number.isFinite(x) ? `$${x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
const pct = (x: number) => (Number.isFinite(x) ? `${(x * 100).toFixed(1)}%` : '—');

function UpsideBadge({ target }: { target: number }) {
  const current = useModel((s) => s.company.sharePrice);
  if (!Number.isFinite(target) || !current) return null;
  const up = target / current - 1;
  return (
    <span className={`badge ${up >= 0 ? 'pos' : 'neg'}`}>
      {up >= 0 ? '▲' : '▼'} {pct(Math.abs(up))} vs {price(current)}
    </span>
  );
}

function Diagnostics({ findings }: { findings: { level: 'error' | 'warn' | 'info'; title: string; detail: string }[] }) {
  if (findings.length === 0) {
    return <section className="panel diag"><p className="diag-ok">✓ No issues flagged — inputs look sane.</p></section>;
  }
  const icon = { error: '⛔', warn: '⚠️', info: 'ℹ️' } as const;
  const order = { error: 0, warn: 1, info: 2 } as const;
  const sorted = [...findings].sort((a, b) => order[a.level] - order[b.level]);
  return (
    <section className="panel diag">
      <h3>Diagnostics</h3>
      <ul className="diag-list">
        {sorted.map((f, i) => (
          <li key={i} className={`diag-item ${f.level}`}>
            <span className="diag-ico">{icon[f.level]}</span>
            <span><b>{f.title}.</b> {f.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Results() {
  const { statements, dcf, compsResult, terminalEbitda, diagnostics } = useComputed();
  const historicals = useModel((s) => s.historicals);
  const [tab, setTab] = useState<'is' | 'bs' | 'cf'>('is');

  return (
    <div className="results">
      <Diagnostics findings={diagnostics} />
      <section className="cards">
        <article className="card">
          <h2>Discounted Cash Flow</h2>
          <div className="value">{price(dcf.equityValuePerShare)}</div>
          <div className="value-label">equity value / share</div>
          <UpsideBadge target={dcf.equityValuePerShare} />
        </article>
        <article className="card">
          <h2>Comparable Companies</h2>
          <div className="value">{price(compsResult.equityValuePerShare)}</div>
          <div className="value-label">
            {money(compsResult.averageMultiple)}× avg · applied to {money(terminalEbitda)} EBITDA
          </div>
          <UpsideBadge target={compsResult.equityValuePerShare} />
        </article>
      </section>

      <section className="panel">
        <h3>DCF bridge</h3>
        <ul className="totals">
          <li><span>WACC</span><b>{pct(dcf.wacc.wacc)}</b></li>
          <li><span>Cost of equity</span><b>{pct(dcf.wacc.costOfEquity)}</b></li>
          <li><span>PV of forecast</span><b>{money(dcf.pvOfForecast)}</b></li>
          <li><span>PV of terminal value</span><b>{money(dcf.pvOfTerminalValue)}</b></li>
          <li><span>Enterprise value</span><b>{money(dcf.enterpriseValue)}</b></li>
          <li><span>Net debt</span><b>{money(dcf.netDebt)}</b></li>
          <li><span>Equity value</span><b>{money(dcf.equityValue)}</b></li>
        </ul>
        <table>
          <thead><tr><th>Fiscal Year</th>{dcf.years.map((y) => <th key={y.fiscalYear}>{y.fiscalYear}</th>)}</tr></thead>
          <tbody>
            <tr><td>Revenue</td>{dcf.years.map((y) => <td key={y.fiscalYear}>{money(y.revenue)}</td>)}</tr>
            <tr><td>EBIT</td>{dcf.years.map((y) => <td key={y.fiscalYear}>{money(y.ebit)}</td>)}</tr>
            <tr><td>Unlevered FCF</td>{dcf.years.map((y) => <td key={y.fiscalYear}>{money(y.ufcf)}</td>)}</tr>
            <tr className="em"><td>PV of UFCF</td>{dcf.years.map((y) => <td key={y.fiscalYear}>{money(y.presentValue)}</td>)}</tr>
          </tbody>
        </table>
      </section>

      <section className="panel">
        <div className="tabs">
          <button className={tab === 'is' ? 'on' : ''} onClick={() => setTab('is')}>Income Statement</button>
          <button className={tab === 'bs' ? 'on' : ''} onClick={() => setTab('bs')}>Balance Sheet</button>
          <button className={tab === 'cf' ? 'on' : ''} onClick={() => setTab('cf')}>Cash Flow</button>
        </div>
        <table>
          <thead>
            <tr>
              <th>{TITLES[tab]}</th>
              {historicals.map((h) => <th key={`h${h.fiscalYear}`} className="hist">{h.fiscalYear}A</th>)}
              {statements.years.map((y, i) => (
                <th key={y.incomeStatement.fiscalYear} className={i === 0 ? 'fdiv' : ''}>{y.incomeStatement.fiscalYear}E</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS[tab].map((row) => (
              <tr key={row.label} className={row.em ? 'em' : ''}>
                <td>{row.label}</td>
                {historicals.map((h) => <td key={`h${h.fiscalYear}`} className="hist">{money(row.h(h) as number)}</td>)}
                {statements.years.map((y, i) => (
                  <td key={y.incomeStatement.fiscalYear} className={i === 0 ? 'fdiv' : ''}>{money(row.f(y))}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {historicals.length > 0
          ? <p className="note">Columns marked <b>A</b> are historical actuals; <b>E</b> are forecast (articulated model — forecast balance check is 0).</p>
          : <p className="note">Auto-fill a ticker to show historical actuals (A) beside the forecast (E).</p>}
      </section>
    </div>
  );
}
