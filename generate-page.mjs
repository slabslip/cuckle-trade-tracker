#!/usr/bin/env node
/** Per-person dashboard. Loads data/ui/*.json — serve over http. */
import fs from "node:fs";
import { ROOT } from "./lib.mjs";

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
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
    h1 { font-size: 1.4rem; font-weight: 650; margin: 0 0 6px; letter-spacing: -0.02em; }
    h2 { font-size: 1.05rem; font-weight: 650; margin: 26px 0 8px; }
    p { color: var(--muted); line-height: 1.45; margin: 0 0 14px; }
    .caption { font-size: 0.8125rem; color: var(--dim); margin: 6px 0 14px; }
    .tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    @media (min-width: 640px) { .tiles { grid-template-columns: repeat(5, 1fr); } }
    button.tile, button.row, button.chip, button.tab, .row {
      appearance: none; font: inherit; color: inherit; text-align: left;
      background: var(--card); border: 1px solid var(--line); border-radius: 10px;
      min-height: 44px; touch-action: manipulation;
    }
    button.tile, button.row, button.chip, button.tab { cursor: pointer; }
    button.tile { padding: 14px 12px; font-weight: 650; }
    button.tile.on { border-color: #4a4a58; background: #1c1c22; }
    button.tile:focus-visible, button.tab:focus-visible, button.chip:focus-visible, button.row:focus-visible {
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
  </style>
</head>
<body>
  <h1>CuckleChunckle</h1>
  <p id="lead">Who are you? Everything below is your received bags, your used picks, and how they aged.</p>
  <div class="tiles" id="who"></div>
  <div id="app" hidden></div>
  <script>
    const fmt = (n) => n == null || Number.isNaN(n) ? "—" : Math.round(n).toLocaleString();
    const cls = (n) => n == null ? "" : n >= 0 ? "pos" : "neg";
    let members = [];
    let me = null;
    let data = null;
    let league = null;
    let picks = null;
    let lens = "even";
    const DATA_V = "20260828e";
    let view = "home";
    let draftTab = "rookie";
    let year = "all";
    let openId = null;
    let openPick = null;
    let partnerName = null;
    let boardClock = "today";
    let boardWindow = "all";

    const params = new URLSearchParams(location.search);
    const startMe = params.get("me");
    const startView = params.get("view");
    const startT = params.get("t");
    const startLens = params.get("lens");
    if (startLens) lens = startLens;

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
          : l.flag === "priced_as_2028" ? fmt(l.value) + " · as 2028"
          : l.flag === "priced_as_mid" ? fmt(l.value) + " · Mid"
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
      document.getElementById("who").innerHTML = members.map((m) =>
        '<button type="button" class="tile" data-id="' + m.user_id + '">' + m.name + "</button>"
      ).join("");
      let hit = members.find((m) => m.name === startMe || m.user_id === startMe);
      if (!hit && (startView === "review" || startT)) {
        hit = members.find((m) => m.name === "TipsUp") || members[0];
      }
      if (hit) {
        await selectMe(hit.user_id, true);
        if (startView) view = startView;
        if (startT) {
          openId = startT;
          if (!startView) view = "review";
        }
        syncUrl();
        render();
      }
    }

    function syncUrl() {
      const q = new URLSearchParams();
      if (me) q.set("me", me.name);
      if (view && view !== "home") q.set("view", view);
      if (openId) q.set("t", openId);
      if (lens && lens !== "even") q.set("lens", lens);
      history.replaceState(null, "", "?" + q.toString());
    }

    async function selectMe(id, keep) {
      me = members.find((m) => m.user_id === id);
      data = await (await fetch("data/ui/me/" + id + ".json?" + DATA_V)).json();
      if (!league) league = await (await fetch("data/ui/league.json?" + DATA_V)).json();
      if (!picks) picks = await (await fetch("data/ui/picks.json?" + DATA_V)).json();
      document.querySelectorAll("#who .tile").forEach((b) => b.classList.toggle("on", b.dataset.id === id));
      document.getElementById("lead").textContent = me.name + " · 60% KTC + 40% even-DP · FAAB thrown out";
      document.getElementById("app").hidden = false;
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
      if (lens === "pick") return t.pick;
      if (lens === "y3") return t.y3 || t.even || t.realized;
      if (lens === "steep") return t.steep || t.realized;
      return t.even || t.realized;
    }

    function renderHome() {
      const h = data.hero || {};
      const per = lens === "pick" ? h.pick_per_trade
        : lens === "steep" ? h.realized_per_trade
        : (h.even_per_trade ?? h.realized_per_trade);
      const total = lens === "pick" ? h.pick_total
        : lens === "steep" ? h.realized_total
        : (h.even_total ?? h.realized_total);
      return '<div class="hero"><b class="' + cls(per) + '">' + fmt(per) + '</b>'
        + '<div class="caption">per complete trade · received vs what you sent'
        + (total != null ? " · total " + fmt(total) : "")
        + " · " + (h.two_way || 0) + " complete"
        + (h.incomplete ? " · " + h.incomplete + " incomplete (no DP row), off this number" : "")
        + "</div></div>"
        + styleLine()
        + (data.hit || data.miss ? '<p class="caption">' +
          (data.hit ? "Rookie hit: " + data.hit.player + " (" + data.hit.season + " R" + data.hit.round + ")" : "") +
          (data.hit && data.miss ? " · " : "") +
          (data.miss ? "Miss: " + data.miss.player : "") + "</p>" : "")
        + smashDigest()
        + partnerDigest()
        + "<h2>Latest trades</h2>" + data.recent_trades.map(tradeRow).join("")
        + "<h2>Latest rookie picks</h2>"
        + '<p class="caption">Green = player · Blue = pick cost · Number = player today minus what that pick cost on draft day</p>'
        + data.recent_rookies.map(pickRow).join("");
    }

    function styleLine() {
      const s = data.style;
      if (!s || !s.label) return "";
      const dir = s.sold_picks_for_players === s.sold_players_for_picks
        ? "mix of pick and player bags"
        : s.sold_picks_for_players > s.sold_players_for_picks
          ? "you sell picks for players (" + s.sold_picks_for_players + ")"
          : "you sell players for picks (" + s.sold_players_for_picks + ")";
      return '<p class="caption">' + s.label + " · " + dir + "</p>";
    }

    function smashDigest() {
      const b = league && league.trade_boards && league.trade_boards.today;
      if (!b || !b.best || !b.best[0]) return "";
      const chip = (label, row) => {
        if (!row) return "";
        return '<button type="button" class="chip" data-board="today">' + label + " · " + row.name
          + " · " + fmt(row.today_delta) + "</button>";
      };
      return '<h2>League trades</h2><div class="toggle">'
        + chip("Best smash", b.best[0])
        + chip("Worst", b.worst && b.worst[0])
        + "</div>";
    }

    function partnerDigest() {
      const h = data.partner_headlines || {};
      if (!h.best && !h.most) return "";
      const bit = (label, row, extra) => {
        if (!row) return "";
        return '<button type="button" class="chip" data-partner="' + row.name + '">' + label + " · " + row.name
          + (extra || "") + "</button>";
      };
      return '<h2>Trade partners</h2><div class="toggle">'
        + bit("Best", h.best, h.best && h.best.per != null ? " · " + fmt(h.best.per) + "/trade" : "")
        + bit("Worst", h.worst, h.worst && h.worst.per != null ? " · " + fmt(h.worst.per) + "/trade" : "")
        + bit("Most", h.most, h.most ? " · " + h.most.trades + " deals" : "")
        + "</div>";
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
      const dlt = s.today_delta;
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
            const side = lens === "pick" ? b.pick
              : lens === "y3" ? (b.y3 || b.even || b.realized)
              : lens === "steep" ? (b.steep || b.realized)
              : (b.even || b.realized);
            return bagBlock(b.name + " received", side.legs, side.today, side.unpriced);
          }).join("");
        }
        const signed = (n) => (n > 0 ? "+" : "") + fmt(n);
        const aged = (lens === "steep" || lens === "even" || lens === "realized") && s.t0_delta != null
          ? '<p class="caption">At accept: ' + signed(s.t0_delta)
            + " · since then: " + signed(s.today_delta - s.t0_delta) + "</p>"
          : "";
        const clockNote = lens === "pick"
          ? "This toggle is accept-day prices. Name in parentheses drafted the pick, not who got it in this trade."
          : lens === "y3"
          ? "Even-curve mean of year-ends in the 3 years after accept. Player years under 300 DP (raw) count as 0, then flatten. KTC mixes in only on dates we snapped."
          : lens === "steep"
          ? "Raw steep DynastyProcess today. Not the dashboard book."
          : "40% even-flatten DP + 60% KTC Superflex. Older year-ends are flatten-only. Name in parentheses drafted the pick.";
        const sparkSrc = lens === "pick" ? t.pick_year_ends
          : lens === "steep" ? (t.steep_year_ends || t.year_ends)
          : (t.even_year_ends || t.year_ends);
        const line = spark((sparkSrc || []).map((p) => ({ as_of: p.as_of, ...p.points })));
        const hint = line
          ? '<p class="caption">Each line = that side received bag at year-end · Number on the row = received minus sent'
            + (lens === "y3" ? " (first 3 years)" : lens === "steep" ? " (steep DP today)" : " (60% KTC + even-DP)") + "</p>"
          : "";
        const steepNote = extra && extra.steep != null && lens !== "steep"
          ? '<p class="caption">Steep DP (raw): ' + (extra.steep > 0 ? "+" : "") + fmt(extra.steep)
            + (extra.y3 != null ? " · First 3 years: " + (extra.y3 > 0 ? "+" : "") + fmt(extra.y3) : "")
            + (Math.sign(extra.steep || 0) !== Math.sign(s.today_delta || 0) && extra.steep && s.today_delta
              ? " · books disagree on who won"
              : "")
            + "</p>"
          : "";
        detail = '<div class="detail"><div class="bags">' + bags + "</div>"
          + aged + steepNote + '<p class="caption">' + clockNote + "</p>" + line + hint + "</div>";
      }
      return '<button type="button" class="row' + (open ? " open" : "") + '" data-id="' + t.transaction_id + '">'
        + '<div class="row-top"><div>'
        + '<div class="names"><span class="' + mineCls + '">' + mine + '</span> vs <span class="' + otherCls + '">' + other + "</span></div>"
        + '<div class="date">' + t.date
        + " · " + mine + " " + gotShow + " / " + other + " " + sentShow
        + (incomplete ? ' <span class="badge">no DP row</span>' : "")
        + "</div></div>"
        + '<div class="margin ' + cls(s.today_delta) + '">' + fmt(s.today_delta) + "</div></div>"
        + detail + "</button>";
    }

    function renderReview() {
      const list = (league && league.review_trades) || [];
      const rows = list.map((rt) => {
        const mine = (data.trades || []).find((t) => t.transaction_id === rt.transaction_id);
        const extra = { winner: rt.winner, loser: rt.loser, steep: rt.steep_delta, y3: rt.y3_delta, asYou: !!mine };
        return tradeRow(mine || rt, extra);
      }).join("");
      return '<p class="caption">10 deals across 2019–2026. Same bags as Trades. Number is KTC blend today (received − sent) for the named seat — you if you were in it, blend winner if you were not. Open a row. Flip to Became the player if the books fight.</p>'
        + rows;
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
      return '<p class="caption">Received vs sent. One-way and FAAB-only are out. Incomplete (no DP row) stay listed and stay off the needle.</p>'
        + '<div class="toggle">'
        + '<button type="button" class="chip' + (year === "all" ? " on" : "") + '" data-year="all">All</button>'
        + years.map((y) => '<button type="button" class="chip' + (year === y ? " on" : "") + '" data-year="' + y + '">' + y + "</button>").join("")
        + "</div>"
        + list.map(tradeRow).join("");
    }

    function renderDrafts() {
      const list = data.drafts[draftTab] || [];
      const used = data.drafts.rookie.length + data.drafts.startup.length;
      const graded = data.drafts.rookie.filter((p) => p.surplus != null).length;
      const hint = draftTab === "startup"
        ? "Green = player value · Number = player today (no 2019 pick prices)"
        : "Green = player · Blue = pick cost · Number = player today minus what that pick cost on draft day";
      return '<p class="caption">' + used + " picks used · " + graded + " rookie picks graded vs pick cost · "
        + data.drafts.startup.length + " startup (ranked by player today). " + hint + "</p>"
        + '<div class="toggle">'
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
      return '<p class="caption">Complete 2-team only. 60% KTC + 40% even-DP today. Aged = that minus flatten-at-accept (KTC only if we had a snap that day). Window = trade date.</p>'
        + '<div class="toggle">'
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
      const perOf = (p) => lens === "pick" ? p.pick_per_trade
        : lens === "steep" ? p.realized_per_trade
        : (p.even_per_trade ?? p.realized_per_trade);
      const rows = list.slice().sort((a, b) => (perOf(b) ?? -1e9) - (perOf(a) ?? -1e9)).map((p) => {
        const per = perOf(p);
        const g = lens === "pick" ? (per >= 100 ? "you_extract" : per <= -100 ? "they_extract" : "even") : p.grade;
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
        detail = p ? "<h2>" + p.name + "</h2>"
          + '<p class="caption">' + gradeLabel(lens === "pick"
            ? (p.pick_per_trade >= 100 ? "you_extract" : p.pick_per_trade <= -100 ? "they_extract" : "even")
            : p.grade)
          + " · " + fmt(lens === "pick" ? p.pick_per_trade : lens === "steep" ? p.realized_per_trade : (p.even_per_trade ?? p.realized_per_trade)) + " per complete trade"
          + " · total " + fmt(lens === "pick" ? p.pick_total : lens === "steep" ? p.realized_total : (p.even_total ?? p.realized_total))
          + ". 3-team deals are not in this pair grade.</p>"
          + deals.map(tradeRow).join("") : "";
      }
      return '<p class="caption">2-team complete trades only. You extract / even / they extract uses ±100 DP points per trade. Best and worst need 2+ complete deals.</p>'
        + rows + detail;
    }

    function render() {
      const app = document.getElementById("app");
      const nav = '<div class="nav">'
        + ["home","review","trades","partners","drafts","league"].map((v) =>
          '<button type="button" class="tab' + (view === v ? " on" : "") + '" data-view="' + v + '">' + v + "</button>"
        ).join("")
        + "</div>"
        + '<div class="toggle">'
        + '<button type="button" class="chip' + (lens === "even" || lens === "realized" ? " on" : "") + '" data-lens="even">KTC blend</button>'
        + '<button type="button" class="chip' + (lens === "pick" ? " on" : "") + '" data-lens="pick">Pick at trade day</button>'
        + '<button type="button" class="chip' + (lens === "y3" ? " on" : "") + '" data-lens="y3">First 3 years</button>'
        + '<button type="button" class="chip' + (lens === "steep" ? " on" : "") + '" data-lens="steep">Steep DP</button>'
        + "</div>"
        + (lens === "y3" ? '<p class="caption">First 3 years: flatten each year-end (player years under 300 raw DP → 0). KTC 60% mixes in only on snapped dates.</p>' : "")
        + (lens === "even" || lens === "realized" ? '<p class="caption">Dashboard book: 40% even-flatten DynastyProcess + 60% KTC Superflex on snapped dates. Steep DP is the old raw tape.</p>' : "")
        + (lens === "steep" ? '<p class="caption">Raw DynastyProcess value_2qb today. Hill 285 lives here. Not the score we use.</p>' : "");
      const body = view === "home" ? renderHome() : view === "review" ? renderReview()
        : view === "trades" ? renderTrades()
        : view === "partners" ? renderPartners() : view === "drafts" ? renderDrafts() : renderLeague();
      app.innerHTML = nav + body;
      syncUrl();
    }

    document.getElementById("who").addEventListener("click", (e) => {
      const b = e.target.closest("[data-id]");
      if (b) selectMe(b.dataset.id);
    });
    document.getElementById("app").addEventListener("click", (e) => {
      const pickBtn = e.target.closest("[data-pick]");
      if (pickBtn) {
        openPick = openPick === pickBtn.dataset.pick ? null : pickBtn.dataset.pick;
        render();
        return;
      }
      const boardRow = e.target.closest("[data-open-me]");
      if (boardRow) {
        const uid = boardRow.dataset.openMe;
        const tx = boardRow.dataset.id;
        Promise.resolve(me && me.user_id === uid ? null : selectMe(uid)).then(() => {
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
      if (lensBtn) { lens = lensBtn.dataset.lens === "realized" ? "even" : lensBtn.dataset.lens; render(); return; }
      const dt = e.target.closest("[data-dt]");
      if (dt) { draftTab = dt.dataset.dt; render(); return; }
      const yr = e.target.closest("[data-year]");
      if (yr) { year = yr.dataset.year; render(); return; }
      const row = e.target.closest(".row[data-id]");
      if (row) { openId = openId === row.dataset.id ? null : row.dataset.id; render(); }
    });
    loadMembers().catch((err) => {
      document.getElementById("lead").textContent = "Serve this folder over http (python3 -m http.server) so data/ui can load.";
      console.error(err);
    });
  </script>
</body>
</html>`;

fs.writeFileSync(`${ROOT}index.html`, html);
console.log(JSON.stringify({ page: `${ROOT}index.html` }, null, 2));
