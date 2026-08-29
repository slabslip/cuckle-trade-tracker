#!/usr/bin/env node
/** Per-person dashboard. Loads data/ui/*.json — serve over http. */
import fs from "node:fs";
import { ROOT } from "./lib.mjs";

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta http-equiv="Cache-Control" content="no-cache" />
  <meta name="theme-color" content="#0b0b0d" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black" />
  <title>CuckleChunckle</title>
  <style>
    :root {
      --bg: #0b0b0d; --card: #141416; --line: #2a2a30;
      --text: #f0f0f0; --muted: #9a9aa3; --dim: #8a8a93;
      --green: #3ddc97; --red: #e05555;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; background: var(--bg); color: var(--text); overflow-x: hidden; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 16px;
      max-width: 920px; margin: 0 auto;
      padding:
        max(16px, env(safe-area-inset-top, 0px))
        max(16px, env(safe-area-inset-right, 0px))
        max(24px, env(safe-area-inset-bottom, 0px))
        max(16px, env(safe-area-inset-left, 0px));
      -webkit-tap-highlight-color: rgba(255,255,255,0.08);
    }
    h1.brand {
      display: flex; align-items: center; gap: 10px;
      font-size: 1.4rem; font-weight: 650; margin: 0 0 12px; letter-spacing: -0.02em;
    }
    h1.brand a { color: inherit; text-decoration: none; margin-right: auto; }
    button.go-home {
      flex: 0 0 auto; appearance: none; font: inherit; color: inherit;
      background: var(--card); border: 1px solid var(--line); border-radius: 10px;
      width: 44px; height: 44px; padding: 0; display: grid; place-items: center; cursor: pointer;
    }
    button.go-home:focus-visible { outline: 2px solid #c8c8d0; outline-offset: 2px; }
    h2 { font-size: 1.05rem; font-weight: 650; margin: 26px 0 8px; }
    p { color: var(--muted); line-height: 1.45; margin: 0 0 14px; }
    .caption { font-size: 0.8125rem; color: var(--dim); margin: 6px 0 14px; }
    #lead:empty { display: none; }
    select.who {
      flex: 0 1 158px; width: 158px; max-width: 42%;
      appearance: none; font: inherit; font-size: 0.8125rem; color: var(--text);
      background: var(--card) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%239a9aa3' d='M1 1l5 5 5-5'/%3E%3C/svg%3E") no-repeat right 10px center;
      border: 1px solid var(--line); border-radius: 8px;
      min-height: 36px; padding: 6px 28px 6px 10px; margin: 0;
    }
    select.who:focus-visible { outline: 2px solid #c8c8d0; outline-offset: 2px; }
    button.row, button.chip, button.tab, .row {
      appearance: none; font: inherit; color: inherit; text-align: left;
      background: var(--card); border: 1px solid var(--line); border-radius: 10px;
      min-height: 44px; touch-action: manipulation;
    }
    button.row, button.chip, button.tab { cursor: pointer; }
    button.tab:focus-visible, button.chip:focus-visible, button.row:focus-visible {
      outline: 2px solid #c8c8d0; outline-offset: 2px;
    }
    .you { color: var(--text); font-weight: 650; }
    .nav, .toggle { display: flex; gap: 8px; flex-wrap: wrap; margin: 12px 0 16px; }
    button.tab, button.chip {
      border-radius: 999px; padding: 10px 14px; color: var(--muted);
    }
    button.tab.on, button.chip.on { color: var(--text); background: #1c1c22; }
    .hero { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px; }
    .hero b { display: block; font-size: 2rem; letter-spacing: -0.03em; }
    .pos { color: var(--green); } .neg { color: var(--red); }
    .row { width: 100%; padding: 12px; margin: 0 0 8px; }
    .row-top { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; }
    .row-top.tape { display: grid; grid-template-columns: 1fr auto 1fr; gap: 8px; width: 100%; align-items: start; }
    .row-top.tape .side.right { text-align: right; }
    .row-top.tape .mid { text-align: center; font-variant-numeric: tabular-nums; }
    .row.own-pick { border-color: #2e6b4f; }
    .row.away-pick { border-color: #6b5a2e; }
    .origin.own { color: var(--green); font-weight: 650; }
    .origin.away { color: #e0b44c; font-weight: 650; }
    .row-top.tape .val { font-variant-numeric: tabular-nums; font-weight: 650; }
    .names { font-weight: 600; }
    .date { color: var(--dim); font-size: 0.8125rem; }
    .margin { font-variant-numeric: tabular-nums; font-weight: 650; }
    .detail { display: none; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--line); }
    .row.open .detail { display: block; }
    .bags { display: grid; gap: 12px; }
    @media (min-width: 640px) { .bags { grid-template-columns: 1fr 1fr; } }
    .bag h3 { margin: 0 0 6px; font-size: 0.92rem; }
    .leg { display: flex; justify-content: space-between; gap: 8px; font-size: 0.84rem; padding: 3px 0; color: var(--muted); }
    .leg[data-pick] {
      width: 100%; padding: 8px 0; cursor: pointer; min-height: 44px;
      touch-action: manipulation;
    }
    .leg[data-pick].on { color: var(--text); }
    .hops { margin: 2px 0 10px 8px; padding-left: 10px; border-left: 2px solid var(--line); }
    .hop { display: flex; justify-content: space-between; gap: 8px; font-size: 0.8125rem; padding: 4px 0; color: var(--dim); }
    .hop b { color: var(--text); font-variant-numeric: tabular-nums; }
    .leg b { color: var(--text); font-variant-numeric: tabular-nums; }
    .warn { color: #e0b44c; font-size: 0.8125rem; }
    .badge { font-size: 0.8125rem; color: #e0b44c; }
    svg.spark { width: 100%; height: 72px; margin-top: 8px; }
    a.back { color: var(--muted); font-size: 0.85rem; }
    #feed { overflow: hidden; margin: 0 0 14px; }
    #feed:empty, #feed[hidden] { display: none; }
    .ticker {
      overflow: hidden;
      mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent);
    }
    .ticker-track {
      display: flex; gap: 8px; width: max-content;
      animation: ticker 48s linear infinite;
    }
    @keyframes ticker { to { transform: translateX(-50%); } }
    @media (prefers-reduced-motion: reduce) {
      .ticker { overflow-x: auto; mask-image: none; }
      .ticker-track { animation: none; }
    }
    button.bubble {
      flex: 0 0 auto; appearance: none; font: inherit; color: inherit;
      background: var(--card); border: 1px solid var(--line); border-radius: 999px;
      padding: 8px 14px; min-height: 40px; white-space: nowrap; cursor: pointer;
    }
    button.bubble:focus-visible { outline: 2px solid #c8c8d0; outline-offset: 2px; }
    button.bubble b { font-weight: 650; }
    button.bubble span { color: var(--dim); }
    .day-alert {
      background: #1a1810; border: 1px solid #6b5a2e; border-radius: 12px;
      padding: 12px; margin: 0 0 14px;
    }
    .day-alert-h { font-weight: 650; }
    .day-alert-h span { display: block; color: var(--dim); font-weight: 500; font-size: 0.8125rem; margin-top: 4px; }
    .day-scroller {
      display: flex; gap: 8px; overflow-x: auto; margin-top: 10px;
      padding-bottom: 2px; -webkit-overflow-scrolling: touch;
    }
    button.day-chip {
      flex: 0 0 220px; appearance: none; font: inherit; color: inherit; text-align: left;
      background: var(--card); border: 1px solid var(--line); border-radius: 10px;
      padding: 10px 12px; min-height: 52px; cursor: pointer;
    }
    button.day-chip.on { border-color: #6b5a2e; }
    button.day-chip:focus-visible { outline: 2px solid #c8c8d0; outline-offset: 2px; }
    button.day-chip b { display: block; font-weight: 650; }
    button.day-chip span { display: block; color: var(--dim); font-size: 0.8125rem; margin-top: 2px; }
    .day-alert .row { margin-top: 10px; }
    .marks { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 8px; }
    button.mark {
      flex: 1 1 calc(50% - 8px); min-width: 140px;
      appearance: none; font: inherit; color: inherit; text-align: left;
      background: var(--card); border: 1px solid var(--line); border-radius: 12px;
      padding: 10px 12px; min-height: 52px; cursor: pointer;
    }
    button.mark:focus-visible { outline: 2px solid #c8c8d0; outline-offset: 2px; }
    button.mark b { display: block; font-weight: 650; }
    button.mark span { display: block; color: var(--dim); font-size: 0.8125rem; margin-top: 2px; }
    button.mark.pos b { color: var(--green); }
    button.mark.neg b { color: var(--red); }
    .pack { margin: 0 0 8px; }
    button.pack-head {
      display: flex; justify-content: space-between; align-items: center; gap: 10px;
      width: 100%; appearance: none; font: inherit; color: inherit; text-align: left;
      background: var(--card); border: 1px solid var(--line); border-radius: 10px;
      min-height: 44px; padding: 12px; cursor: pointer;
    }
    button.pack-head:focus-visible { outline: 2px solid #c8c8d0; outline-offset: 2px; }
    button.pack-head h2 { margin: 0; font-size: 1.05rem; }
    .pack-head .chev { color: var(--muted); font-variant-numeric: tabular-nums; }
    .pack-body { margin-top: 8px; }
    .draft-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin: 12px 0 8px; }
    .draft-head .caption { margin: 0; padding-top: 10px; }
    .lens-row { display: flex; align-items: center; gap: 10px; margin: 8px 0 12px; }
    .lens-row-left { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 10px; }
    .lens-row-left .caption, .lens-row .filter-hint { margin: 0; }
    .lens-row-left .caption { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    button.score-btn {
      flex: 0 0 auto; margin-left: auto; appearance: none; font: inherit;
      font-size: 0.8125rem; color: var(--text);
      background: var(--card); border: 1px solid var(--line); border-radius: 999px;
      min-height: 36px; padding: 6px 12px; position: relative; cursor: pointer;
      white-space: nowrap;
    }
    button.score-btn.on { border-color: #6b5a2e; }
    button.score-btn:focus-visible { outline: 2px solid #c8c8d0; outline-offset: 2px; }
    button.score-btn .score-k { color: var(--dim); }
    button.score-btn .chev { color: var(--muted); }
    button.score-btn .dot {
      position: absolute; top: 6px; right: 6px;
      width: 7px; height: 7px; border-radius: 50%; background: #e0b44c;
    }
    #scoreAs {
      position: absolute; top: 52px; right: 0; left: auto; z-index: 12;
      width: min(280px, calc(100vw - 32px)); margin: 0; padding: 6px;
      display: flex; flex-direction: column; gap: 4px;
      box-shadow: 0 10px 28px rgba(0,0,0,0.55);
    }
    #scoreAs button.score-opt, #scoreAs button.score-more {
      appearance: none; font: inherit; color: inherit; text-align: left;
      background: #1c1c22; border: 1px solid var(--line); border-radius: 8px;
      min-height: 44px; padding: 8px 10px; cursor: pointer;
    }
    #scoreAs button.score-opt.on { border-color: #6b5a2e; }
    #scoreAs button.score-opt b { display: block; font-weight: 650; }
    #scoreAs button.score-opt span { display: block; color: var(--dim); font-size: 0.75rem; margin-top: 2px; }
    #scoreAs button.score-more { color: var(--muted); min-height: 36px; text-align: center; }
    #scoreAs button.score-opt:focus-visible, #scoreAs button.score-more:focus-visible {
      outline: 2px solid #c8c8d0; outline-offset: 2px;
    }
    button.filter-btn {
      flex: 0 0 auto; appearance: none; font: inherit; color: var(--muted);
      background: var(--card); border: 1px solid var(--line); border-radius: 10px;
      width: 44px; height: 44px; padding: 0; display: grid; place-items: center;
      position: relative; cursor: pointer;
    }
    button.filter-btn.on { color: var(--text); border-color: #6b5a2e; }
    button.filter-btn:focus-visible { outline: 2px solid #c8c8d0; outline-offset: 2px; }
    button.filter-btn .dot {
      position: absolute; top: 8px; right: 8px;
      width: 7px; height: 7px; border-radius: 50%; background: #e0b44c;
    }
    .filter-panel {
      background: var(--card); border: 1px solid var(--line); border-radius: 10px;
      padding: 4px 12px; margin: 0 0 14px;
    }
    .filter-panel label {
      display: flex; align-items: center; gap: 10px;
      min-height: 44px; color: var(--text);
    }
    .filter-panel input { width: 18px; height: 18px; accent-color: var(--green); }
    .filter-panel .rule { border: 0; border-top: 1px solid var(--line); margin: 4px 0; }
    .filter-panel .filter-h { color: var(--dim); font-size: 0.75rem; margin: 8px 0 0; }
    .filter-hint { display: flex; align-items: center; gap: 10px; margin: 12px 0 8px; }
    .filter-hint .caption { margin: 0; }
    .filter-wrap { position: relative; z-index: 4; }
    #yearFilters {
      position: absolute; top: 52px; left: 0; z-index: 12;
      width: 168px; margin: 0; padding: 6px;
      display: flex; flex-wrap: wrap; gap: 4px;
      box-shadow: 0 10px 28px rgba(0,0,0,0.55);
    }
    #yearFilters button {
      appearance: none; font: inherit; font-size: 0.8125rem; color: var(--muted);
      background: #1c1c22; border: 1px solid var(--line); border-radius: 8px;
      min-height: 32px; padding: 4px 8px; cursor: pointer;
    }
    #yearFilters button.on { color: var(--text); border-color: #6b5a2e; }
    #yearFilters button:focus-visible { outline: 2px solid #c8c8d0; outline-offset: 2px; }
  </style>
</head>
<body>
  <h1 class="brand">
    <button type="button" class="go-home" id="goHome" aria-label="Home">
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path fill="currentColor" d="M12 3.2l9 7.4h-2.4V21h-5.2v-6.2H10.6V21H5.4v-10.4H3L12 3.2z"/>
      </svg>
    </button>
    <a href="./">CuckleChunckle</a>
    <select class="who" id="who" aria-label="Team">
      <option value="">Team</option>
    </select>
  </h1>
  <p id="lead"></p>
  <div id="feed" hidden></div>
  <div id="app" hidden></div>
  <script>
    const fmt = (n) => n == null || Number.isNaN(n) ? "—" : Math.round(n).toLocaleString();
    const cls = (n) => n == null ? "" : n >= 0 ? "pos" : "neg";
    let members = [];
    let me = null;
    let data = null;
    let league = null;
    let picks = null;
    let lens = "all";
    const DATA_V = "20260828ai";
    const openPacks = new Set();
    const WINDOWS = [
      ["t0", "At trade"],
      ["y1", "First 1 year"],
      ["y2", "First 2 years"],
      ["y3", "First 3 years"],
      ["all", "Since trade"],
    ];
    const SCORE_MAIN = [
      ["all", "Since trade", "Typical year from accept through now"],
      ["y3", "First 3 years", "Typical year in the first 3 after accept"],
      ["t0", "At trade", "Bags the day they accepted (picks still picks)"],
    ];
    const SCORE_MORE = [
      ["y2", "First 2 years", "Typical year in the first 2 after accept"],
      ["y1", "First 1 year", "Typical year in the first year after accept"],
    ];
    let view = "home";
    let draftTab = "rookie";
    let draftSort = "new";
    let draftRounds = { 1: true, 2: true, 3: true, 4: true };
    let draftStartup = false;
    let draftFilterOpen = false;
    let year = "all";
    let yearFilterOpen = false;
    let lensOpen = false;
    let scoreMoreOpen = false;
    let openId = null;
    let openPick = null;
    let openDraft = null;
    let partnerName = null;
    let boardClock = "today";
    let boardWindow = "all";
    const seatCache = {};

    const params = new URLSearchParams(location.search);
    const startLens = params.get("lens");
    if (startLens && WINDOWS.some((w) => w[0] === startLens)) lens = startLens;

    function spark(series) {
      const keys = Object.keys(series[0] || {}).filter((k) => k !== "as_of");
      if (series.length < 2 || !keys.length) return "";
      const vals = keys.map((k) => series.map((p) => p[k] || 0));
      const flat = vals.flat();
      const min = Math.min(...flat), max = Math.max(...flat), span = max - min || 1;
      const w = 300, h = 72, pad = 6;
      const colors = ["#3ddc97", "#7aa2ff", "#e0b44c"];
      return '<svg class="spark" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none">' +
        vals.map((arr, i) => {
          const d = arr.map((v, x) => {
            const px = pad + (x / (arr.length - 1)) * (w - pad * 2);
            const py = pad + (1 - (v - min) / span) * (h - pad * 2);
            return (x ? "L" : "M") + px.toFixed(1) + " " + py.toFixed(1);
          }).join(" ");
          return '<path d="' + d + '" fill="none" stroke="' + colors[i % 3] + '" stroke-width="1.6"/>';
        }).join("") + "</svg>";
    }

    function hopHtml(key) {
      const p = picks && picks[key];
      if (!p) return '<div class="hops caption">No hop tape.</div>';
      const head = p.became
        ? p.became + (p.used_by ? " · used by " + p.used_by : "")
        : (p.still_pick ? "still a pick" : "");
      return '<div class="hops">' + (head ? '<div class="date">' + head + "</div>" : "")
        + p.hops.map((h) => {
          const exit = h.exit === "drafted" ? " · used" : h.exit === "flip" ? " · sold" : " · held";
          return '<div class="hop"><span>' + h.date + " · " + (h.from || "?") + " → " + h.to + exit
            + "</span><b>" + fmt(h.t0) + " → " + fmt(h.out) + "</b></div>";
        }).join("") + "</div>";
    }

    function bagBlock(title, legs, total, unpriced) {
      const items = (legs || []).map((l) => {
        const val = l.flag === "unpriced" || l.value == null
          ? "no DP row"
          : l.flag === "priced_as_mid" ? fmt(l.value) + " · Mid"
          : l.flag && String(l.flag).startsWith("priced_as_")
            ? fmt(l.value) + " · as " + String(l.flag).slice(10)
          : fmt(l.value);
        const body = "<span>" + l.label + "</span><b>" + val + "</b>";
        if (l.kind === "pick" && l.asset_key) {
          const open = openPick === l.asset_key;
          return '<div class="leg' + (open ? " on" : "") + '" data-pick="' + l.asset_key + '">'
            + body + "</div>" + (open ? hopHtml(l.asset_key) : "");
        }
        return '<div class="leg">' + body + "</div>";
      }).join("");
      const warn = unpriced ? '<div class="warn">' + unpriced + " no DP row</div>" : "";
      const shown = unpriced && !total ? "—" : fmt(total);
      return '<div class="bag"><h3>' + title + " · " + shown + "</h3>" + warn + items + "</div>";
    }

    async function loadMembers() {
      members = await (await fetch("data/ui/members.json?" + DATA_V)).json();
      league = await (await fetch("data/ui/league.json?" + DATA_V)).json();
      paintWho();
      document.getElementById("app").hidden = false;
      render();
    }

    function paintWho() {
      const sel = document.getElementById("who");
      sel.innerHTML = '<option value="">Team</option>'
        + members.map((m) =>
          '<option value="' + m.user_id + '"' + (me && me.user_id === m.user_id ? " selected" : "") + ">"
          + m.name + "</option>"
        ).join("");
    }

    function clearLeague() {
      me = null;
      data = null;
      view = "home";
      openId = null;
      partnerName = null;
      openPick = null;
      openDraft = null;
      document.getElementById("lead").textContent = "";
      paintWho();
      syncUrl();
      render();
    }

    function syncUrl() {
      const q = new URLSearchParams();
      if (me) q.set("me", me.name);
      if (view && view !== "home") q.set("view", view);
      if (openId) q.set("t", openId);
      if (lens && lens !== "all") q.set("lens", lens);
      history.replaceState(null, "", "?" + q.toString());
    }

    async function selectMe(id, keep) {
      me = members.find((m) => m.user_id === id);
      data = await (await fetch("data/ui/me/" + id + ".json?" + DATA_V)).json();
      seatCache[id] = data;
      if (!league) league = await (await fetch("data/ui/league.json?" + DATA_V)).json();
      if (!picks) picks = await (await fetch("data/ui/picks.json?" + DATA_V)).json();
      document.getElementById("lead").textContent = "";
      document.getElementById("app").hidden = false;
      paintWho();
      if (!keep) {
        view = "home";
        openId = null;
        partnerName = null;
        openPick = null;
        openDraft = null;
      }
      syncUrl();
      render();
    }

    function gradeLabel(g) {
      if (g === "you_extract") return "you extract";
      if (g === "they_extract") return "they extract";
      return "even";
    }

    function gradeCls(g) {
      if (g === "you_extract") return "pos";
      if (g === "they_extract") return "neg";
      return "";
    }

    function sideOf(t) {
      return (t.windows && t.windows[lens]) || t.even || t.realized;
    }

    // ponytail: middle = rounded bags, so 12,944 − 6,874 reads 6,070 not a raw 6069.33 or an aged leftover.
    function displayDelta(got, sent) {
      if (got == null || sent == null || Number.isNaN(got) || Number.isNaN(sent)) return null;
      return Math.round(got) - Math.round(sent);
    }

    function windowScore(r) {
      const w = r.windows && r.windows[lens];
      if (!w || w.incomplete) return null;
      return displayDelta(w.got, w.sent);
    }

    function tradeDelta(t) {
      if (!t || t.incomplete) return null;
      const s = sideOf(t);
      if (!s || s.incomplete || s.today == null || s.sent_today == null) return null;
      return displayDelta(s.today, s.sent_today);
    }

    function chipLived(date) {
      if (lens === "t0" || lens === "all") return true;
      return windowLived(date);
    }

    function windowPer(list) {
      const ds = (list || []).filter((t) => chipLived(t.date)).map(tradeDelta).filter((d) => d != null);
      if (!ds.length) return null;
      return ds.reduce((a, b) => a + b, 0) / ds.length;
    }

    function windowTotal(list) {
      const ds = (list || []).filter((t) => chipLived(t.date)).map(tradeDelta).filter((d) => d != null);
      return ds.length ? ds.reduce((a, b) => a + b, 0) : null;
    }

    function addYears(ymd, n) {
      const p = (ymd || "").split("-").map(Number);
      if (p.length < 3) return ymd;
      const y = p[0] + n, m = p[1], d = p[2];
      const dim = new Date(y, m, 0).getDate();
      return y + "-" + String(m).padStart(2, "0") + "-" + String(Math.min(d, dim)).padStart(2, "0");
    }

    function windowLived(date) {
      const need = { t0: 0, y1: 1, y2: 2, y3: 3, all: 1 }[lens];
      if (!need) return true;
      const today = (league && league.today) || "";
      return date <= addYears(today, -need);
    }

    function rankAge(dir) {
      const sides = (league && league.trade_boards && league.trade_boards.sides) || [];
      const by = new Map();
      for (const r of sides) {
        if (!windowLived(r.date)) continue;
        const s = windowScore(r);
        if (s == null) continue;
        const prev = by.get(r.transaction_id);
        if (!prev) { by.set(r.transaction_id, r); continue; }
        const ps = windowScore(prev);
        if (dir > 0 ? s > ps : s < ps) by.set(r.transaction_id, r);
      }
      return [...by.values()].sort((a, b) => dir * (windowScore(b) - windowScore(a))).slice(0, 10);
    }

    async function seatData(uid) {
      if (!seatCache[uid]) {
        seatCache[uid] = await (await fetch("data/ui/me/" + uid + ".json?" + DATA_V)).json();
      }
      if (!picks) picks = await (await fetch("data/ui/picks.json?" + DATA_V)).json();
      return seatCache[uid];
    }

    function boardTape(r) {
      const cached = seatCache[r.user_id];
      const hit = cached && (cached.trades || []).find((t) => t.transaction_id === r.transaction_id);
      if (openId === r.transaction_id && hit) return tradeRow(hit);
      const w = (r.windows && r.windows[lens]) || {};
      const s = windowScore(r);
      const got = w.incomplete && !w.got ? "—" : fmt(w.got);
      const sent = w.incomplete && !w.sent ? "—" : fmt(w.sent);
      const mid = s == null ? "—" : s > 0 ? "← " + fmt(s) : s < 0 ? fmt(Math.abs(s)) + " →" : fmt(s);
      const leftCls = s == null || s === 0 ? "" : s > 0 ? "pos" : "neg";
      const rightCls = s == null || s === 0 ? "" : s > 0 ? "neg" : "pos";
      return '<button type="button" class="row" data-board-open="' + r.user_id + '" data-id="' + r.transaction_id + '">'
        + '<div class="row-top tape">'
        + '<div class="side"><span class="names ' + leftCls + '">' + r.name + '</span> <span class="val">' + got + "</span></div>"
        + '<div class="mid"><span class="margin pos">' + mid + "</span>"
        + '<div class="date">' + r.date + (r.headline ? " · " + r.headline : "") + "</div></div>"
        + '<div class="side right"><span class="val">' + sent + '</span> <span class="names ' + rightCls + '">' + r.other + "</span></div>"
        + "</div></button>";
    }

    function yearsOn(days) {
      if (days == null) return "—";
      if (days < 365) return days + "d";
      const y = days / 365;
      return (Math.round(y * 10) / 10).toString().replace(/\.0$/, "") + "y";
    }

    function listRow(r, right) {
      return '<div class="row"><div class="row-top"><div><div class="names">' + r.name + "</div>"
        + '<div class="date">' + (r.team || "") + (r.stays > 1 ? " · " + r.stays + " stays" : "") + "</div></div>"
        + '<div class="margin">' + right + "</div></div></div>";
    }

    function pack(id, title, inner) {
      const on = openPacks.has(id);
      return '<div class="pack">'
        + '<button type="button" class="pack-head" data-pack="' + id + '" aria-expanded="' + on + '">'
        + "<h2>" + title + "</h2><span class='chev'>" + (on ? "-" : "+") + "</span></button>"
        + (on ? '<div class="pack-body">' + inner + "</div>" : "")
        + "</div>";
    }

    function renderPlayerLists() {
      const p = (league && league.player_lists) || {};
      const most = (p.most_traded || []).map((r) => listRow(r, r.trades + (r.trades === 1 ? " trade" : " trades"))).join("");
      const least = (p.least_traded || []).map((r) => listRow(r, r.trades + (r.trades === 1 ? " trade" : " trades"))).join("");
      const forever = (p.forever || []).map((r) => listRow(r, yearsOn(r.days))).join("");
      const stay = (p.homesteaders || []).map((r) => listRow(r, yearsOn(r.days))).join("");
      return pack("passed", "Most passed around", most)
        + pack("least", "Least traded", least)
        + pack("forever", "Forever players", forever)
        + pack("home", "Homesteaders", stay);
    }

    function leagueBubbles() {
      const items = [];
      const best = rankAge(1)[0];
      const worst = rankAge(-1)[0];
      if (best) items.push({ pack: "best", kicker: "Best aged", line: best.name + " vs " + best.other + " · " + fmt(windowScore(best)) });
      if (worst) items.push({ pack: "worst", kicker: "Worst aged", line: worst.name + " vs " + worst.other + " · " + fmt(windowScore(worst)) });
      const traders = ((league && league.traders) || []).slice().sort((a, b) => (b.two_way || 0) - (a.two_way || 0));
      if (traders[0]) items.push({ pack: "", kicker: "Most active", line: traders[0].name + " · " + traders[0].two_way + " trades" });
      if (traders.length > 1) {
        const quiet = traders[traders.length - 1];
        items.push({ pack: "", kicker: "Least active", line: quiet.name + " · " + quiet.two_way + " trades" });
      }
      const p = (league && league.player_lists) || {};
      const hot = (p.most_traded || [])[0];
      const cold = (p.least_traded || [])[0];
      const stay = (p.homesteaders || [])[0];
      if (hot) items.push({ pack: "passed", kicker: "Most passed around", line: hot.name + " · " + hot.trades + " trades" });
      if (cold) items.push({ pack: "least", kicker: "Least traded", line: cold.name + " · " + cold.team });
      if ((p.forever || []).length) items.push({ pack: "forever", kicker: "Forever players", line: p.forever.length + " still on their startup team" });
      if (p.forever && p.forever[0]) items.push({ pack: "forever", kicker: "Forever", line: p.forever[0].name + " · " + p.forever[0].team });
      if (stay) items.push({ pack: "home", kicker: "Homesteader", line: stay.name + " · " + yearsOn(stay.days) });
      return items;
    }

    function paintFeed() {
      const el = document.getElementById("feed");
      if (me || view !== "home") {
        el.hidden = true;
        el.innerHTML = "";
        el.dataset.key = "";
        return;
      }
      const items = leagueBubbles();
      const key = lens + ":" + items.map((b) => b.kicker + b.line).join("|");
      if (el.dataset.key === key) { el.hidden = false; return; }
      el.dataset.key = key;
      el.hidden = !items.length;
      const pill = (b) => '<button type="button" class="bubble"' + (b.pack ? ' data-pack="' + b.pack + '"' : "") + ">"
        + "<b>" + b.kicker + "</b> <span>" + b.line + "</span></button>";
      const row = items.map(pill).join("");
      el.innerHTML = '<div class="ticker" aria-label="League feed"><div class="ticker-track">' + row + row + "</div></div>";
    }

    function renderLeagueHome() {
      return dayAlert()
        + lensRow()
        + pack("best", "Best aged", rankAge(1).map(boardTape).join(""))
        + pack("worst", "Worst aged", rankAge(-1).map(boardTape).join(""))
        + renderPlayerLists();
    }

    function partnerLine(p) {
      const g = p.per == null ? "even" : p.per >= 100 ? "you_extract" : p.per <= -100 ? "they_extract" : "even";
      return '<button type="button" class="row" data-partner="' + p.name + '">'
        + '<div class="row-top"><div><div class="names">' + p.name + "</div>"
        + '<div class="date">' + p.n + " complete · " + gradeLabel(g) + "</div></div>"
        + '<div class="margin ' + cls(p.per) + '">' + fmt(p.per) + "</div></div></button>";
    }

    function draftLine(p, tag) {
      if (!p) return "";
      return '<div class="row"><div class="row-top"><div><div class="names">' + p.player + "</div>"
        + '<div class="date">' + tag + " · " + p.season + " R" + p.round + "</div></div>"
        + '<div class="margin ' + cls(p.surplus) + '">' + fmt(p.surplus) + "</div></div></div>";
    }

    function deltaAt(t, key) {
      if (!t || t.incomplete) return null;
      const s = t.windows && t.windows[key];
      if (!s || s.incomplete || s.today == null || s.sent_today == null) return null;
      return displayDelta(s.today, s.sent_today);
    }

    function mark(view, title, sub, tone) {
      return '<button type="button" class="mark' + (tone ? " " + tone : "") + '" data-view="' + view + '">'
        + "<b>" + title + "</b>" + (sub ? "<span>" + sub + "</span>" : "") + "</button>";
    }

    function teamMarks() {
      const n = (data.hero && data.hero.two_way) || 0;
      const volume = n >= 80 ? "Hyper" : n >= 40 ? "Active" : "Quiet";
      const st = data.style || {};
      const soldPicks = st.sold_picks_for_players || 0;
      const soldPlayers = st.sold_players_for_picks || 0;
      let posture = "Swap shop";
      let postureSub = soldPicks + " pick sales · " + soldPlayers + " player sales";
      if (soldPlayers >= soldPicks + 5) { posture = "Buys picks"; postureSub = soldPlayers + " player sales · " + soldPicks + " pick sales"; }
      else if (soldPicks >= soldPlayers + 5) { posture = "Buys players"; postureSub = soldPicks + " pick sales · " + soldPlayers + " player sales"; }
      const graded = (data.partners || []).filter((p) => p.complete >= 1);
      const extract = graded.filter((p) => p.grade === "you_extract").length;
      const farmed = graded.filter((p) => p.grade === "they_extract").length;
      let manners = "Fair";
      let mannersTone = "";
      if (farmed >= extract + 2) { manners = "Gets extracted"; mannersTone = "neg"; }
      else if (extract > farmed) { manners = "Extracts"; mannersTone = "pos"; }
      const mannersSub = extract + " extract · " + farmed + " farmed · " + (graded.length - extract - farmed) + " even";
      const aged = [];
      for (const t of data.trades || []) {
        if ((t.others || []).length !== 1) continue;
        const now = deltaAt(t, "all");
        const t0 = deltaAt(t, "t0");
        if (now == null || t0 == null) continue;
        aged.push(now - t0);
      }
      const ageMean = aged.length ? aged.reduce((a, b) => a + b, 0) / aged.length : null;
      let aging = "Held";
      let agingTone = "";
      if (ageMean != null && ageMean > 100) { aging = "Aged up"; agingTone = "pos"; }
      else if (ageMean != null && ageMean < -100) { aging = "Aged down"; agingTone = "neg"; }
      const agingSub = ageMean == null ? "no T0 to compare" : fmt(ageMean) + " after accept";
      const rook = ((data.drafts && data.drafts.rookie) || []).filter((p) => p.surplus != null);
      const draftMean = rook.length ? rook.reduce((a, p) => a + p.surplus, 0) / rook.length : null;
      let draft = "Mixed";
      let draftTone = "";
      if (draftMean != null && draftMean > 200) { draft = "Hit factory"; draftTone = "pos"; }
      else if (draftMean != null && draftMean < -500) { draft = "Miss factory"; draftTone = "neg"; }
      const draftSub = draftMean == null ? "no graded rookies" : fmt(draftMean) + " / pick · " + rook.length + " rookies";
      return '<div class="marks">'
        + mark("trades", n + " trades", volume)
        + mark("trades", posture, postureSub)
        + mark("partners", manners, mannersSub, mannersTone)
        + mark("trades", aging, agingSub, agingTone)
        + mark("drafts", draft, draftSub, draftTone)
        + "</div>";
    }

    function tapeDay() {
      return new Date().toISOString().slice(0, 10);
    }

    function daySides() {
      const day = tapeDay();
      const sides = (league && league.trade_boards && league.trade_boards.sides) || [];
      const byDay = new Map();
      let last = "";
      for (const r of sides) {
        if (r.date > last) last = r.date;
        if (!byDay.has(r.date)) byDay.set(r.date, new Map());
        const by = byDay.get(r.date);
        const prev = by.get(r.transaction_id);
        if (!prev || (me && r.user_id === me.user_id)) by.set(r.transaction_id, r);
      }
      const todayRows = [...(byDay.get(day)?.values() || [])];
      const showDay = todayRows.length ? day : last;
      const rows = [...(byDay.get(showDay)?.values() || [])];
      return { day: day, showDay: showDay, rows: rows, todayN: todayRows.length };
    }

    function dayAlert() {
      const tape = daySides();
      const n = tape.todayN;
      const title = n === 1 ? "1 trade today" : n + " trades today";
      const hint = n ? "" : (tape.showDay ? "Last on tape " + tape.showDay : "No deals on the last rebuild");
      const chips = tape.rows.map((r) => {
        const on = openId === r.transaction_id;
        return '<button type="button" class="day-chip' + (on ? " on" : "") + '" data-board-open="' + r.user_id + '" data-id="' + r.transaction_id + '">'
          + "<b>" + r.name + " vs " + r.other + "</b>"
          + "<span>" + (r.headline || r.date) + "</span></button>";
      }).join("");
      const open = tape.rows.find((r) => r.transaction_id === openId);
      return '<div class="day-alert">'
        + '<div class="day-alert-h">' + title + (hint ? "<span>" + hint + "</span>" : "") + "</div>"
        + (chips ? '<div class="day-scroller">' + chips + "</div>" : "")
        + (open ? boardTape(open) : "")
        + "</div>";
    }

    function renderTeamHome() {
      const pool = (data.trades || []).filter((t) => chipLived(t.date) && tradeDelta(t) != null)
        .slice().sort((a, b) => tradeDelta(b) - tradeDelta(a));
      const per = windowPer(data.trades);
      const total = windowTotal(data.trades);
      const best = pool[0];
      const worst = pool.length > 1 ? pool[pool.length - 1] : null;
      const by = {};
      for (const t of pool) {
        if ((t.others || []).length !== 1) continue;
        const name = t.others[0];
        const d = tradeDelta(t);
        if (!by[name]) by[name] = { name: name, n: 0, sum: 0 };
        by[name].n += 1;
        by[name].sum += d;
      }
      const partners = Object.keys(by).map((k) => ({ name: by[k].name, n: by[k].n, per: by[k].sum / by[k].n }))
        .sort((a, b) => b.per - a.per);
      const take = partners[0];
      const pay = partners.length > 1 ? partners[partners.length - 1] : null;
      const allN = (data.trades || []).filter((t) => tradeDelta(t) != null).length;
      return dayAlert()
        + teamMarks()
        + lensRow('<div class="caption"><span class="' + cls(per) + '">' + fmt(per) + "</span> / trade"
        + (total != null ? " · " + fmt(total) + " total" : "")
        + (allN ? " · " + livedHint(pool.length, allN) : "")
        + "</div>")
        + (best ? "<h2>Best deal</h2>" + tradeRow(best) : "")
        + (worst && (!best || worst.transaction_id !== best.transaction_id) ? "<h2>Worst deal</h2>" + tradeRow(worst) : "")
        + ((take || pay) ? "<h2>Partners</h2>" : "")
        + (take ? partnerLine(take) : "")
        + (pay && take && pay.name !== take.name ? partnerLine(pay) : "")
        + ((data.hit || data.miss) ? "<h2>Draft</h2>" : "")
        + draftLine(data.hit, "hit")
        + draftLine(data.miss, "miss");
    }

    function renderHome() {
      return me && data ? renderTeamHome() : renderLeagueHome();
    }

    function tradeParties(t, extra) {
      const s = sideOf(t);
      const mine = (me && me.name) || extra && extra.winner || s.name || "This seat";
      const other = extra && extra.winner && extra.loser
        ? (mine === extra.winner ? extra.loser : extra.winner)
        : ((t.others || []).join(" · ") || "Them");
      return { s: s, mine: mine, other: other, multi: (t.others || []).length > 1 };
    }

    function tradeBags(t, extra) {
      const p = tradeParties(t, extra);
      const gotTitle = p.mine + " received";
      const sentTitle = p.multi ? p.mine + " gave up" : p.other + " received";
      let bags = bagBlock(gotTitle, p.s.legs, p.s.today, p.s.unpriced)
        + bagBlock(sentTitle, p.s.sent, p.s.sent_today, p.s.sent_unpriced);
      if ((t.others || []).length > 1) {
        bags += (t.other_bags || []).map((b) => {
          const side = (b.windows && b.windows[lens]) || b.even || b.realized;
          return bagBlock(b.name + " received", side.legs, side.today, side.unpriced);
        }).join("");
      }
      const sparkSrc = t.even_year_ends || t.year_ends;
      return '<div class="bags">' + bags + "</div>"
        + spark((sparkSrc || []).map((row) => ({ as_of: row.as_of, ...row.points })));
    }

    function tradeRow(t, extra) {
      const p = tradeParties(t, extra);
      const open = openId === t.transaction_id;
      const incomplete = t.incomplete || p.s.incomplete;
      const gotShow = p.s.unpriced && !p.s.today ? "—" : fmt(p.s.today);
      const sentShow = p.s.sent_unpriced && !p.s.sent_today ? "—" : fmt(p.s.sent_today);
      const dlt = incomplete ? null : displayDelta(p.s.today, p.s.sent_today);
      const mineCls = incomplete || dlt == null || dlt === 0 ? "" : dlt > 0 ? "pos" : "neg";
      const otherCls = incomplete || dlt == null || dlt === 0 ? "" : dlt > 0 ? "neg" : "pos";
      const mid = dlt == null || incomplete ? "—"
        : dlt > 0 ? "← " + fmt(dlt)
        : dlt < 0 ? fmt(Math.abs(dlt)) + " →"
        : fmt(dlt);
      const midCls = dlt == null || incomplete || dlt === 0 ? "" : "pos";
      return '<button type="button" class="row' + (open ? " open" : "") + '" data-id="' + t.transaction_id + '">'
        + '<div class="row-top tape">'
        + '<div class="side"><span class="names ' + mineCls + '">' + p.mine + '</span> <span class="val">' + gotShow + "</span></div>"
        + '<div class="mid"><span class="margin ' + midCls + '">' + mid + "</span>"
        + '<div class="date">' + t.date + (incomplete ? ' <span class="badge">no DP row</span>' : "") + "</div></div>"
        + '<div class="side right"><span class="val">' + sentShow + '</span> <span class="names ' + otherCls + '">' + p.other + "</span></div>"
        + "</div>"
        + (open ? '<div class="detail">' + tradeBags(t, extra) + "</div>" : "")
        + "</button>";
    }

    function draftKey(p) {
      return p.asset_key || (p.season + ":" + p.round + ":" + (p.pick_no || p.player));
    }

    function acquiredHop(p) {
      const tape = picks && p.asset_key && picks[p.asset_key];
      if (!tape || !(tape.hops || []).length) return null;
      const mine = (me && me.name) || "";
      const incoming = tape.hops.filter((h) => h.to === mine);
      return incoming.length ? incoming[incoming.length - 1] : null;
    }

    function draftSpark(p) {
      const pts = [];
      if (p.as_of && p.pick_cost != null) pts.push({ as_of: p.as_of, value: p.pick_cost });
      for (const m of p.year_ends || []) {
        if (m.player != null) pts.push({ as_of: m.as_of, value: m.player });
      }
      if (pts.length < 2 && p.player_today != null) {
        pts.push({ as_of: (league && league.today) || p.as_of || "", value: p.player_today });
      }
      return spark(pts);
    }

    function pickOrigin(p) {
      const mine = (me && me.name) || "";
      if (p.own || (p.origin_team && p.origin_team === mine)) return "Own pick";
      if (p.origin_team) return p.origin_team + "'s pick";
      return acquiredHop(p) ? "Someone else's pick" : "Own pick";
    }

    function pickWindowEnd(p) {
      if (lens === "t0") return p.as_of;
      if (lens === "all") return (league && league.today) || "";
      const n = { y1: 1, y2: 2, y3: 3 }[lens];
      return n ? addYears(p.as_of, n) : (league && league.today) || "";
    }

    function pickGot(p) {
      const end = pickWindowEnd(p);
      const pts = (p.year_ends || []).filter((m) => {
        if (m.player == null) return false;
        if (lens === "t0") return m.as_of === p.as_of;
        return (!p.as_of || m.as_of >= p.as_of) && (!end || m.as_of <= end);
      });
      if (!pts.length) return lens === "all" ? p.player_today : null;
      if (lens === "t0") return pts[0].player;
      return pts.reduce((a, m) => a + m.player, 0) / pts.length;
    }

    function pickDelta(p) {
      if (p.startup) return pickGot(p);
      const got = pickGot(p);
      if (got == null || p.pick_cost == null) return null;
      return displayDelta(got, p.pick_cost);
    }

    function pickRow(p) {
      const key = draftKey(p);
      const open = openDraft === key;
      const hop = acquiredHop(p);
      const trade = hop && (data.trades || []).find((t) => t.transaction_id === hop.transaction_id);
      const origin = pickOrigin(p);
      const slot = (p.season || "") + " " + (p.startup ? "startup" : (Number(p.round) === 1 ? "1st" : Number(p.round) === 2 ? "2nd" : Number(p.round) === 3 ? "3rd" : p.round + "th"));
      const got = pickGot(p);
      const gotShow = got == null ? "—" : fmt(got);
      const sentShow = p.startup || p.pick_cost == null ? "—" : fmt(p.pick_cost);
      const dlt = pickDelta(p);
      const mineCls = dlt == null || dlt === 0 ? "" : dlt > 0 ? "pos" : "neg";
      const otherCls = dlt == null || dlt === 0 ? "" : dlt > 0 ? "neg" : "pos";
      const mid = dlt == null ? "—"
        : dlt > 0 ? "← " + fmt(dlt)
        : dlt < 0 ? fmt(Math.abs(dlt)) + " →"
        : fmt(dlt);
      const midCls = dlt == null || dlt === 0 ? "" : "pos";
      const clock = clockName();
      let detail = "";
      if (open) {
        const used = [{ label: p.player, value: got, kind: "player" }];
        const cost = [{ label: slot + (p.pick_no ? " · pick " + p.pick_no : ""), value: p.pick_cost, kind: "pick", asset_key: p.asset_key }];
        detail = '<div class="detail">'
          + (trade ? tradeBags(trade) : '<div class="date">' + origin + " · no trade to get it</div>")
          + '<div class="bags">'
          + bagBlock(p.player + " · " + clock, used, got, got == null ? 1 : 0)
          + bagBlock("Pick at draft", cost, p.pick_cost, p.pick_cost == null ? 1 : 0)
          + "</div>"
          + draftSpark(p)
          + (p.asset_key && picks && picks[p.asset_key] && (picks[p.asset_key].hops || []).length ? hopHtml(p.asset_key) : "")
          + "</div>";
      }
      const own = origin === "Own pick";
      return '<button type="button" class="row' + (open ? " open" : "") + (own ? " own-pick" : " away-pick") + '" data-draft="' + key + '">'
        + '<div class="row-top tape">'
        + '<div class="side"><div><span class="names ' + mineCls + '">' + p.player + '</span> <span class="val">' + gotShow + "</span></div>"
        + '<div class="date">' + (p.as_of || "") + "</div></div>"
        + '<div class="mid"><span class="margin ' + midCls + '">' + mid + "</span>"
        + '<div class="date origin ' + (own ? "own" : "away") + '">' + origin + "</div></div>"
        + '<div class="side right"><span class="val">' + sentShow + '</span> <span class="names ' + otherCls + '">' + slot + "</span></div>"
        + "</div>"
        + detail + "</button>";
    }

    function renderTrades() {
      const years = [...new Set(data.trades.map((t) => t.season))].sort().reverse();
      let list = data.trades;
      if (year !== "all") list = list.filter((t) => t.season === year);
      const hint = year === "all" ? "Filter by year" : "Filter by year · " + year;
      const yearBtn = '<button type="button" class="filter-btn' + (year !== "all" || yearFilterOpen ? " on" : "") + '" data-yfilter="1" aria-label="Filter by year" aria-expanded="' + (yearFilterOpen ? "true" : "false") + '">'
        + '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M4 5h16l-6.2 7.2V19l-3.6 1.8v-8.6L4 5z"/></svg>'
        + (year !== "all" ? '<span class="dot"></span>' : "")
        + "</button>"
        + '<div class="caption">' + hint + "</div>";
      return '<div class="filter-wrap">'
        + lensRow(yearBtn)
        + (yearFilterOpen
          ? '<div class="filter-panel" id="yearFilters">'
            + '<button type="button" class="' + (year === "all" ? "on" : "") + '" data-year="all">All</button>'
            + years.map((y) => '<button type="button" class="' + (year === y ? "on" : "") + '" data-year="' + y + '">' + y + "</button>").join("")
            + "</div>"
          : "")
        + "</div>"
        + list.map(tradeRow).join("");
    }

    function clockName() {
      return ((WINDOWS.find((w) => w[0] === lens) || [])[1] || "");
    }

    function livedHint(shown, all, noun) {
      if (!all) return "";
      const one = noun || "deal";
      const many = one + "s";
      if (lens === "t0" || lens === "all" || shown === all) return shown + " " + (shown === 1 ? one : many);
      const span = { y1: "1 year", y2: "2 years", y3: "3 years" }[lens] || clockName();
      return shown + " of " + all + " lived " + span;
    }

    function scoreOpt(row) {
      return '<button type="button" class="score-opt' + (lens === row[0] ? " on" : "") + '" data-lens="' + row[0] + '">'
        + "<b>" + row[1] + "</b><span>" + row[2] + "</span></button>";
    }

    function scoreMenu() {
      const extra = scoreMoreOpen || lens === "y1" || lens === "y2";
      return '<div class="filter-panel" id="scoreAs">'
        + SCORE_MAIN.map(scoreOpt).join("")
        + '<button type="button" class="score-more" data-score-more="1">' + (extra ? "Less" : "More horizons") + "</button>"
        + (extra ? SCORE_MORE.map(scoreOpt).join("") : "")
        + "</div>";
    }

    function lensRow(left) {
      const name = clockName();
      const on = lens !== "all" || lensOpen;
      return '<div class="filter-wrap">'
        + '<div class="lens-row">'
        + (left ? '<div class="lens-row-left">' + left + "</div>" : "")
        + '<button type="button" class="score-btn' + (on ? " on" : "") + '" data-score="1" aria-label="Score as ' + name + '" aria-expanded="' + (lensOpen ? "true" : "false") + '">'
        + '<span class="score-k">Score as</span> ' + name + ' <span class="chev">▾</span>'
        + (lens !== "all" ? '<span class="dot"></span>' : "")
        + "</button></div>"
        + (lensOpen ? scoreMenu() : "")
        + "</div>";
    }

    function renderDrafts() {
      const raw = []
        .concat((data.drafts && data.drafts.rookie) || [], draftStartup ? (data.drafts && data.drafts.startup) || [] : [])
        .filter((p) => p.startup ? draftStartup : !!draftRounds[p.round]);
      let list = raw.filter((p) => chipLived(p.as_of));
      list = list.slice().sort((a, b) => {
        const date = Number(a.season) - Number(b.season) || (a.pick_no || 0) - (b.pick_no || 0);
        if (draftSort === "old") return date;
        if (draftSort === "gain" || draftSort === "loss") {
          const da = pickDelta(a), db = pickDelta(b);
          if (da == null && db == null) return -date;
          if (da == null) return 1;
          if (db == null) return -1;
          return draftSort === "gain" ? db - da : da - db;
        }
        return -date;
      });
      const graded = list.map(pickDelta).filter((d) => d != null);
      const avg = graded.length ? graded.reduce((a, b) => a + b, 0) / graded.length : null;
      const filtered = draftSort !== "new" || draftStartup || !draftRounds[1] || !draftRounds[2] || !draftRounds[3] || !draftRounds[4];
      const rounds = [["1", "1st round"], ["2", "2nd round"], ["3", "3rd round"], ["4", "4th round"]];
      const sorts = [
        ["new", "Newest"],
        ["old", "Oldest"],
        ["gain", "Value high to low"],
        ["loss", "Value low to high"],
      ];
      const draftBtn = '<button type="button" class="filter-btn' + (filtered || draftFilterOpen ? " on" : "") + '" data-dfilter="1" aria-label="Filter drafts" aria-expanded="' + (draftFilterOpen ? "true" : "false") + '">'
        + '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M4 5h16l-6.2 7.2V19l-3.6 1.8v-8.6L4 5z"/></svg>'
        + (filtered ? '<span class="dot"></span>' : "")
        + "</button>"
        + '<div class="caption"><span class="' + cls(avg) + '">' + fmt(avg) + "</span> / pick"
        + " · " + graded.length + " graded · " + livedHint(list.length, raw.length, "pick") + "</div>";
      return lensRow(draftBtn)
        + (draftFilterOpen
          ? '<div class="filter-panel" id="draftFilters">'
            + '<div class="filter-h">Date</div>'
            + sorts.slice(0, 2).map((s) => '<label data-dsort="' + s[0] + '"><input type="radio" name="dsort"' + (draftSort === s[0] ? " checked" : "") + "> " + s[1] + "</label>").join("")
            + '<div class="filter-h">Value</div>'
            + sorts.slice(2).map((s) => '<label data-dsort="' + s[0] + '"><input type="radio" name="dsort"' + (draftSort === s[0] ? " checked" : "") + "> " + s[1] + "</label>").join("")
            + '<hr class="rule">'
            + rounds.map((r) => '<label data-dround="' + r[0] + '"><input type="checkbox"' + (draftRounds[r[0]] ? " checked" : "") + "> " + r[1] + "</label>").join("")
            + '<hr class="rule">'
            + '<label data-dstartup="1"><input type="checkbox"' + (draftStartup ? " checked" : "") + "> Include startup picks</label>"
            + "</div>"
          : "")
        + list.map(pickRow).join("");
    }

    function renderLeague() {
      const you = me && me.name;
      const traders = (league.traders || []).map((t) =>
        '<div class="row-top" style="padding:8px 0"><div class="names' + (t.name === you ? " you" : "") + '">'
        + t.name + (t.name === you ? " · you" : "")
        + (t.style && t.style.label ? " · " + t.style.label : "") + "</div>"
        + '<div class="margin ' + cls(t.even_per_trade ?? t.realized_per_trade) + '">' + fmt(t.even_per_trade ?? t.realized_per_trade) + " / trade</div></div>"
        + '<div class="date">' + t.two_way + " complete"
        + (t.incomplete ? " · " + t.incomplete + " incomplete" : "") + "</div>"
      ).join("");
      const d = (league.drafters_rookie || []).map((t) =>
        '<div class="row-top" style="padding:8px 0"><div class="names' + (t.name === you ? " you" : "") + '">'
        + t.name + (t.name === you ? " · you" : "") + "</div>"
        + '<div class="margin ' + cls(t.per_pick) + '">' + fmt(t.per_pick) + " / pick</div></div>"
        + '<div class="date">' + t.used + " used · " + t.graded + " graded"
        + (t.best ? " · hit " + t.best.player : "") + "</div>"
      ).join("");
      return renderTradeBoards()
        + "<h2>Traders · per complete two-way</h2>" + traders
        + "<h2>Drafters · rookie surplus per pick</h2>" + d;
    }

    function monthsAgo(ymd, months) {
      const parts = (ymd || "").split("-").map(Number);
      if (parts.length < 3) return ymd;
      let y = parts[0], m = parts[1] - months, d = parts[2];
      while (m <= 0) { m += 12; y -= 1; }
      const dim = new Date(y, m, 0).getDate();
      return y + "-" + String(m).padStart(2, "0") + "-" + String(Math.min(d, dim)).padStart(2, "0");
    }

    function rankSides(clock, window) {
      const boards = league && league.trade_boards;
      if (!boards) return { best: [], worst: [] };
      const asOf = league.today || "";
      const months = window === "3m" ? 3 : window === "6m" ? 6 : window === "1y" ? 12 : window === "3y" ? 36 : 0;
      const cut = months ? monthsAgo(asOf, months) : null;
      let pool = boards.sides || [];
      if (cut) pool = pool.filter((r) => r.date >= cut);
      const key = clock === "aged" ? "aged" : "today_delta";
      if (clock === "aged") pool = pool.filter((r) => r.aged != null);
      const best = pool.slice().sort((a, b) => (b[key] ?? -1e15) - (a[key] ?? -1e15)).slice(0, 10);
      const worst = pool.slice().sort((a, b) => (a[key] ?? 1e15) - (b[key] ?? 1e15)).slice(0, 10);
      return { best, worst };
    }

    function renderTradeBoards() {
      const boards = league && league.trade_boards;
      if (!boards) return "";
      const pack = rankSides(boardClock, boardWindow);
      const you = me && me.name;
      const scoreOf = (r) => boardClock === "aged" ? r.aged : r.today_delta;
      const list = (title, rows) => "<h2>" + title + "</h2>" + (rows || []).map((r) =>
        '<button type="button" class="row" data-open-me="' + r.user_id + '" data-id="' + r.transaction_id + '">'
        + '<div class="row-top"><div><div class="names' + (r.name === you ? " you" : "") + '">'
        + r.name + (r.name === you ? " · you" : "") + " vs " + r.other + "</div>"
        + '<div class="date">' + r.date + (r.headline ? " · " + r.headline : "") + "</div></div>"
        + '<div class="margin ' + cls(scoreOf(r)) + '">' + fmt(scoreOf(r)) + "</div></div></button>"
      ).join("");
      const windows = [["3m","3 months"],["6m","6 months"],["1y","1 year"],["3y","3 years"],["all","All time"]];
      return '<div class="toggle">'
        + '<button type="button" class="chip' + (boardClock === "today" ? " on" : "") + '" data-board="today">As of today</button>'
        + '<button type="button" class="chip' + (boardClock === "aged" ? " on" : "") + '" data-board="aged">Aged after accept</button>'
        + "</div>"
        + '<div class="toggle">'
        + windows.map((w) => '<button type="button" class="chip' + (boardWindow === w[0] ? " on" : "") + '" data-window="' + w[0] + '">' + w[1] + "</button>").join("")
        + "</div>"
        + list("Best 10", pack.best)
        + list("Worst 10", pack.worst);
    }

    function renderPartners() {
      const list = data.partners || [];
      const perOf = (p) => {
        const deals = (data.trades || []).filter((t) => t.others.length === 1 && t.others[0] === p.name && !t.incomplete);
        return windowPer(deals);
      };
      const rows = list.slice().sort((a, b) => (perOf(b) ?? -1e9) - (perOf(a) ?? -1e9)).map((p) => {
        const per = perOf(p);
        const g = per == null ? "even" : per >= 100 ? "you_extract" : per <= -100 ? "they_extract" : "even";
        return '<button type="button" class="row' + (partnerName === p.name ? " open" : "") + '" data-partner="' + p.name + '">'
          + '<div class="row-top"><div><div class="names">' + p.name + "</div>"
          + '<div class="date">' + p.complete + " complete · " + p.trades + " deals · "
          + '<span class="' + gradeCls(g) + '">' + gradeLabel(g) + "</span></div></div>"
          + '<div class="margin ' + cls(per) + '">' + fmt(per) + "</div></div></button>";
      }).join("");
      let detail = "";
      if (partnerName) {
        const p = list.find((x) => x.name === partnerName);
        const deals = data.trades.filter((t) => t.others.length === 1 && t.others[0] === partnerName);
        detail = p ? "<h2>" + p.name + "</h2>" + deals.map(tradeRow).join("") : "";
      }
      return lensRow() + rows + detail;
    }

    function render() {
      const app = document.getElementById("app");
      const tabs = me ? ["home", "trades", "partners", "drafts"] : [];
      if (!me && view !== "home") view = "home";
      if (me && (view === "review" || view === "league")) view = "home";
      const nav = (tabs.length
        ? '<div class="nav">'
          + tabs.map((v) =>
            '<button type="button" class="tab' + (view === v ? " on" : "") + '" data-view="' + v + '">' + v + "</button>"
          ).join("")
          + "</div>"
        : "");
      const body = view === "home" ? renderHome()
        : view === "trades" ? renderTrades()
        : view === "partners" ? renderPartners()
        : view === "drafts" ? renderDrafts()
        : renderLeagueHome();
      app.innerHTML = nav + body;
      paintFeed();
      syncUrl();
    }

    document.getElementById("goHome").addEventListener("click", () => clearLeague());
    document.querySelector("h1.brand a").addEventListener("click", (e) => { e.preventDefault(); clearLeague(); });
    document.getElementById("who").addEventListener("change", (e) => {
      const id = e.target.value;
      if (!id) clearLeague();
      else selectMe(id);
    });
    function togglePack(id) {
      if (!id) return;
      if (openPacks.has(id)) openPacks.delete(id);
      else openPacks.add(id);
      render();
    }

    document.getElementById("feed").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-pack]");
      if (btn) togglePack(btn.dataset.pack);
    });
    document.getElementById("app").addEventListener("click", (e) => {
      const packBtn = e.target.closest("[data-pack]");
      if (packBtn) { togglePack(packBtn.dataset.pack); return; }
      const pickBtn = e.target.closest("[data-pick]");
      if (pickBtn) {
        openPick = openPick === pickBtn.dataset.pick ? null : pickBtn.dataset.pick;
        render();
        return;
      }
      const boardOpen = e.target.closest("[data-board-open]");
      if (boardOpen) {
        const uid = boardOpen.dataset.boardOpen;
        const tx = boardOpen.dataset.id;
        if (openId === tx) { openId = null; render(); return; }
        openId = tx;
        partnerName = null;
        seatData(uid).then(() => render());
        return;
      }
      const boardRow = e.target.closest("[data-open-me]");
      if (boardRow) {
        const uid = boardRow.dataset.openMe;
        const tx = boardRow.dataset.id;
        Promise.resolve(me && me.user_id === uid ? null : selectMe(uid, true)).then(() => {
          view = "trades";
          openId = tx;
          partnerName = null;
          render();
        });
        return;
      }
      const boardBtn = e.target.closest("[data-board]");
      if (boardBtn) { boardClock = boardBtn.dataset.board; view = "league"; openId = null; render(); return; }
      const windowBtn = e.target.closest("[data-window]");
      if (windowBtn) { boardWindow = windowBtn.dataset.window; view = "league"; openId = null; render(); return; }
      const viewBtn = e.target.closest("[data-view]");
      if (viewBtn) {
        view = viewBtn.dataset.view;
        openId = null;
        openDraft = null;
        if (view !== "drafts") draftFilterOpen = false;
        if (view !== "trades") yearFilterOpen = false;
        if (view !== "partners") partnerName = null;
        lensOpen = false;
        render();
        return;
      }
      const partnerBtn = e.target.closest("[data-partner]");
      if (partnerBtn) {
        partnerName = partnerBtn.dataset.partner;
        view = "partners";
        openId = null;
        render();
        return;
      }
      const scoreMore = e.target.closest("[data-score-more]");
      if (scoreMore) { scoreMoreOpen = !scoreMoreOpen; lensOpen = true; render(); return; }
      const lensBtn = e.target.closest("[data-lens]");
      if (lensBtn) { lens = lensBtn.dataset.lens; lensOpen = false; render(); return; }
      const scoreBtn = e.target.closest("[data-score]");
      if (scoreBtn) {
        lensOpen = !lensOpen;
        if (lensOpen) { yearFilterOpen = false; draftFilterOpen = false; }
        render();
        return;
      }
      const filterBtn = e.target.closest("[data-dfilter]");
      if (filterBtn) { draftFilterOpen = !draftFilterOpen; if (draftFilterOpen) lensOpen = false; render(); return; }
      const yfilterBtn = e.target.closest("[data-yfilter]");
      if (yfilterBtn) { yearFilterOpen = !yearFilterOpen; if (yearFilterOpen) lensOpen = false; render(); return; }
      const yearBtn = e.target.closest("[data-year]");
      if (yearBtn) { year = yearBtn.dataset.year; yearFilterOpen = false; render(); return; }
      if (e.target.closest("#draftFilters") || e.target.closest("#yearFilters") || e.target.closest("#scoreAs")) return;
      let closedFilter = false;
      if (draftFilterOpen && !e.target.closest("#draftFilters")) {
        draftFilterOpen = false;
        closedFilter = true;
      }
      if (yearFilterOpen && !e.target.closest("#yearFilters")) {
        yearFilterOpen = false;
        closedFilter = true;
      }
      if (lensOpen && !e.target.closest("#scoreAs") && !e.target.closest("[data-score]")) {
        lensOpen = false;
        closedFilter = true;
      }
      const dt = e.target.closest("[data-dt]");
      if (dt) { draftTab = dt.dataset.dt; render(); return; }
      const draftBtn = e.target.closest("[data-draft]");
      if (draftBtn) {
        openDraft = openDraft === draftBtn.dataset.draft ? null : draftBtn.dataset.draft;
        openPick = null;
        render();
        return;
      }
      const row = e.target.closest(".row[data-id]");
      if (row) { openId = openId === row.dataset.id ? null : row.dataset.id; render(); }
      else if (closedFilter) render();
    });
    document.addEventListener("change", (e) => {
      const sortLab = e.target.closest("[data-dsort]");
      if (sortLab) {
        draftSort = sortLab.dataset.dsort;
        draftFilterOpen = true;
        render();
        return;
      }
      const roundLab = e.target.closest("[data-dround]");
      if (roundLab) {
        draftRounds[roundLab.dataset.dround] = e.target.checked;
        draftFilterOpen = true;
        render();
        return;
      }
      if (e.target.closest("[data-dstartup]")) {
        draftStartup = e.target.checked;
        draftFilterOpen = true;
        render();
      }
    });
    loadMembers().catch((err) => {
      document.getElementById("app").hidden = false;
      document.getElementById("lead").textContent = "Could not load league data. Hard-refresh, or serve this folder over http.";
      console.error(err);
    });
  </script>
</body>
</html>`;

fs.writeFileSync(`${ROOT}index.html`, html);
console.log(JSON.stringify({ page: `${ROOT}index.html` }, null, 2));
