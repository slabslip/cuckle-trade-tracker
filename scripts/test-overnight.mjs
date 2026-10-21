#!/usr/bin/env node
import fs from "node:fs";

const ROOT = new URL("../", import.meta.url).pathname;
const page = fs.readFileSync(`${ROOT}index.html`, "utf8");
const gen = fs.readFileSync(`${ROOT}generate-page.mjs`, "utf8");
const build = fs.readFileSync(`${ROOT}build.mjs`, "utf8");
const script = fs.readFileSync(`${ROOT}build-overnight.mjs`, "utf8");
const letter = JSON.parse(fs.readFileSync(`${ROOT}data/leagues/1315431339301806080/ui/overnight.json`, "utf8"));
const plan = fs.readFileSync(`${ROOT}docs/plans/dynasty_daily_habit.md`, "utf8");
const product = fs.readFileSync(`${ROOT}docs/PRODUCT.md`, "utf8");

function need(cond, msg) {
  if (!cond) throw new Error(msg);
}

function fnSrc(src, name) {
  const re = new RegExp("function " + name + "\\([\\s\\S]*?\\n    function ");
  const m = src.match(re);
  return m ? m[0] : "";
}

need(build.includes("build-overnight.mjs"), "build.mjs must write the overnight letter");
need(script.includes("trade_tape.json") && script.includes("injury_now.json"),
  "overnight builder must read tape + IR");
need(script.includes("function ledeFor(trades, wire, out, ir)")
  || script.includes("function ledeFor(trades, wire, out"),
  "overnight lede must see Out / IR for the injury morning paper");
need(script.includes('p.slot === "starter"') && script.includes(" starters"),
  "injury lede must prefer Sunday starters and +N starters");
need(script.includes("wireLine") && script.includes("claimed"),
  "wire lines must name who claimed whom");
need(script.includes("irScore") && script.includes("readUi") && script.includes("calculator.json")
  && script.includes("cuffs.json") && script.includes("attachCuff")
  && script.includes("cuff_owned === false")
  && script.includes("beneficiariesFor") && script.includes("proposeTrade")
  && script.includes("TRADE_LO") && script.includes("DESK_START"),
  "IR board must join cuffs, name NFL beneficiaries, and only invent leftover trades");
need(!script.includes("Text this") && !page.includes("That's not how I remember"),
  "overnight must not ship the lame Text this poke");
need(page.includes("function overnightEnabled(") && page.includes("isRedraftLeague()")
  && page.includes("isGmLeague()"),
  "overnight must stay off GM / redraft Home");
need(fnSrc(page, "overnightSlipHtml").includes("overnightEnabled()")
  && fnSrc(page, "ensureOvernight").includes("overnightEnabled()")
  && fnSrc(page, "homeWireBarHtml").includes("overnightEnabled()"),
  "dynasty Home paints the wire bar; redraft Home must not");
need(page.includes("function overnightSlipHtml(") && page.includes('q.set("r", "overnight")')
  && page.includes("function homeWireBarHtml(") && page.includes('data-home-wire="'),
  "Home wire bar + shareable ?r=overnight letter must both ship");
need(page.includes("data-overnight-share") && page.includes("overnightShareText("),
  "share chip must send league summary text + link");
need(page.includes("overnight-slip-lede") && page.includes("letter.lede")
  && page.includes("overnightPrettyDate(")
  && page.includes("function overnightCuffNote(")
  && page.includes("cuff unowned"),
  "overnight ticket must paint the league lede and a short last-deal date");
need(page.includes("data-overnight-more") && page.includes("overnight-slip-band")
  && page.includes('overnightBandHtml("out"'),
  "Out / IR ticket lists keep titled bands with expandable Show all");
need(fnSrc(page, "overnightSlipHtml").includes("schematicSettingsHtml") === false,
  "overnight ticket must not paint the QB/RB/WR/TE settings grid");
need(fnSrc(page, "leagueInProgress").includes("homeWireBarHtml()")
  && !fnSrc(page, "leagueInProgress").includes("overnightSlipHtml()"),
  "Home digest mounts the icon wire bar, not the full overnight letter");
need(fnSrc(page, "homeWireBarHtml").includes("homeWirePanelHtml")
  && page.includes('data-home-wire="')
  && page.includes('id: "waivers"')
  && page.includes('id: "watch"')
  && page.includes("monitor · set lineup"),
  "wire bar icons cover waivers, outs, watch decisions, deals, news");
