#!/usr/bin/env node
/** Formula unit checks. No scrape. */
import {
  TODAY_DD_W,
  TODAY_FC_W,
  TODAY_FLAT_W,
  TODAY_KTC_W,
  isRetired,
  marketQuote,
  marketValue,
  priceTodayValue,
} from "./price-today.mjs";
import { marketPickKey } from "./market-snap.mjs";

function check(name, cond) {
  if (!cond) throw new Error(`price-today.test failed: ${name}`);
}

check("weights sum 1", Math.abs(TODAY_FLAT_W + TODAY_KTC_W + TODAY_FC_W + TODAY_DD_W - 1) < 1e-9);
check("quote 0 is miss", marketQuote(0) == null);
check("quote negative is miss", marketQuote(-1) == null);
check("quote 12 is live", marketQuote(12) === 12);

const idx = {
  vmax: 10000,
  bySleeper: new Map([["2", { value: 0 }], ["3", { value: 1800 }]]),
  byPick: new Map([
    ["pickval:2029:1:Mid", { value: 4200 }],
    ["pickval:2027:1:Early", { value: 6100 }],
  ]),
  byName: new Map([["joe mixon", { value: 2464 }]]),
};
check("dd 0 sleeper is miss", marketValue({ kind: "player", asset_key: "player:2", label: "Zero" }, idx, null) == null);
check("positive sleeper hits", marketValue({ kind: "player", asset_key: "player:3", label: "Hit" }, idx, null) === 1800);
check("no name fallback when sid misses", marketValue({
  kind: "player", asset_key: "player:4018", label: "Joe Mixon",
}, idx, null) == null);
check("early pick falls back to mid", marketValue({
  kind: "pick", asset_key: "pick:2029:1:1", label: "2029 1st",
}, idx, null) === 4200);
check("exact early pick wins", marketValue({
  kind: "pick", asset_key: "pick:2027:1:1", label: "2027 1st",
}, idx, null) === 6100);

const ctx = {
  ktc: { vmax: 9998, bySleeper: new Map([["1", { value: 9000 }]]), byPick: new Map(), byName: new Map() },
  fc: { vmax: 10346, bySleeper: new Map([["1", { value: 8500 }]]), byPick: new Map(), byName: new Map() },
  dd: { vmax: 10000, bySleeper: new Map([["1", { value: 8800 }], ["2", { value: 0 }]]), byPick: new Map(), byName: new Map() },
  players: { 1: { position: "RB", team: "DET", active: true }, 2: { position: "WR", team: "MIA", active: true } },
  nameToId: new Map(),
};
const all = priceTodayValue(8000, { kind: "player", asset_key: "player:1", label: "Unit" }, ctx);
check("all-four blend 8585", all === 8585);
const zeroDd = priceTodayValue(8000, { kind: "player", asset_key: "player:2", label: "Zero" }, {
  ...ctx,
  ktc: { vmax: 9998, bySleeper: new Map(), byPick: new Map(), byName: new Map() },
  fc: { vmax: 10346, bySleeper: new Map(), byPick: new Map(), byName: new Map() },
});
check("dd 0 does not enter blend", zeroDd === 8000);

check("hardcoded retiree", isRetired(
  { kind: "player", asset_key: "player:3164", label: "Ezekiel Elliott" },
  { ...ctx, ktc: { bySleeper: new Map(), byPick: new Map(), byName: new Map() }, players: { 3164: { team: "FA" } }, nameToId: new Map() },
));
check("empty nfl dict does not infer retire", !isRetired(
  { kind: "player", asset_key: "player:13425", label: "Jalon Daniels" },
  { ktc: { bySleeper: new Map(), byPick: new Map(), byName: new Map() }, players: {}, nameToId: new Map() },
));
check("rostered off-ktc is live", !isRetired(
  { kind: "player", asset_key: "player:13425", label: "Jalon Daniels" },
  { ktc: { bySleeper: new Map(), byPick: new Map(), byName: new Map() }, players: { 13425: { team: "TB" } }, nameToId: new Map() },
));

check("fc early pick key", marketPickKey("2027 1st (Early)") === "pickval:2027:1:Early");
check("dd round key", marketPickKey("2027 Round 1 Mid") === "pickval:2027:1:Mid");
check("dd slot key", marketPickKey("2026 Pick 1.01") === "pickval:2026:1:Early");

console.log("price-today.test ok");
