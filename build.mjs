#!/usr/bin/env node
import { spawnSync } from "node:child_process";

/**
 * The whole rebuild, in order. apply-value-adjust.mjs is not optional: it owns the today
 * blend, the Value Adjustment and every trade board, so a build without it ships the
 * flatten-only book. title-path.mjs writes titles.json, which the Champions Path reads.
 */
const steps = [
  ["sleeper-sync.mjs"],
  ["draft-resolve.mjs"],
  ["value-snapshot.mjs"],
  ["revalue.mjs"],
  ["title-path.mjs"],
  ["apply-value-adjust.mjs"],
  ["generate-page.mjs"],
];

for (const [script, ...args] of steps) {
  console.log(`\n== ${script} ==`);
  const r = spawnSync(process.execPath, [new URL(script, import.meta.url).pathname, ...args], {
    stdio: "inherit",
  });
  if (r.status) process.exit(r.status);
}
