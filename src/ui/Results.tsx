import { useState } from 'react';
import { useModel } from '../store/useModel';
import { useComputed } from '../store/useComputed';
import { NumberInput } from './fields';
import type { HistoricalYear } from '../lib/historicals';
import type { YearStatements } from '../engine/statements';
import type { SensitivityResult } from '../engine/sensitivity';
import type { MonteCarloResult } from '../engine/monteCarlo';
import type { NetDebtBridge, WaccAssumptions } from '../engine/types';

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
const price0 = (x: number) =>
  Number.isFinite(x) ? `$${x.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—';
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

function MonteCarloHistogram({ r, baseCase, price }: { r: MonteCarloResult; baseCase: number; price: number }) {
  if (r.histogram.length === 0) return null;
  const lo = r.histogram[0].start;
  const hi = r.histogram[r.histogram.length - 1].end;
  const maxCount = Math.max(...r.histogram.map((b) => b.count), 1);
  const W = 640, H = 240, L = 8, Rp = W - 8, top = 12, plotH = 170;
  const baseY = top + plotH;
  const dom = hi - lo || 1;
  const x = (v: number) => L + ((v - lo) / dom) * (Rp - L);
  const clampX = (v: number) => Math.max(L, Math.min(Rp, x(v)));
  const marker = (v: number, cls: string, label: string) =>
    Number.isFinite(v) && v >= lo && v <= hi ? (
      <g>
        <line x1={clampX(v)} x2={clampX(v)} y1={top - 6} y2={baseY} className={cls} />
        <text x={clampX(v)} y={top - 8} textAnchor="middle" className="mc-mark-lbl">{label}</text>
      </g>
    ) : null;
  return (
    <div className="ff-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="mc-hist" role="img" aria-label="Distribution of value per share">
        {/* p5–p95 shaded band */}
        <rect x={clampX(r.p5)} y={top} width={Math.max(0, clampX(r.p95) - clampX(r.p5))} height={plotH} className="mc-band" />
        {r.histogram.map((b, i) => {
          const bx = x(b.start);
          const bw = Math.max(1, x(b.end) - x(b.start) - 1);
          const bh = (b.count / maxCount) * plotH;
          return <rect key={i} x={bx} y={baseY - bh} width={bw} height={bh} className="mc-bar" />;
        })}
        <line x1={L} x2={Rp} y1={baseY} y2={baseY} className="mc-axis" />
        {marker(r.p50, 'mc-median', 'median')}
        {marker(baseCase, 'mc-basecase', 'base DCF')}
        {price > 0 && marker(price, 'mc-price', 'price')}
        {/* axis endpoints */}
        <text x={L} y={baseY + 18} className="mc-axis-lbl">{price0(lo)}</text>
        <text x={Rp} y={baseY + 18} textAnchor="end" className="mc-axis-lbl">{price0(hi)}</text>
      </svg>
    </div>
  );
}

function MonteCarloPanel({ derived, baseCase }: {
  derived: { wacc: WaccAssumptions; baseWacc: number; bridge: NetDebtBridge };
  baseCase: number;
}) {
  const mc = useModel((s) => s.mc);
  const setMc = useModel((s) => s.setMc);
  const runSimulation = useModel((s) => s.runSimulation);
  const result = useModel((s) => s.mcResult);
  const sharePrice = useModel((s) => s.company.sharePrice);

  return (
    <section className="panel">
      <h3>Monte Carlo — distribution of value</h3>
      <p className="note" style={{ marginTop: 0 }}>
        Samples the four highest-leverage drivers from normal distributions and re-runs the full DCF each trial.
        Set each driver's uncertainty (± one standard deviation), then run.
      </p>
      <div className="mc-controls">
        <label className="stack"><span>Trials</span><NumberInput value={mc.trials} onCommit={(n) => setMc({ trials: Math.max(1, Math.round(n)) })} width={80} /></label>
        <label className="stack"><span>Revenue growth ±σ</span><NumberInput value={mc.revenueGrowthSd} onCommit={(n) => setMc({ revenueGrowthSd: Math.max(0, n) })} percent width={70} /></label>
        <label className="stack"><span>Gross margin ±σ</span><NumberInput value={mc.marginSd} onCommit={(n) => setMc({ marginSd: Math.max(0, n) })} percent width={70} /></label>
        <label className="stack"><span>WACC ±σ</span><NumberInput value={mc.waccSd} onCommit={(n) => setMc({ waccSd: Math.max(0, n) })} percent width={70} /></label>
        <label className="stack"><span>Terminal growth ±σ</span><NumberInput value={mc.terminalGrowthSd} onCommit={(n) => setMc({ terminalGrowthSd: Math.max(0, n) })} percent width={70} /></label>
        <button className="add" style={{ alignSelf: 'flex-end' }} onClick={() => runSimulation(derived)}>Run simulation</button>
      </div>

      {result && (result.usable > 0 ? (
        <>
          <MonteCarloHistogram r={result} baseCase={baseCase} price={sharePrice} />
          <ul className="totals mc-stats">
            <li><span>Median (P50)</span><b>{price(result.p50)}</b></li>
            <li><span>Mean</span><b>{price(result.mean)}</b></li>
            <li><span>Std deviation</span><b>{price(result.stdDev)}</b></li>
            <li><span>90% interval (P5–P95)</span><b>{price(result.p5)} – {price(result.p95)}</b></li>
            <li><span>Interquartile (P25–P75)</span><b>{price(result.p25)} – {price(result.p75)}</b></li>
            <li><span>Base-case DCF</span><b>{price(baseCase)}</b></li>
            {result.probUndervalued != null && (
              <li><span>P(undervalued vs {price(sharePrice)})</span><b>{pct(result.probUndervalued)}</b></li>
            )}
            <li><span>Trials used</span><b>{result.usable.toLocaleString()}{result.discarded > 0 ? ` (${result.discarded.toLocaleString()} discarded)` : ''}</b></li>
          </ul>
          {result.probUndervalued != null && (
            <p className="note">
              Across {result.usable.toLocaleString()} scenarios, the intrinsic value exceeded today's price of {price(sharePrice)} in <b>{pct(result.probUndervalued)}</b> of them.
              {result.discarded > 0 && ` ${result.discarded.toLocaleString()} trial(s) were discarded where a shocked WACC collapsed onto the terminal growth rate — widen with care.`}
            </p>
          )}
        </>
      ) : (
        <p className="note diag-warn">⚠️ No usable trials — every scenario blew up (a shocked WACC at/below terminal growth). Lower the WACC ±σ or the terminal-growth assumption.</p>
      ))}
    </section>
  );
}

export function Results() {
  const { statements, dcf, diagnostics, sensitivity, impliedGrowth, assumedGrowth, footballField, methods, sector, financialsWarning, mcDerived } = useComputed();
  const historicals = useModel((s) => s.historicals);
  const [tab, setTab] = useState<'is' | 'bs' | 'cf'>('is');

  return (
    <div className="results">
      <Diagnostics findings={diagnostics} />
      <p className="note" style={{ marginTop: 0 }}>
        Sector: <b>{sector}</b> — methods that fit it are marked <span className="rec-badge">recommended</span>.
      </p>
      {financialsWarning && <p className="note diag-warn">⚠️ {financialsWarning}</p>}
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
      <MonteCarloPanel derived={mcDerived} baseCase={dcf.equityValuePerShare} />

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
