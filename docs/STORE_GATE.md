# Chuckle Fantasy — Cuckle device gate

Run on a **real iPhone** (TestFlight or `?store=1` in Safari) before promoting
a build. A screenshot of Home is not a pass.

Production URL:

`https://slabslip.github.io/cuckle-trade-tracker/?store=1`

Local: `python3 -m http.server` then
`http://127.0.0.1:PORT/index.html?store=1&design=league-home` is **not** the
store path — Design Mode is banned in the binary. Gate Safari without
`design=`.

Automated smoke (Chrome, no Apple ID):

```bash
node scripts/store-device-gate.mjs
```

---

## Must pass

1. **Login** — gate sign-in, land on Your leagues or Cuckle home.
2. **Teams** — league bar Teams; all seats listed (not capped at 10).
3. **Trade vote** — open Latest trade / a deal; cast or see the three options.
4. **Calc** — open Cuckle trade calculator; two sides render.
5. **News** — News tab; feed or empty-state, no Design Mode chrome.
6. **Menu** — Menu opens settings / leagues; no sixth bar destination.
7. **Ledger** — tab exists; store copy says side bet / honor system; no
   in-app payment chrome.

Fail the build if any step errors, blanks, or opens `?design=`.

---

## After TestFlight week

Ten Cuckle managers use the shell as their daily door. If they fall back to
Safari, the shell is not done (safe area, cookies, or SW).
