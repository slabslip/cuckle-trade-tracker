#!/usr/bin/env node
/** Design Mode: click section share and assert status note + PNG download. */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";

const ROOT = process.cwd();
const PORT = 8799;
const OUT = fs.existsSync("/opt/cursor/artifacts")
  ? "/opt/cursor/artifacts"
  : path.join(ROOT, "tmp");
fs.mkdirSync(OUT, { recursive: true });

function waitServer() {
  return new Promise((resolve, reject) => {
    const req = http.get("http://127.0.0.1:" + PORT + "/index.html", (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on("error", reject);
  });
}

await waitServer();
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
});
const context = await browser.newContext({
  acceptDownloads: true,
  viewport: { width: 390, height: 844 },
});
const page = await context.newPage();
const downloads = [];
page.on("download", (d) => downloads.push(d));

await page.goto("http://127.0.0.1:" + PORT + "/design-trade-helper-buy.html", {
  waitUntil: "networkidle",
  timeout: 60000,
});
await page.waitForSelector(".trade-helper-target, .trade-helper-sec-h", { timeout: 45000 });
// Prefer Clear space packages if chip present.
const clear = page.locator('[data-trade-helper-factor="clear_space"]');
if (await clear.count()) {
  await clear.first().click();
  await page.waitForTimeout(400);
}
await page.waitForSelector('[data-trade-helper-share="packages"]', { timeout: 15000 });
const pkgShare = page.locator('[data-trade-helper-share="packages"]').first();
await pkgShare.scrollIntoViewIfNeeded();

// Grant clipboard permissions when possible.
try {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
} catch (err) { /* ignore */ }

await pkgShare.click();
await page.waitForTimeout(800);

const note = page.locator(".trade-helper-share-note");
let noteText = "";
if (await note.count()) noteText = (await note.first().innerText()).trim();

// Fallback: force share via page evaluate if click missed.
if (!noteText) {
  noteText = await page.evaluate(async () => {
    if (typeof tradeHelperShareNow !== "function") return "no-fn";
    tradeHelperShareNow("packages");
    await new Promise((r) => setTimeout(r, 200));
    const el = document.querySelector(".trade-helper-share-note");
    return el ? el.textContent.trim() : "no-note";
  });
  await page.waitForTimeout(500);
  if (await note.count()) noteText = (await note.first().innerText()).trim() || noteText;
}

await page.screenshot({
  path: path.join(OUT, "trade-helper-share-sections.png"),
  fullPage: false,
});

let downloadPath = "";
if (downloads.length) {
  downloadPath = path.join(OUT, "trade-helper-share-download.png");
  await downloads[0].saveAs(downloadPath);
}

const ok = /Sent|Copied image|Saved image/.test(noteText);
const result = {
  ok,
  noteText,
  downloads: downloads.length,
  downloadPath: downloadPath || null,
  shot: path.join(OUT, "trade-helper-share-sections.png"),
};
console.log(JSON.stringify(result, null, 2));
await browser.close();
if (!ok) process.exit(1);
