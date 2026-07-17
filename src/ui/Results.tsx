import { useState } from 'react';
import { useModel } from '../store/useModel';
import { useComputed } from '../store/useComputed';

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

export function Results() {
  const { statements, dcf, compsResult, terminalEbitda } = useComputed();
  const [tab, setTab] = useState<'is' | 'bs' | 'cf'>('is');
  const fy = statements.years.map((y) => y.incomeStatement.fiscalYear);

  return (
    <div className="results">
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
          <thead><tr><th>{tab === 'is' ? 'Income Statement' : tab === 'bs' ? 'Balance Sheet' : 'Cash Flow'}</th>{fy.map((y) => <th key={y}>{y}</th>)}</tr></thead>
          <tbody>
            {tab === 'is' && (['Revenue:revenue', 'Gross Profit:grossProfit', 'EBIT:ebit', 'EBITDA:ebitda', 'Net Income:netIncome'] as const).map((row) => {
              const [label, key] = row.split(':') as [string, keyof typeof statements.years[0]['incomeStatement']];
              return <tr key={key}><td>{label}</td>{statements.years.map((y) => <td key={y.incomeStatement.fiscalYear}>{money(y.incomeStatement[key] as number)}</td>)}</tr>;
            })}
            {tab === 'bs' && (['Total Assets:totalAssets', 'Total Liabilities:totalLiabilities', 'Total Equity:totalEquity', 'Cash:cash', 'Net Working Capital:netWorkingCapital', 'Balance Check:balanceCheck'] as const).map((row) => {
              const [label, key] = row.split(':') as [string, keyof typeof statements.years[0]['balanceSheet']];
              return <tr key={key} className={key === 'balanceCheck' ? 'em' : ''}><td>{label}</td>{statements.years.map((y) => <td key={y.balanceSheet.fiscalYear}>{money(y.balanceSheet[key] as number)}</td>)}</tr>;
            })}
            {tab === 'cf' && (['Cash from Ops:cashFromOperations', 'Cash from Investing:cashFromInvesting', 'Cash from Financing:cashFromFinancing', 'Net Change in Cash:netChangeInCash'] as const).map((row) => {
              const [label, key] = row.split(':') as [string, keyof typeof statements.years[0]['cashFlow']];
              return <tr key={key}><td>{label}</td>{statements.years.map((y) => <td key={y.cashFlow.fiscalYear}>{money(y.cashFlow[key] as number)}</td>)}</tr>;
            })}
          </tbody>
        </table>
        {tab === 'bs' && <p className="note">Balance check is 0 every year — the model is articulated by construction.</p>}
      </section>
    </div>
  );
}
