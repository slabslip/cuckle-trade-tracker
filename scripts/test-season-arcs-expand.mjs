#!/usr/bin/env node
/** Compat: season-arcs expand asserts live in test-arcs-types-expand.mjs */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const r = spawnSync(process.execPath, [join(root, "scripts/test-arcs-types-expand.mjs")], {
  cwd: root,
  encoding: "utf8",
});
process.stdout.write(r.stdout || "");
process.stderr.write(r.stderr || "");
process.exit(r.status == null ? 1 : r.status);
