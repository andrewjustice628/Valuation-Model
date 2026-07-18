import { useModel } from '../store/useModel';
import { NumberInput, FieldLabel } from './fields';
import { Results } from './Results';
import { ASSUMPTION_GROUPS, BASE_FIELDS, BRIDGE_FIELDS, WACC_FIELDS } from './catalog';

const MULTIPLES = ['EV/EBITDA', 'P/E', 'P/S', 'P/B', 'EV/Sales'];

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
  return (
    <details open>
      <summary>Forecast assumptions</summary>
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
              {group.fields.map((f) => (
                <tr key={f.id}>
                  <td className="rowhead">
                    <FieldLabel fieldId={`assum.${f.id}`} label={f.label} aka={f.aka} />
                    <button className="copy" title="Copy first year across" onClick={() => copyAcross(f.id)}>→</button>
                  </td>
                  {assumptions.map((a, i) => (
                    <td key={a.fiscalYear}>
                      <NumberInput value={a[f.id]} percent={f.percent} onCommit={(n) => setAssumption(i, f.id, n)} width={72} />
                    </td>
                  ))}
                </tr>
              ))}
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
          <FieldLabel fieldId="dcf.longTermGrowth" label="Long-Term Growth" />
          <NumberInput value={dcf.longTermGrowth} percent onCommit={(n) => setDcf({ longTermGrowth: n })} />
        </div>
        <div className="cell">
          <FieldLabel fieldId="dcf.stub" label="Stub (portion of yr 1)" />
          <NumberInput value={dcf.stub} onCommit={(n) => setDcf({ stub: n })} />
        </div>
        <div className="cell">
          <span className="field-label"><span className="lbl">Terminal value basis</span></span>
          <select value={dcf.terminalBasis} onChange={(e) => setDcf({ terminalBasis: e.target.value as 'nominal' | 'faithful' })}>
            <option value="nominal">Nominal (corrected)</option>
            <option value="faithful">Faithful to sheet</option>
          </select>
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
      <CompanyHeader />
      <div className="layout">
        <div className="inputs">
          <BaseSection />
          <AssumptionsSection />
          <WaccSection />
          <CompsSection />
          <BridgeSection />
        </div>
        <div className="output">
          <Results />
        </div>
      </div>
    </main>
  );
}
