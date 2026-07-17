# Decisions & Open Questions

Locked decisions and open items for the Valuation-Model app. Mirrors the
fin-* pattern (decode → spec → decisions → fixtures → engine → store → UI).

## Locked (2026-07-17)
- **D1 — Deploy target: Netlify.** Serves the **private** repo for free (no
  conflict with the all-private policy), reuses Andrew's existing account,
  auto-deploys on push to `main`.
- **D2 — 100% client-side computation.** All valuation math runs in the
  browser; a client's financial numbers never leave the machine (local-only
  policy). The only outbound call is a ticker symbol for a market quote.
- **D3 — Market data: live auto-fetch via a Netlify Function.** Client sends a
  ticker to our function; the function calls the provider with a key held in a
  Netlify env var (never in the client bundle). A **manual override** for price
  and shares outstanding is always present so the tool never hard-breaks.
  Provider is behind a pluggable interface (swap without touching the app).
- **D4 — Scope v1: full faithful model.** Three-statement build + DCF + comps,
  closely resembling the source sheet.
- **D5 — Extensibility: valuation methods are pluggable modules.** DCF and comps
  ship first; DDM / residual income / others drop in against a common interface
  without changing the core engine.
- **D6 — Stack:** TypeScript / React / Vite, pure engine (zero UI/store imports)
  pinned to tests, Vitest (+ fast-check property tests). Same discipline as
  `fin-assetsplitter`.
- **D7 — Label mapping.** Engine consumes ~canonical line items only; the UI
  provides a mapping/alias layer so any report's wording maps onto them.

## Open — need Andrew's input
- **O1 — Filled example for golden parity.** The source workbook is entirely
  blank (all inputs empty), so we cannot extract a golden-master snapshot from
  it (spec Q4). *Ask:* can you provide one fully filled-in version (real numbers
  for a company you've modeled) so the engine can be pinned to exact parity?
  Until then, engine tests assert against formula definitions + a hand-built
  worked example.
- **O2 — Quirk sign-offs.** Confirm dispositions for spec Q1 (terminal-value
  double-discount), Q2 (inverted EBITDA margin), Q3 (D&A sign convention).
  Default proposal: fix all three; document each as an intentional deviation.
- **O3 — RESOLVED (2026-07-17): Finnhub.** Proxied by `netlify/functions/quote.ts`
  (route `/api/quote`), key in `FINNHUB_API_KEY`. Uses Finnhub `quote` (price /
  previous close) + `stock/profile2` (name, shares outstanding, reported in
  millions → ×1e6). Andrew adds the key to a local `.env` and to Netlify env
  vars. Live fetch locally needs `netlify dev` (not plain `npm run dev`);
  everything else works with manual entry.
- **O4 — Comps input.** Auto-fetch peer multiples too, or manual entry of the
  5 comparable-company multiples? Default v1: manual entry (matches the sheet).
