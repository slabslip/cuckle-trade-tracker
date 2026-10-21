#!/usr/bin/env node
/** Audit every same-team same-pos pairing under the locked Handcuff rules. */
import { readFileSync } from "node:fs";
import { cuffInsurance, cuffTeammateAdds, cuffNormTeam, CUFF_MAX_RATIO } from "../cuff-formula.mjs";

const calc = JSON.parse(readFileSync("data/leagues/1315431339301806080/ui/calculator.json", "utf8"));
const players = (calc.players || []).filter((p) => p.sleeper_id && p.pos && p.value > 0);
const meta = Object.fromEntries(players.map((p) => [String(p.sleeper_id), {
  value: p.value,
  pos: p.pos,
  team: p.team || "",
}]));

const byKey = new Map();
for (const p of players) {
  if (!p.team) continue;
  const k = `${cuffNormTeam(p.team)}|${p.pos}`;
  if (!byKey.has(k)) byKey.set(k, []);
  byKey.get(k).push(p);
}

console.log("=== VALID FIRES (hold league lead, recv cuff under half) ===");
let n = 0;
for (const [k, list] of [...byKey.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const [, pos] = k.split("|");
  if (pos === "WR") continue;
  const ranked = list.slice().sort((a, b) => b.value - a.value);
  const lead = ranked[0];
  for (const p of ranked.slice(1)) {
    const add = cuffTeammateAdds({
      recv: { [String(p.sleeper_id)]: p.value },
      haveAfter: { [String(lead.sleeper_id)]: true, [String(p.sleeper_id)]: true },
      hadStarter: { [String(lead.sleeper_id)]: true },
      meta,
      week: 1,
    });
    const ratio = p.value / lead.value;
    if (!add) {
      if (ratio >= CUFF_MAX_RATIO) console.log(`SKIP committee ${lead.name} / ${p.name}  ratio=${ratio.toFixed(3)}`);
      continue;
    }
    n += 1;
    const own = p.owner_id === lead.owner_id ? "SELF" : "TRADE";
    console.log(`${own} +${String(add).padStart(3)}  ${lead.name} @ ${lead.owner} ← ${p.name} @ ${p.owner}  ${k}  ratio=${ratio.toFixed(3)}`);
  }
}
console.log("valid fires", n);

console.log("\n=== FALSE-FIRE GUARDS ===");
const two = cuffTeammateAdds({
  recv: { "11589": 1526 },
  haveAfter: { "8132": true, "11589": true },
  hadStarter: { "8132": true },
  meta,
  week: 1,
});
console.log("Allgeier hold / Benson recv (Love is lead)", two);
const comm = cuffTeammateAdds({
  recv: { "7594": 2786 },
  haveAfter: { "11583": true, "7594": true },
  hadStarter: { "11583": true },
  meta,
  week: 1,
});
console.log("Brooks hold / Chuba recv", comm);
const alias = cuffTeammateAdds({
  recv: { "4144": 764 },
  haveAfter: { "9484": true, "4144": true },
  hadStarter: { "9484": true },
  meta,
  week: 1,
});
console.log("Kraft hold / Jonnu recv (GB vs GBP)", alias);
const malik = cuffTeammateAdds({
  recv: { "8800": 1517 },
  haveAfter: { "7588": true, "8800": true },
  hadStarter: { "7588": true },
  meta,
  week: 1,
});
console.log("Javonte hold / Malik recv", malik);
