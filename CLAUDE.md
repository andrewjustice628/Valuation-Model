# CLAUDE.md — Valuation-Model

Website "calculator" that replicates and extends the firm's equity-valuation
spreadsheet (`Analyst Modeling Education- For App.xlsx`). Built for a financial
advisor, not a dev team — favor clarity.

## What it is
A fully client-side single-page app: a three-statement financial model feeding a
**DCF** and a **comps** valuation, producing an equity value per share. New
valuation techniques (DDM, residual income, …) are added as pluggable modules.

## Hard rules
- **Client data never leaves the browser.** All valuation math is client-side.
  The only outbound request is a *ticker symbol* to fetch a public market quote,
  routed through a Netlify Function so the API key stays server-side.
- **Never commit the source workbook or any client data.** `*.xlsx/xls/csv` are
  gitignored. Never remove that rule.
- **Engine purity.** `src/engine/**` imports nothing from UI or store. It is
  pure functions over typed inputs, covered by Vitest (+ fast-check).
- **Quirk ledger.** Deviations from the source sheet's formulas are logged in
  `docs/functional-spec.md` (QUIRKS section) and need Andrew's sign-off. Don't
  silently "fix" or blindly copy sheet formulas.

## Layout
- `docs/functional-spec.md` — decoded model + quirk ledger
- `docs/decisions.md` — locked decisions + open questions
- `src/engine/` — pure valuation engine (types, statements, dcf, wacc, comps)
- `src/store/` — app state (zustand)
- `src/ui/` — React components (the calculator)
- `netlify/functions/` — market-data proxy (key hidden)

## Commands
- `npm run dev` — local dev server
- `npm test` — run engine tests
- `npm run build` — typecheck + production build
- Deploy: push to `main` → Netlify auto-deploy

## Pattern
Follows the fin-* pipeline: decode → spec → decisions → fixtures → pure engine
(golden/property tests) → store → UI. See the `fin-assetsplitter` repo for the
reference TypeScript engine discipline.
