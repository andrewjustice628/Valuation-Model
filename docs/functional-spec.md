# Functional Spec — Valuation Model

Decoded from `Analyst Modeling Education- For App.xlsx` (4 sheets). This is the
canonical description of the math the app must reproduce. Source workbook is
gitignored and never committed.

Units: the model works in a single scale (e.g. "Thousands") chosen by the user;
per-share figures are absolute. All line items below are the **canonical** names
the engine uses internally; the UI lets the user map any report label onto them.

---

## Sheet 1 — Financial Model (three-statement build)

### Base info
- Company Name, Ticker, Unit (Thousands/Millions/etc.), Latest Closing Share
  Price, Latest Fiscal Year End Date, Shares Outstanding.
- In the sheet these came from Excel's live "Stocks" data type (`_FV(...)`);
  that linkage broke on export (cell shows `#VALUE!`). In the app these are
  fetched live (ticker → Netlify function) with a manual override.

### Assumption drivers (per fiscal year: ~2 historical + 5 forecast)
- Revenue Growth, Gross Profit Margin, R&D (% of Sales), SG&A (% of Sales),
  Tax Rate.
- Fiscal years auto-sequence: latest actual = `YEAR(latest FY end date)`;
  history = year−1, year−2; forecast = year+1 … year+5.

### Income Statement
```
Revenue                     (grows at Revenue Growth)
- COGS                      (= Revenue × (1 − Gross Margin))
= Gross Profit              (= Revenue − COGS)
- R&D                       (= Revenue × R&D%)
- SG&A                      (= Revenue × SG&A%)
- D&A
= Operating Profit (EBIT)   (= Gross Profit − R&D − SG&A − D&A)
+ Interest Income
- Interest Expense
- Other Expenses
= Pretax Profit             (= EBIT + IntInc − IntExp − Other)
- Taxes                     (= Pretax × Tax Rate)
= Net Income
```

### Balance Sheet
- Assets: Cash & Equivalents (fwd = prior cash + Net Change in Cash from CFS),
  Accounts Receivable (driver: Revenue), Inventories (driver: COGS), Other
  Current Assets (Revenue), PP&E (schedule/straight-line), Other Non-Current
  Assets (Revenue). Total Assets = sum.
- Liabilities: Accounts Payable (COGS), Other Current Liabilities (Revenue),
  Deferred Revenue (Revenue), Commercial Paper, Long-Term Debt, Other
  Non-Current Liabilities (Revenue growth). Total Liabilities = sum.
- Equity: Retained Earnings, Other Comprehensive Income, Common Stock.
  Total Equity = sum.
- **Balance Check** = Total Assets − (Total Liabilities + Total Equity); must be 0.

### Cash Flow Statement (indirect)
```
Net Income
+ D&A
+ Stock-Based Compensation
± Changes in Working Capital Assets
± Changes in Working Capital Liabilities
± Other Non-Current Assets / Liabilities
= Cash from Operating Activities
Capital Expenditures
= Cash from Investing Activities
Long-Term Debt / Revolver / Share Repurchases / Common Dividends
= Cash from Financing Activities
= Net Change in Cash During Period  (feeds next-year Cash on the BS)
```

## Sheet 2 — Additional Modeling and Tables
Supporting schedules (feed the statements above):
- Segment revenue build (3 segments, avg %growth), Total Revenue.
- PP&E schedule (BoP + Capex − Depreciation = EoP).
- D&A schedule (PP&E-related as % of capex + non-PP&E as % of revenue).
- Other Non-Current Assets schedule; Retained Earnings schedule.
- Sensitivity tables: Revenue, UFCF, WACC (bull/base/bear).

## Sheet 3 — DCF (primary valuation)
Forecast horizon = the 5 forecast years from the Financial Model.
```
Revenue, EBITDA (= EBIT + D&A), EBIT, Tax Rate
Tax on EBIT   = Tax Rate × EBIT
NOPAT/EBIAT   = EBIT − Tax on EBIT
+ D&A
- Changes in Net Working Capital   (= NWC_t − NWC_{t-1})
- Capital Expenditures
= Unlevered Free Cash Flow (UFCF)
```
**WACC (CAPM):**
```
Cost of Debt (after tax) = Cost of Debt × (1 − Tax Rate)
Market Risk Premium      = Market Return − Risk-Free Rate
Cost of Equity           = Risk-Free + Beta × MRP
WACC = CostDebtAT × Weight_Debt + CostEquity × Weight_Equity
```
**Discounting (with stub):** `stub = Portion of Year 1 CFs remaining`.
```
UFCF stub-adjusted:  Y1 = UFCF1 × stub;  Y2..Y5 = UFCF
PV of UFCF_n = PV(WACC, (n-1)+stub, 0, UFCF_stub_n)
```
**Terminal value (perpetuity growth):** long-term growth g ≈ 2.5%.
```
TV = FCF_terminal / (WACC − g)
PV(TV) = discounted back (4 + stub periods)
Enterprise Value = Σ PV(UFCF) + PV(TV)
```
**Net debt bridge → per share:**
```
Net Debt = Gross Debt (Debt + Convertible + Preferred + Minority) − Nonoperating
           (Cash + Equity Investments)
Equity Value = Enterprise Value − Net Debt
Equity Value per Share = Equity Value / Shares Outstanding
```

## Sheet 4 — Additional Valuation (comps)
```
Chosen Multiple (default EV/EBITDA)
Average multiple of Comps 1..5
Implied EV     = Company terminal-year EBITDA × Average multiple
Equity Value   = EV − Net Debt (from DCF)
Per Share      = Equity Value / Shares Outstanding
```

---

## QUIRKS / KNOWN-BUGS ledger (require Andrew's sign-off before we replicate or deviate)
Deviations from a faithful copy are tracked here. Status: `OPEN` until signed off.

- **Q1 — Terminal value grows the *discounted* final-year FCF (likely bug).**
  DCF!C58 = `G54*(1+g)` where G54 is the **PV** of year-5 UFCF, not the nominal
  year-5 UFCF (G53). Then TV is discounted *again* in C60. This double-discounts
  the terminal value. Standard practice grows the nominal terminal FCF.
  *Proposed:* compute TV from nominal terminal UFCF; flag as deviation. **STATUS: OPEN.**
- **Q2 — EBITDA % margin is inverted.** DCF!C14 = `Revenue / EBITDA` labelled
  "% Margin"; a margin is `EBITDA / Revenue`. *Proposed:* use EBITDA/Revenue.
  **STATUS: OPEN.**
- **Q3 — D&A sign convention.** Statements instruct entering subtractions as
  negatives so `SUM` works, but EBIT uses `GrossProfit − SUM(R&D,SG&A,D&A)`.
  Engine will use explicit signed line items and document the convention once
  a filled example is provided. **STATUS: OPEN.**
- **Q4 — No populated example in the source file.** Every input cell is blank
  (cached values are 0 / `#DIV/0!`), so true golden-master extraction isn't
  possible from this workbook. Golden parity needs a fully filled version.
  See decisions.md open item. **STATUS: OPEN.**
