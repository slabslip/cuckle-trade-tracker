#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const steps = [
  ["sleeper-sync.mjs"],
  ["draft-resolve.mjs"],
  ["value-snapshot.mjs"],
  ["revalue.mjs"],
  ["generate-page.mjs"],
];

for (const [script, ...args] of steps) {
  console.log(`\n== ${script} ==`);
  const r = spawnSync(process.execPath, [new URL(script, import.meta.url).pathname, ...args], {
    stdio: "inherit",
  });
  if (r.status) process.exit(r.status);
}
