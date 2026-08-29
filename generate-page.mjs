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
      font-size: 1.4rem; font-weight: 650; margin: 0 0 6px; letter-spacing: -0.02em;
    }
    h1.brand a { color: inherit; text-decoration: none; }
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
      display: block; width: 100%;
      appearance: none; font: inherit; color: var(--text);
      background: var(--card) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%239a9aa3' d='M1 1l5 5 5-5'/%3E%3C/svg%3E") no-repeat right 14px center;
      border: 1px solid var(--line); border-radius: 10px;
      min-height: 44px; padding: 10px 36px 10px 12px; margin: 0 0 16px;
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
    .row-top.tape { display: grid; grid-template-columns: 1fr auto 1fr; gap: 8px; width: 100%; align-items: baseline; }
    .row-top.tape .side.right { text-align: right; }
    .row-top.tape .mid { text-align: center; font-variant-numeric: tabular-nums; }
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
  </h1>
  <p id="lead"></p>
  <select class="who" id="who" aria-label="Team">
    <option value="">Team</option>
  </select>
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
    const DATA_V = "20260828v";
    const openPacks = new Set();
    const WINDOWS = [
      ["t0", "Day of trade"],
      ["y1", "1 year"],
      ["y2", "2 years"],
      ["y3", "3 years"],
      ["all", "All time"],
    ];
    let view = "home";
    let draftTab = "rookie";
    let year = "all";
    let openId = null;
    let openPick = null;
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
      return pack("best", "Best aged", rankAge(1).map(boardTape).join(""))
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
      const clock = ((WINDOWS.find((w) => w[0] === lens) || [])[1] || "");
      return '<div class="hero"><b class="' + cls(per) + '">' + fmt(per) + "</b>"
        + '<div class="caption">per trade · ' + clock
        + (total != null ? " · " + fmt(total) + " total" : "")
        + (pool.length ? " · " + pool.length + " deals" : "")
        + "</div></div>"
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

    function tradeRow(t, extra) {
      const s = sideOf(t);
      const open = openId === t.transaction_id;
      const incomplete = t.incomplete || s.incomplete;
      const gotShow = s.unpriced && !s.today ? "—" : fmt(s.today);
      const sentShow = s.sent_unpriced && !s.sent_today ? "—" : fmt(s.sent_today);
      const mine = (me && me.name) || extra && extra.winner || s.name || "This seat";
      const other = extra && extra.winner && extra.loser
        ? (mine === extra.winner ? extra.loser : extra.winner)
        : ((t.others || []).join(" · ") || "Them");
      const multi = (t.others || []).length > 1;
      const dlt = incomplete ? null : displayDelta(s.today, s.sent_today);
      const mineCls = incomplete || dlt == null || dlt === 0 ? "" : dlt > 0 ? "pos" : "neg";
      const otherCls = incomplete || dlt == null || dlt === 0 ? "" : dlt > 0 ? "neg" : "pos";
      let detail = "";
      if (open) {
        const gotTitle = mine + " received";
        const sentTitle = multi ? mine + " gave up" : other + " received";
        let bags = bagBlock(gotTitle, s.legs, s.today, s.unpriced)
          + bagBlock(sentTitle, s.sent, s.sent_today, s.sent_unpriced);
        if ((t.others || []).length > 1) {
          bags += (t.other_bags || []).map((b) => {
            const side = (b.windows && b.windows[lens]) || b.even || b.realized;
            return bagBlock(b.name + " received", side.legs, side.today, side.unpriced);
          }).join("");
        }
        const sparkSrc = t.even_year_ends || t.year_ends;
        const line = spark((sparkSrc || []).map((p) => ({ as_of: p.as_of, ...p.points })));
        detail = '<div class="detail"><div class="bags">' + bags + "</div>" + line + "</div>";
      }
      const mid = dlt == null || incomplete ? "—"
        : dlt > 0 ? "← " + fmt(dlt)
        : dlt < 0 ? fmt(Math.abs(dlt)) + " →"
        : fmt(dlt);
      const midCls = dlt == null || incomplete || dlt === 0 ? "" : "pos";
      return '<button type="button" class="row' + (open ? " open" : "") + '" data-id="' + t.transaction_id + '">'
        + '<div class="row-top tape">'
        + '<div class="side"><span class="names ' + mineCls + '">' + mine + '</span> <span class="val">' + gotShow + "</span></div>"
        + '<div class="mid"><span class="margin ' + midCls + '">' + mid + "</span>"
        + '<div class="date">' + t.date + (incomplete ? ' <span class="badge">no DP row</span>' : "") + "</div></div>"
        + '<div class="side right"><span class="val">' + sentShow + '</span> <span class="names ' + otherCls + '">' + other + "</span></div>"
        + "</div>"
        + detail + "</button>";
    }

    function renderReview() {
      const list = (league && league.review_trades) || [];
      const rows = list.map((rt) => {
        const mine = (data.trades || []).find((t) => t.transaction_id === rt.transaction_id);
        const extra = { winner: rt.winner, loser: rt.loser, steep: rt.steep_delta, y3: rt.y3_delta, asYou: !!mine };
        return tradeRow(mine || rt, extra);
      }).join("");
      return rows;
    }

    function pickRow(p) {
      const n = draftTab === "startup" ? p.player_today : p.surplus;
      const meta = p.season + " R" + p.round + (p.surplus == null && !p.startup ? " · no pick-cost grade" : "");
      const line = spark((p.year_ends || []).map((m) => ({ as_of: m.as_of, player: m.player || 0, pick: m.pick || 0 })));
      return '<div class="row"><div class="row-top"><div><div class="names">' + p.player + "</div>"
        + '<div class="date">' + meta + "</div></div>"
        + '<div class="margin ' + cls(n) + '">' + fmt(n) + "</div></div>" + line + "</div>";
    }

    function renderTrades() {
      const years = [...new Set(data.trades.map((t) => t.season))].sort().reverse();
      let list = data.trades;
      if (year !== "all") list = list.filter((t) => t.season === year);
      return '<div class="toggle">'
        + '<button type="button" class="chip' + (year === "all" ? " on" : "") + '" data-year="all">All</button>'
        + years.map((y) => '<button type="button" class="chip' + (year === y ? " on" : "") + '" data-year="' + y + '">' + y + "</button>").join("")
        + "</div>"
        + list.map(tradeRow).join("");
    }

    function renderDrafts() {
      const list = data.drafts[draftTab] || [];
      return '<div class="toggle">'
        + '<button type="button" class="chip' + (draftTab === "rookie" ? " on" : "") + '" data-dt="rookie">Rookie 2020–26</button>'
        + '<button type="button" class="chip' + (draftTab === "startup" ? " on" : "") + '" data-dt="startup">Startup 2019</button>'
        + "</div>"
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
      return rows + detail;
    }

    function render() {
      const app = document.getElementById("app");
      const tabs = me ? ["home","review","trades","partners","drafts","league"] : [];
      if (!me && view !== "home") view = "home";
      const nav = (tabs.length
        ? '<div class="nav">'
          + tabs.map((v) =>
            '<button type="button" class="tab' + (view === v ? " on" : "") + '" data-view="' + v + '">' + v + "</button>"
          ).join("")
          + "</div>"
        : "")
        + '<div class="toggle">'
        + WINDOWS.map((w) =>
          '<button type="button" class="chip' + (lens === w[0] ? " on" : "") + '" data-lens="' + w[0] + '">' + w[1] + "</button>"
        ).join("")
        + "</div>";
      const body = view === "home" ? renderHome() : view === "review" ? renderReview()
        : view === "trades" ? renderTrades()
        : view === "partners" ? renderPartners() : view === "drafts" ? renderDrafts() : renderLeague();
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
      if (viewBtn) { view = viewBtn.dataset.view; openId = null; if (view !== "partners") partnerName = null; render(); return; }
      const partnerBtn = e.target.closest("[data-partner]");
      if (partnerBtn) {
        partnerName = partnerBtn.dataset.partner;
        view = "partners";
        openId = null;
        render();
        return;
      }
      const lensBtn = e.target.closest("[data-lens]");
      if (lensBtn) { lens = lensBtn.dataset.lens; render(); return; }
      const dt = e.target.closest("[data-dt]");
      if (dt) { draftTab = dt.dataset.dt; render(); return; }
      const yr = e.target.closest("[data-year]");
      if (yr) { year = yr.dataset.year; render(); return; }
      const row = e.target.closest(".row[data-id]");
      if (row) { openId = openId === row.dataset.id ? null : row.dataset.id; render(); }
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
