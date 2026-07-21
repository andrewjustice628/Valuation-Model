import { useState, useEffect } from 'react';
import { useModel, AUTO_FIELDS } from '../store/useModel';
import { useComputed } from '../store/useComputed';
import { buildSheets } from '../lib/exportWorkbook';
import { NumberInput, FieldLabel } from './fields';
import { Results } from './Results';
import { ASSUMPTION_GROUPS, BASE_FIELDS, BRIDGE_FIELDS, WACC_FIELDS } from './catalog';

const MULTIPLES = ['EV/EBITDA', 'P/E', 'P/S', 'P/B', 'EV/Sales'];

function ModelBar() {
  const currentName = useModel((s) => s.currentName);
  const savedModels = useModel((s) => s.savedModels);
  const saveModel = useModel((s) => s.saveModel);
  const loadModel = useModel((s) => s.loadModel);
  const deleteModel = useModel((s) => s.deleteModel);
  const newModel = useModel((s) => s.newModel);
  const importSnapshot = useModel((s) => s.importSnapshot);
  const snapshot = useModel((s) => s.snapshot);
  const company = useModel((s) => s.company);
  const assumptions = useModel((s) => s.assumptions);
  const historicals = useModel((s) => s.historicals);
  const { statements, dcf, compsResult, methods } = useComputed();
  const [name, setName] = useState(currentName);
  const [selId, setSelId] = useState('');
  useEffect(() => setName(currentName), [currentName]);

  const fileBase = () => (name || company.ticker || 'valuation').replace(/\s+/g, '-');
  const doExcel = async () => {
    const XLSX = await import('xlsx');
    const sheets = buildSheets({ company, assumptions, statements, historicals, dcf, compsResult, methods });
    const wb = XLSX.utils.book_new();
    for (const sh of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sh.rows), sh.name);
    XLSX.writeFile(wb, `${fileBase()}.xlsx`);
  };
  const doPrint = () => window.print();

  const doExport = () => {
    const blob = new Blob([JSON.stringify(snapshot(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(name || 'model').replace(/\s+/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const doImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) file.text().then((t) => { try { importSnapshot(JSON.parse(t)); } catch { alert('Invalid model file.'); } });
    e.target.value = '';
  };

  return (
    <section className="modelbar">
      <span className="mb-label">Model</span>
      <input className="mb-name" value={name} onChange={(e) => setName(e.target.value)} />
      <button className="fetch" onClick={() => saveModel(name.trim() || 'Untitled')}>Save</button>
      <button onClick={newModel}>New</button>
      <span className="mb-sep" />
      <select value={selId} onChange={(e) => setSelId(e.target.value)}>
        <option value="">Saved models ({savedModels.length})…</option>
        {savedModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
      <button disabled={!selId} onClick={() => selId && loadModel(selId)}>Load</button>
      <button disabled={!selId} onClick={() => { if (selId && confirm('Delete this saved model?')) { deleteModel(selId); setSelId(''); } }}>Delete</button>
      <span className="mb-sep" />
      <button onClick={doExcel} title="Download the full model as an Excel workbook">Excel</button>
      <button onClick={doPrint} title="Print or save the results as a PDF">PDF</button>
      <button onClick={doExport} title="Export the model as a JSON file">JSON</button>
      <label className="btn-like">Import<input type="file" accept="application/json" onChange={doImport} hidden /></label>
    </section>
  );
}

function PrintHeader() {
  const company = useModel((s) => s.company);
  return (
    <div className="print-only print-head">
      <b>{company.name}</b> ({company.ticker}) — Equity valuation · {new Date().toLocaleDateString()}
    </div>
  );
}

function CompanyHeader() {
  const company = useModel((s) => s.company);
  const setCompany = useModel((s) => s.setCompany);
  const fetchQuote = useModel((s) => s.fetchQuote);
  const status = useModel((s) => s.quoteStatus);
  const error = useModel((s) => s.quoteError);

  return (
    <section className="company">
      <div className="row">
        <label className="stack">
          <span>Ticker</span>
          <input
            className="ticker"
            value={company.ticker}
            onChange={(e) => setCompany({ ticker: e.target.value.toUpperCase() })}
            onKeyDown={(e) => e.key === 'Enter' && fetchQuote()}
          />
        </label>
        <button className="fetch" onClick={() => fetchQuote()} disabled={status === 'loading'}>
          {status === 'loading' ? 'Fetching…' : 'Fetch quote'}
        </button>
        <label className="stack grow">
          <span>Company name</span>
          <input value={company.name} onChange={(e) => setCompany({ name: e.target.value })} />
        </label>
        <label className="stack">
          <span>Unit</span>
          <input value={company.unit} onChange={(e) => setCompany({ unit: e.target.value })} />
        </label>
        <label className="stack">
          <span>Sector</span>
          <select value={company.sector} onChange={(e) => setCompany({ sector: e.target.value as typeof company.sector })}>
            <option value="corporate">Corporate</option>
            <option value="financial">Financial (bank/insurer)</option>
            <option value="reit">REIT / Real estate</option>
            <option value="utility">Utility</option>
          </select>
        </label>
      </div>
      <div className="row">
        <label className="stack">
          <span>Share price</span>
          <NumberInput value={company.sharePrice} onCommit={(n) => setCompany({ sharePrice: n })} width={110} />
        </label>
        <label className="stack">
          <span>Shares outstanding</span>
          <NumberInput value={company.sharesOutstanding} onCommit={(n) => setCompany({ sharesOutstanding: n })} width={160} />
        </label>
        {status === 'error' && <span className="err">{error} — enter manually.</span>}
        {status === 'ok' && <span className="ok">Fetched. Fields are editable.</span>}
      </div>
    </section>
  );
}

function BaseSection() {
  const base = useModel((s) => s.base);
  const setBase = useModel((s) => s.setBase);
  const historicalBase = useModel((s) => s.historicalBase);
  const setHistorical = useModel((s) => s.setHistorical);
  const fetchFinancials = useModel((s) => s.fetchFinancials);
  const status = useModel((s) => s.financialsStatus);
  const message = useModel((s) => s.financialsMessage);
  // The two years before the latest actual — shown for reference (read-only).
  const priors = historicalBase.filter((h) => h.fiscalYear < base.fiscalYear).slice(-2);
  return (
    <details open>
      <summary>Base year &amp; prior actuals — {base.fiscalYear}</summary>
      <div className="row" style={{ marginBottom: 8 }}>
        <button className="fetch" onClick={() => fetchFinancials()} disabled={status === 'loading'}>
          {status === 'loading' ? 'Fetching filing…' : 'Auto-fill from latest filing'}
        </button>
        {message && <span className={status === 'error' ? 'err' : 'ok'}>{message}</span>}
      </div>
      <table className="assum base-table">
        <thead>
          <tr>
            <th className="rowhead">Line item</th>
            {priors.map((p) => <th key={p.fiscalYear} className="hist">{p.fiscalYear}A</th>)}
            <th className="fdiv">{base.fiscalYear} (edit)</th>
          </tr>
        </thead>
        <tbody>
          {BASE_FIELDS.map((f) => (
            <tr key={f.id}>
              <td className="rowhead"><FieldLabel fieldId={`base.${f.id}`} label={f.label} aka={f.aka} /></td>
              {priors.map((p) => (
                <td key={p.fiscalYear} className="hist">
                  <NumberInput value={p[f.id] ?? 0} onCommit={(n) => setHistorical(p.fiscalYear, f.id, n)} width={120} />
                </td>
              ))}
              <td className="fdiv"><NumberInput value={base[f.id]} onCommit={(n) => setBase(f.id, n)} width={130} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="note">
        {priors.length > 0
          ? 'All columns are editable. The latest year drives the forecast; prior years are the historical record.'
          : 'Auto-fill a ticker to show the prior years’ actuals beside the base year.'}
      </p>
    </details>
  );
}

function AssumptionsSection() {
  const assumptions = useModel((s) => s.assumptions);
  const setAssumption = useModel((s) => s.setAssumption);
  const copyAcross = useModel((s) => s.copyAcross);
  const resetAuto = useModel((s) => s.resetAuto);
  const overrides = useModel((s) => s.manualOverrides);
  return (
    <details open>
      <summary>Forecast assumptions</summary>
      <p className="note">
        Fields derived from history (revenue growth, gross margin, and the balance-sheet
        ratios) auto-update as you edit the actuals. Edit any cell to override it (shown in
        accent); ↺ resets that row to the live formula.
      </p>
      {ASSUMPTION_GROUPS.map((group) => (
        <div className="assum-group" key={group.title}>
          <h4>{group.title}</h4>
          <table className="assum">
            <thead>
              <tr>
                <th className="rowhead">Driver</th>
                {assumptions.map((a) => <th key={a.fiscalYear}>{a.fiscalYear}</th>)}
              </tr>
            </thead>
            <tbody>
              {group.fields.map((f) => {
                const auto = AUTO_FIELDS.has(f.id);
                const rowOverrides = overrides[f.id];
                return (
                  <tr key={f.id}>
                    <td className="rowhead">
                      <FieldLabel fieldId={`assum.${f.id}`} label={f.label} aka={auto ? 'auto from history' : f.aka} />
                      <button className="copy" title="Copy first year across" onClick={() => copyAcross(f.id)}>→</button>
                      {auto && rowOverrides?.some(Boolean) && (
                        <button className="copy" title="Reset this row to the auto value from history" onClick={() => resetAuto(f.id)}>↺</button>
                      )}
                    </td>
                    {assumptions.map((a, i) => (
                      <td key={a.fiscalYear} className={auto && rowOverrides?.[i] ? 'manual' : undefined}>
                        <NumberInput value={a[f.id]} percent={f.percent} onCommit={(n) => setAssumption(i, f.id, n)} width={72} />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </details>
  );
}

function WaccSection() {
  const wacc = useModel((s) => s.wacc);
  const setWacc = useModel((s) => s.setWacc);
  const dcf = useModel((s) => s.dcf);
  const setDcf = useModel((s) => s.setDcf);
  return (
    <details open>
      <summary>WACC & DCF settings</summary>
      <div className="grid">
        {WACC_FIELDS.map((f) => (
          <div className="cell" key={f.id}>
            <FieldLabel fieldId={`wacc.${f.id}`} label={f.label} />
            <NumberInput value={wacc[f.id]} percent={f.percent} onCommit={(n) => setWacc(f.id, n)} />
          </div>
        ))}
        <div className="cell">
          <FieldLabel fieldId="dcf.stub" label="Stub (portion of yr 1)" />
          <NumberInput value={dcf.stub} onCommit={(n) => setDcf({ stub: n })} />
        </div>
        <div className="cell">
          <span className="field-label"><span className="lbl">Terminal method</span></span>
          <select value={dcf.terminalMethod} onChange={(e) => setDcf({ terminalMethod: e.target.value as 'perpetuity' | 'exitMultiple' })}>
            <option value="perpetuity">Perpetuity growth</option>
            <option value="exitMultiple">Exit multiple (EV/EBITDA)</option>
          </select>
        </div>
        {dcf.terminalMethod === 'perpetuity' ? (
          <div className="cell">
            <FieldLabel fieldId="dcf.longTermGrowth" label="Long-Term Growth" />
            <NumberInput value={dcf.longTermGrowth} percent onCommit={(n) => setDcf({ longTermGrowth: n })} />
          </div>
        ) : (
          <div className="cell">
            <FieldLabel fieldId="dcf.exitMultiple" label="Exit EV/EBITDA" />
            <NumberInput value={dcf.exitMultiple} onCommit={(n) => setDcf({ exitMultiple: n })} />
          </div>
        )}
        <div className="cell">
          <span className="field-label"><span className="lbl">Perpetuity basis</span></span>
          <select value={dcf.terminalBasis} onChange={(e) => setDcf({ terminalBasis: e.target.value as 'nominal' | 'faithful' })}>
            <option value="nominal">Nominal (corrected)</option>
            <option value="faithful">Faithful to sheet</option>
          </select>
        </div>
      </div>
    </details>
  );
}

function PrecedentSection() {
  const precedent = useModel((s) => s.precedent);
  const setPrecedent = useModel((s) => s.setPrecedent);
  const setDeal = (i: number, patch: Partial<{ label: string; multiple: number | null }>) =>
    setPrecedent({ deals: precedent.deals.map((d, k) => (k === i ? { ...d, ...patch } : d)) });
  return (
    <details>
      <summary>Precedent transactions (M&amp;A)</summary>
      <div className="row">
        <label className="stack">
          <span>Chosen multiple</span>
          <select value={precedent.multipleName} onChange={(e) => setPrecedent({ multipleName: e.target.value })}>
            {MULTIPLES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
      </div>
      <table className="peers">
        <thead><tr><th>Deal / target</th><th>{precedent.multipleName}</th><th></th></tr></thead>
        <tbody>
          {precedent.deals.map((d, i) => (
            <tr key={i}>
              <td><input value={d.label} placeholder="e.g. Acquirer / Target (2024)" onChange={(e) => setDeal(i, { label: e.target.value })} /></td>
              <td><NumberInput value={d.multiple ?? 0} onCommit={(n) => setDeal(i, { multiple: n })} width={90} /></td>
              <td><button className="mini" onClick={() => setPrecedent({ deals: precedent.deals.filter((_, k) => k !== i) })}>✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="add" onClick={() => setPrecedent({ deals: [...precedent.deals, { label: '', multiple: null }] })}>+ Add deal</button>
      <p className="note">M&amp;A deal multiples are entered manually (they include a control premium, so they typically run above trading comps). Applied to the same company metric as comps.</p>
    </details>
  );
}

function FinancialsSection() {
  const sector = useModel((s) => s.company.sector);
  const financials = useModel((s) => s.financials);
  const setFinancials = useModel((s) => s.setFinancials);
  if (sector !== 'financial' && sector !== 'reit') return null;
  const g = financials.roe * (1 - financials.payoutRatio);
  return (
    <details open>
      <summary>Financials (banks / insurers)</summary>
      <p className="note">
        For {sector === 'reit' ? 'REITs' : 'financials'}, the Dividend Discount and P/B methods use these inputs directly
        (two-stage: book &amp; dividends compound at the sustainable rate for the high-growth years, then fade to terminal).
        Cost of equity comes from your CAPM inputs (WACC section).
      </p>
      <div className="grid">
        <div className="cell">
          <FieldLabel fieldId="fin.bvps" label="Book value / share" aka="Tangible book preferred for banks" />
          <NumberInput value={financials.bookValuePerShare} onCommit={(n) => setFinancials({ bookValuePerShare: n })} />
        </div>
        <div className="cell">
          <FieldLabel fieldId="fin.roe" label="Sustainable ROE" />
          <NumberInput value={financials.roe} percent onCommit={(n) => setFinancials({ roe: n })} />
        </div>
        <div className="cell">
          <FieldLabel fieldId="fin.payout" label="Payout ratio" />
          <NumberInput value={financials.payoutRatio} percent onCommit={(n) => setFinancials({ payoutRatio: n })} />
        </div>
        <div className="cell">
          <FieldLabel fieldId="fin.years" label="High-growth years" />
          <NumberInput value={financials.highGrowthYears} onCommit={(n) => setFinancials({ highGrowthYears: n })} />
        </div>
        <div className="cell">
          <FieldLabel fieldId="fin.tg" label="Terminal growth" />
          <NumberInput value={financials.terminalGrowth} percent onCommit={(n) => setFinancials({ terminalGrowth: n })} />
        </div>
        <div className="cell">
          <span className="field-label"><span className="lbl">Sustainable growth (ROE×retention)</span></span>
          <span className="num"><input readOnly value={`${(g * 100).toFixed(1)}%`} /></span>
        </div>
      </div>
    </details>
  );
}

function BridgeSection() {
  const bridge = useModel((s) => s.bridge);
  const setBridge = useModel((s) => s.setBridge);
  return (
    <details>
      <summary>Net debt bridge</summary>
      <p className="note">
        Debt (long-term debt + commercial paper) and cash come from the base year —
        edit them there. These are the additional bridge items.
      </p>
      <div className="grid">
        {BRIDGE_FIELDS.map((f) => (
          <div className="cell" key={f.id}>
            <FieldLabel fieldId={`bridge.${f.id}`} label={f.label} />
            <NumberInput value={bridge[f.id]} onCommit={(n) => setBridge(f.id, n)} />
          </div>
        ))}
      </div>
    </details>
  );
}

function CompsSection() {
  const comps = useModel((s) => s.comps);
  const setComps = useModel((s) => s.setComps);
  const setPeer = useModel((s) => s.setPeer);
  const addPeer = useModel((s) => s.addPeer);
  const removePeer = useModel((s) => s.removePeer);
  const fetchPeerMultiple = useModel((s) => s.fetchPeerMultiple);
  return (
    <details open>
      <summary>Comparable companies</summary>
      <div className="row">
        <label className="stack">
          <span>Chosen multiple</span>
          <select value={comps.multipleName} onChange={(e) => setComps({ multipleName: e.target.value })}>
            {MULTIPLES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <button className="fetch" onClick={() => comps.peers.forEach((_, i) => fetchPeerMultiple(i))}>
          Fetch all multiples
        </button>
      </div>
      <table className="peers">
        <thead><tr><th>Peer ticker</th><th>{comps.multipleName}</th><th></th></tr></thead>
        <tbody>
          {comps.peers.map((p, i) => (
            <tr key={i}>
              <td>
                <input
                  className="ticker"
                  value={p.ticker}
                  placeholder="e.g. MSFT"
                  onChange={(e) => setPeer(i, { ticker: e.target.value.toUpperCase() })}
                  onBlur={() => p.ticker.trim() && fetchPeerMultiple(i)}
                />
              </td>
              <td>
                <NumberInput value={p.multiple ?? 0} onCommit={(n) => setPeer(i, { multiple: n })} width={90} />
              </td>
              <td><button className="mini" onClick={() => removePeer(i)}>✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="add" onClick={addPeer}>+ Add peer</button>
      <p className="note">Multiples auto-fetch on ticker entry (Finnhub) and stay editable. If a multiple isn't available it stays blank for manual entry.</p>
    </details>
  );
}

export function App() {
  return (
    <main className="wrap">
      <header>
        <h1>Equity Valuation Model</h1>
        <p className="sub">Three-statement model → DCF &amp; comps. All math runs in your browser.</p>
      </header>
      <ModelBar />
      <PrintHeader />
      <CompanyHeader />
      <div className="layout">
        <div className="inputs">
          <BaseSection />
          <AssumptionsSection />
          <WaccSection />
          <FinancialsSection />
          <CompsSection />
          <PrecedentSection />
          <BridgeSection />
        </div>
        <div className="output">
          <Results />
        </div>
      </div>
    </main>
  );
}
