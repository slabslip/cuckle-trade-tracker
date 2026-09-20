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
need(script.includes("wireLine") && script.includes("claimed"),
  "wire lines must name who claimed whom");
need(script.includes("irScore") && script.includes("readUi") && script.includes("calculator.json")
  && script.includes("cuffs.json") && script.includes("attachCuff")
  && script.includes("cuff_owned === false"),
  "IR board must join cuffs and rank Sunday starters ahead of taxi soup");
need(!script.includes("Text this") && !page.includes("That's not how I remember"),
  "overnight must not ship the lame Text this poke");
need(page.includes("function overnightEnabled(") && page.includes("isRedraftLeague()")
  && page.includes("isGmLeague()"),
  "overnight must stay off GM / redraft Home");
need(fnSrc(page, "overnightSlipHtml").includes("overnightEnabled()")
  && fnSrc(page, "ensureOvernight").includes("overnightEnabled()"),
  "dynasty Home paints the letter; redraft Home must not");
need(page.includes("function overnightSlipHtml(") && page.includes('q.set("r", "overnight")'),
  "Home must paint the letter and share ?r=overnight");
need(page.includes("data-overnight-share") && page.includes("overnightShareText("),
  "share chip must send league summary text + link");
need(page.includes("overnight-slip-lede") && page.includes("letter.lede")
  && page.includes("overnightPrettyDate(")
  && page.includes("function overnightCuffNote(")
  && page.includes("cuff unowned"),
  "card must paint the league lede and a short last-deal date");
need(page.includes("data-overnight-more") && page.includes("overnight-slip-band")
  && page.includes('overnightBandHtml("out"'),
  "Out / IR must be titled lists with an expandable Show all");
need(fnSrc(page, "overnightSlipHtml").includes("schematicSettingsHtml") === false,
  "Home summary must not paint the QB/RB/WR/TE settings grid");
need(fnSrc(page, "overnightSlipHtml").includes("if (overnightOpen)")
  && fnSrc(page, "overnightSlipHtml").includes("Show all")
  && fnSrc(page, "overnightSlipHtml").includes('overnightBandHtml("out"'),
  "collapsed Home letter shows Out / IR; trades and wire wait on Show all");
need(fnSrc(gen, "overnightSlipHtml").includes("if (overnightOpen)")
  && fnSrc(gen, "overnightSlipHtml").includes("schematicSettingsHtml") === false,
  "generate-page.mjs Home summary must stay in sync");
need(fnSrc(page, "overnightShareText").includes('catLines("Out"')
  && fnSrc(page, "overnightShareText").includes("const open = true"),
  "share must send the full Out and IR lists");
need(page.includes('q.kind === "overnight"') && page.includes('view === "overnight"'),
  "unsigned share link must open the overnight ticket");
need(gen.includes("function overnightSlipHtml(") && gen.includes('q.set("r", "overnight")')
  && gen.includes("overnight-slip-lede") && gen.includes("function overnightEnabled("),
  "generate-page.mjs must stay in sync (do not execute it)");
need(fnSrc(page, "overnightSlipHtml").includes("Text this") === false
  && fnSrc(page, "overnightShareText").includes("Text this") === false,
  "Home overnight functions must not say Text this");
need(letter.v === 1 && letter.dateline && letter.lede && Array.isArray(letter.out) && Array.isArray(letter.ir),
  "Cuckle overnight.json must exist with a dateline, lede, and Out / IR lists");
need(letter.quiet === true || Array.isArray(letter.trades), "letter must know if the night was quiet");
need(letter.ir.some((p) => p.name === "A.J. Brown") && letter.out.some((p) => p.status === "OUT"),
  "IR list must surface A.J. Brown; Out list must be its own category");
const nico = letter.out.find((p) => p.name === "Nico Collins");
need(nico && nico.owner === "TipsUp" && nico.cuff_owned === false,
  "Nico Out on TipsUp must print cuff unowned");
need(letter.out.filter((p) => p.slot === "starter").length >= 1
  && letter.out.slice(0, 2).every((p) => p.slot === "starter")
  && letter.out[2] && letter.out[2].name === "Nico Collins",
  "collapsed Out preview must lead with Sunday starters, then unowned cuff");
need(fnSrc(page, "overnightPlayerLine").includes("overnightCuffNote")
  && fnSrc(page, "overnightSeatRowHtml").includes("overnightCuffNote")
  && fnSrc(page, "overnightCuffNote") === fnSrc(gen, "overnightCuffNote"),
  "card and share must name the cuff owner or unowned");
need(letter.out.every((p) => p.status === "OUT") && letter.ir.every((p) => p.status === "IR"),
  "Out and IR lists must not mix");
need(letter.ir.every((p) => p.value == null) && letter.out.every((p) => p.value == null),
  "letter must not print bag values on the board");
need(letter.out.length + letter.ir.length + (letter.other || []).length === letter.board_n,
  "expand must have every board row, not a 12-name cap");
need(plan.includes("league summary") && plan.includes("?r=overnight")
  && plan.includes("cuff unowned"),
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
