import { useState } from 'react';
import { useModel } from '../store/useModel';
import { useComputed } from '../store/useComputed';
import type { HistoricalYear } from '../lib/historicals';
import type { YearStatements } from '../engine/statements';
import type { SensitivityResult } from '../engine/sensitivity';

function SensitivityPanel({ s }: { s: SensitivityResult }) {
  const finite = s.perShare.flat().filter((v) => Number.isFinite(v));
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const bg = (v: number) => {
    if (!Number.isFinite(v) || max === min) return undefined;
    const t = (v - min) / (max - min); // 0 (low) → 1 (high)
    return `hsl(${Math.round(8 + t * 132)} 42% 20%)`; // red → green
  };
  const money = (x: number) => (Number.isFinite(x) ? x.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—');
  const colHead = (v: number) => (s.colKind === 'multiple' ? `${v.toFixed(1)}×` : `${(v * 100).toFixed(1)}%`);
  return (
    <section className="panel">
      <h3>Sensitivity — value / share</h3>
      <table className="sens">
        <thead>
          <tr>
            <th>WACC \ {s.colKind === 'multiple' ? 'exit×' : 'g'}→</th>
            {s.colValues.map((c, i) => <th key={i}>{colHead(c)}</th>)}
          </tr>
        </thead>
        <tbody>
          {s.waccValues.map((w, ri) => (
            <tr key={ri}>
              <th>{(w * 100).toFixed(1)}%</th>
              {s.colValues.map((_, ci) => {
                const v = s.perShare[ri][ci];
                const isBase = ri === s.baseRow && ci === s.baseCol;
                return <td key={ci} className={isBase ? 'sens-base' : ''} style={{ background: bg(v) }}>{money(v)}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="note">Rows = WACC, columns = terminal growth. Outlined cell = your current assumptions.</p>
    </section>
  );
}

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

function FootballField({ ranges, price }: { ranges: { label: string; low: number; base: number; high: number }[]; price: number }) {
  const vals = ranges.flatMap((r) => [r.low, r.high, r.base]).concat(price > 0 ? [price] : []).filter((v) => Number.isFinite(v));
  if (vals.length === 0) return null;
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.08;
  min -= pad; max += pad;
  const W = 640, L = 180, R = W - 14, plotW = R - L, rowH = 42, top = 16;
  const H = top + ranges.length * rowH + 34;
  const x = (v: number) => L + ((v - min) / (max - min)) * plotW;
  const money = (v: number) => (Number.isFinite(v) ? `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—');
  return (
    <section className="panel">
      <h3>Football field — value / share</h3>
      <div className="ff-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} className="ff" role="img" aria-label="Valuation ranges by method">
          {ranges.map((r, i) => {
            const y = top + i * rowH + rowH / 2;
            const x1 = x(Math.min(r.low, r.high));
            const x2 = x(Math.max(r.low, r.high));
            return (
              <g key={i}>
                <text x={10} y={y + 4} className="ff-label">{r.label}</text>
                <rect x={x1} y={y - 9} width={Math.max(2, x2 - x1)} height={18} rx={4} className="ff-bar" />
                <line x1={x(r.base)} x2={x(r.base)} y1={y - 12} y2={y + 12} className="ff-base" />
                <text x={x1 - 5} y={y + 4} textAnchor="end" className="ff-val">{money(r.low)}</text>
                <text x={x2 + 5} y={y + 4} className="ff-val">{money(r.high)}</text>
              </g>
            );
          })}
          {price > 0 && (
            <g>
              <line x1={x(price)} x2={x(price)} y1={top - 8} y2={top + ranges.length * rowH + 2} className="ff-price" />
              <text x={x(price)} y={top + ranges.length * rowH + 18} textAnchor="middle" className="ff-price-lbl">Price {money(price)}</text>
            </g>
          )}
        </svg>
      </div>
      <p className="note">Bars span each method's value range; the tick marks the base case. Dashed line = current market price.</p>
    </section>
  );
}

function ReverseDcf({ implied, assumed, price }: { implied: number | null; assumed: number; price: number }) {
  if (!(price > 0)) return null;
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  return (
    <section className="panel">
      <h3>Reverse DCF — what's priced in</h3>
      {implied == null ? (
        <p className="note">The current price implies revenue growth outside a plausible range (below −50% or above +100%), so it can't be shown as a single rate.</p>
      ) : (
        <p style={{ margin: 0 }}>
          At the current price of <b>${price.toFixed(2)}</b>, the market is pricing in roughly <b>{pct(implied)}</b> annual revenue growth over the forecast. Your model assumes an average of <b>{pct(assumed)}</b>.
        </p>
      )}
    </section>
  );
}

export function Results() {
  const { statements, dcf, diagnostics, sensitivity, impliedGrowth, assumedGrowth, footballField, methods, sector } = useComputed();
  const historicals = useModel((s) => s.historicals);
  const [tab, setTab] = useState<'is' | 'bs' | 'cf'>('is');

  return (
    <div className="results">
      <Diagnostics findings={diagnostics} />
      <p className="note" style={{ marginTop: 0 }}>
        Sector: <b>{sector}</b> — methods that fit it are marked <span className="rec-badge">recommended</span>.
      </p>
      <section className="cards methods">
        {methods.map((m) => (
          <article key={m.id} className={`card ${m.recommended ? 'rec' : 'dim'}`}>
            <h2>{m.label}{m.recommended && <span className="rec-badge">recommended</span>}</h2>
            <div className="value">{price(m.perShare)}</div>
            <div className="value-label">{m.note}</div>
            <UpsideBadge target={m.perShare} />
          </article>
        ))}
      </section>

      <FootballField ranges={footballField.ranges} price={footballField.price} />
      <ReverseDcf implied={impliedGrowth} assumed={assumedGrowth} price={footballField.price} />

      <section className="panel">
        <h3>DCF bridge</h3>
        <ul className="totals">
          <li><span>WACC</span><b>{pct(dcf.wacc.wacc)}</b></li>
          <li><span>Cost of equity</span><b>{pct(dcf.wacc.costOfEquity)}</b></li>
          <li><span>PV of forecast</span><b>{money(dcf.pvOfForecast)}</b></li>
          <li><span>PV of terminal value</span><b>{money(dcf.pvOfTerminalValue)}</b></li>
          <li><span>Terminal ≈ exit multiple</span><b>{Number.isFinite(dcf.impliedExitMultiple) ? `${dcf.impliedExitMultiple.toFixed(1)}×` : '—'}</b></li>
          <li><span>Terminal ≈ perpetuity g</span><b>{pct(dcf.impliedPerpetuityGrowth)}</b></li>
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

      <SensitivityPanel s={sensitivity} />

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
