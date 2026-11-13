#!/usr/bin/env node
/** Past champions League Data door — add-only board tile 21. */
import fs from "node:fs";

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

const page = fs.readFileSync("index.html", "utf8");
const gen = fs.readFileSync("generate-page.mjs", "utf8");

if (!page.includes('const DATA_V = "') ) fail("must keep DATA_V");
for (const need of [
  'id: "past_champions"',
  'lab: "Past champions"',
  "const DATA_DASH_MAX = 25",
  'src.splice(after + 1, 0, "past_champions")',
  'canon === "past_champions"',
]) {
  if (!page.includes(need) && !gen.includes(need)) fail("missing: " + need);
}

const doors = (page.match(/const DATA_DOORS = \[([\s\S]*?)\];/) || [])[1] || "";
const def = (page.match(/const DATA_DASH_DEFAULT = \[([\s\S]*?)\];/) || [])[1] || "";
const doorIds = [...doors.matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]);
const defIds = [...def.matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]);
if (doorIds.length !== 25 || defIds.length !== 25) {
  fail("DATA_DOORS / DEFAULT must be 25 tiles, got " + doorIds.length + "/" + defIds.length);
}
if (doorIds[20] !== "past_champions" || defIds[20] !== "past_champions") {
  fail("Past champions must be door tile 21");
}
if (doorIds[19] !== "trade_web") fail("must not displace Trade web");
// Migrate must be add-only for past_champions (never src[at] =).
const mig = (gen.match(/function dataDashMigrateMyPicks\([\s\S]*?\n    \}/) || [])[0] || "";
if (!mig.includes('src.splice(after + 1, 0, "past_champions")')) {
  fail("migrate must splice Past champions after Trade web");
}
if (/src\[[^\]]+\] = "past_champions"/.test(mig)) {
  fail("Past champions migrate must not replace another tile");
}

console.log(JSON.stringify({
  ok: true,
  lab: "Past champions",
  doors: 22,
  tile: 21,
  after: doorIds[19],
}));