need(fnSrc(gen, "leagueInProgress").includes("homeWireBarHtml()")
  && !fnSrc(gen, "leagueInProgress").includes("overnightSlipHtml()")
  && fnSrc(gen, "overnightSlipHtml").includes("schematicSettingsHtml") === false,
  "generate-page.mjs Home wire bar must stay in sync");
need(fnSrc(page, "overnightShareText").includes('catLines("Out"')
  && fnSrc(page, "overnightShareText").includes("const open = true"),
  "share must send the full Out and IR lists");
need(page.includes('q.kind === "overnight"') && page.includes('view === "overnight"'),
  "unsigned share link must open the overnight ticket");
need(gen.includes("function overnightSlipHtml(") && gen.includes('q.set("r", "overnight")')
  && gen.includes("overnight-slip-lede") && gen.includes("function overnightEnabled(")
  && gen.includes("function homeWireBarHtml("),
  "generate-page.mjs must stay in sync (do not execute it)");
need(fnSrc(page, "overnightSlipHtml").includes("Text this") === false
  && fnSrc(page, "overnightShareText").includes("Text this") === false
  && fnSrc(page, "homeWireBarHtml").includes("Text this") === false,
  "Home overnight functions must not say Text this");
need(letter.v === 1 && letter.dateline && letter.lede && Array.isArray(letter.out) && Array.isArray(letter.ir),
  "Cuckle overnight.json must exist with a dateline, lede, and Out / IR lists");
need(letter.quiet === true || Array.isArray(letter.trades), "letter must know if the night was quiet");
need(letter.ir.length && letter.ir.every((p) => p.name && p.status === "IR")
  && letter.out.some((p) => p.status === "OUT"),
  "IR list must name injured players; Out list must be its own category");
need(letter.out.filter((p) => p.slot === "starter").length >= 1
  && letter.out.slice(0, 2).every((p) => p.slot === "starter"),
  "collapsed Out preview must lead with Sunday starters");
need(fnSrc(page, "overnightPlayerLine").includes("overnightCuffNote")
  && fnSrc(page, "overnightSeatRowHtml").includes("overnightCuffNote")
  && fnSrc(page, "overnightCuffNote") === fnSrc(gen, "overnightCuffNote"),
  "card and share must name the cuff owner or unowned");
need(page.includes("data-overnight-player") && page.includes("function overnightBenefHtml(")
  && page.includes("No depth listed") && page.includes("overnightOpenPlayer")
  && fnSrc(page, "overnightBenefHtml") === fnSrc(gen, "overnightBenefHtml")
  && fnSrc(page, "overnightSeatRowHtml").includes("overnightBenefHtml"),
  "Out / IR names must open baked beneficiaries without a live fetch");
need(letter.out.every((p) => Array.isArray(p.beneficiaries))
  && letter.ir.every((p) => Array.isArray(p.beneficiaries)),
  "letter must bake who benefits for every Out / IR name");
need(letter.out.every((p) => !p.trade || (p.slot === "starter" && p.trade.line)),
  "trade lines stay off unless a Sunday starter has an obvious leftover band");
need(letter.out.every((p) => p.beneficiaries.every((b) => b.value == null))
  && letter.out.every((p) => !p.trade || p.trade.line),
  "beneficiary sheet must not print book values");
need(letter.out.every((p) => p.status === "OUT") && letter.ir.every((p) => p.status === "IR"),
  "Out and IR lists must not mix");
need(letter.ir.every((p) => p.value == null) && letter.out.every((p) => p.value == null),
  "letter must not print bag values on the board");
need(letter.out.length + letter.ir.length + (letter.other || []).length === letter.board_n,
  "expand must have every board row, not a 12-name cap");
need(plan.includes("league summary") && plan.includes("?r=overnight")
  && plan.includes("cuff unowned") && plan.includes("Unowned is a waiver"),
  "plan must lock the shareable league letter");
need(product.includes("?r=overnight"), "PRODUCT.md must point at the shareable overnight letter");

console.log("overnight ok", {
  as_of: letter.as_of,
  lede: letter.lede,
  quiet: letter.quiet,
  ir: letter.ir_n,
  top: letter.ir.slice(0, 4).map((p) => p.name + " " + p.status),
  latest: letter.latest && letter.latest.date,
});
