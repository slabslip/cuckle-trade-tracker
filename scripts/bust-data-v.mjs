#!/usr/bin/env node
/**
 * Bump DATA_V in generate-page.mjs + index.html and the SW cache name.
 * Does not run generate-page.mjs (that copy step has smashed live copy before).
 */
import fs from "node:fs";

const stamp = String(process.argv[2] || "").trim();
const cache = String(process.argv[3] || "").trim() || `chuckle-shell-${stamp}`;
if (!stamp) {
  console.error("usage: node scripts/bust-data-v.mjs <DATA_V> [sw-cache]");
  process.exit(1);
}

function sub(path, re, repl, expect = 1) {
  const text = fs.readFileSync(path, "utf8");
  const next = text.replace(re, repl);
  const n = (text.match(re) || []).length;
  if (n !== expect) throw new Error(`${path}: expected ${expect} ${re}, got ${n}`);
  if (next === text) throw new Error(`${path}: replace was a no-op`);
  fs.writeFileSync(path, next);
}

sub("generate-page.mjs", /const DATA_V = "[^"]+"/, `const DATA_V = "${stamp}"`);
sub("index.html", /const DATA_V = "[^"]+"/, `const DATA_V = "${stamp}"`);
sub("sw.js", /const CACHE = "[^"]+"/, `const CACHE = "${cache}"`);
console.log(JSON.stringify({ DATA_V: stamp, CACHE: cache }));
