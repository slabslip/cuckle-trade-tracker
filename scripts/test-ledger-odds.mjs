#!/usr/bin/env node
/** House American line: +400 on $100 means house risks 100 to win 400. */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { ROOT } from "../lib.mjs";

const page = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const gen = fs.readFileSync(path.join(ROOT, "generate-page.mjs"), "utf8");
const sdd = fs.readFileSync(path.join(ROOT, "docs/LEDGER_SDD.md"), "utf8");

function fnSrc(src, name) {
  const start = src.indexOf("function " + name + "(");
  if (start < 0) throw new Error("missing function " + name);
  let i = src.indexOf("{", start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error("unclosed function " + name);
}

function need(src, label, strs) {
  const missing = strs.filter((s) => !src.includes(s));
  if (missing.length) throw new Error(label + " missing: " + missing.join(", "));
}

function forbid(src, label, strs) {
  const hit = strs.filter((s) => src.includes(s));
  if (hit.length) throw new Error(label + " still has: " + hit.join(", "));
}

need(page, "index.html", [
  "function ledgerOddsPreview(",
  "function ledgerMoneyForBet(",
  "You are underdog ",
  "You are favorite ",
  "Winner collects $",
  "function receiptPickChronoCmp(",
  "data-receipt-pick-year",
  "data-receipt-pick-round",
  "All years",
  "All picks",
]);
need(gen, "generate-page.mjs", [
  "function ledgerOddsPreview(",
  "function ledgerMoneyForBet(",
  "You are underdog ",
  "Winner collects $",
  "function receiptPickChronoCmp(",
  "data-receipt-pick-year",
  "data-receipt-pick-round",
]);
need(sdd, "LEDGER_SDD", [
  "House American +400",
  "amount_cents` is the house stake",
]);
forbid(page, "index.html", ["you offer them plus", "You offer "]);
if (fnSrc(page, "receiptPickChronoCmp").includes("return yb - ya")
  || fnSrc(gen, "receiptPickChronoCmp").includes("return yb - ya")
  || !fnSrc(page, "receiptPickChronoCmp").includes("return ya - yb")) {
  throw new Error("origin picks must sort earliest year first");
}

const ctx = {};
vm.runInNewContext([
  fnSrc(page, "ledgerFmtOdds"),
  fnSrc(page, "ledgerSnapOdds"),
  fnSrc(page, "ledgerHouseOddsOf"),
  fnSrc(page, "ledgerReadTerms"),
  fnSrc(page, "ledgerOddsPreview"),
  fnSrc(page, "ledgerMoneyForBet"),
].join("\n"), ctx);

function eq(got, want, label) {
  if (got !== want) throw new Error(label + ": got " + got + " want " + want);
}

const plus = ctx.ledgerOddsPreview(10000, 400);
eq(plus.you_put_cents, 10000, "+400 house put");
eq(plus.you_win_cents, 40000, "+400 house win");
eq(plus.they_put_cents, 40000, "+400 them put");
eq(plus.they_win_cents, 10000, "+400 them win");
if (!plus.words.includes("You are underdog +400")) {
  throw new Error("+400 words: " + plus.words);
}
if (!plus.words.includes("They risk $400") || !plus.words.includes("Winner collects $500")) {
  throw new Error("+400 payout words: " + plus.words);
}

const minus = ctx.ledgerOddsPreview(10000, -400);
eq(minus.you_put_cents, 10000, "-400 house put");
eq(minus.you_win_cents, 2500, "-400 house win");
eq(minus.they_put_cents, 2500, "-400 them put");
eq(minus.they_win_cents, 10000, "-400 them win");
if (!minus.words.includes("You are favorite -400")) {
  throw new Error("-400 words: " + minus.words);
}

const even = ctx.ledgerOddsPreview(10000, 0);
eq(even.you_put_cents, 10000, "even house put");
eq(even.they_put_cents, 10000, "even them put");
eq(even.you_win_cents, 10000, "even house win");

const repaired = ctx.ledgerMoneyForBet({
  amount_cents: 10000,
  house_odds: 400,
  terms_json: {
    you_put_cents: 40000,
    you_win_cents: 10000,
    they_put_cents: 10000,
    they_win_cents: 40000,
    house_odds: 400,
  },
});
eq(repaired.you_put_cents, 10000, "ARae repair house put");
eq(repaired.you_win_cents, 40000, "ARae repair house win");
eq(repaired.they_put_cents, 40000, "ARae repair them put");
eq(repaired.they_win_cents, 10000, "ARae repair them win");

const pickCtx = {
  receiptPickYear: function (p, key) {
    const m = /^pick:(\d{4}):/.exec(String(key || ""));
    return m ? m[1] : "";
  },
  pickKeyParts: function (key) {
    const m = /^pick:(\d{4}):(\d+):(\d+)$/.exec(String(key || ""));
    if (!m) return null;
    return { season: m[1], round: Number(m[2]), slot: Number(m[3]) };
  },
};
vm.runInNewContext(fnSrc(page, "receiptPickChronoCmp"), pickCtx);
const rows = [
  { key: "pick:2028:1:3", p: { label: "2028 1st" } },
  { key: "pick:2027:3:1", p: { label: "2027 3rd" } },
  { key: "pick:2027:1:2", p: { label: "2027 1st" } },
].sort(pickCtx.receiptPickChronoCmp);
if (rows[0].key !== "pick:2027:1:2" || rows[1].key !== "pick:2027:3:1" || rows[2].key !== "pick:2028:1:3") {
  throw new Error("chrono order: " + rows.map((r) => r.key).join(" "));
}

console.log("ledger odds + pick chrono ok");
