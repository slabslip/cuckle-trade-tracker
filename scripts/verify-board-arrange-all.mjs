#!/usr/bin/env node
/** Design Mode: Arrange hub — List ↑, Board mode, Pick, Home 4, Catalog, Save. */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";

const PORT = Number(process.env.BOARD_ARRANGE_PORT || 8798);
const OUT = fs.existsSync("/opt/cursor/artifacts")
  ? "/opt/cursor/artifacts"
  : path.join(process.cwd(), "tmp");
fs.mkdirSync(OUT, { recursive: true });

function waitServer() {
  return new Promise((resolve, reject) => {
    const req = http.get("http://127.0.0.1:" + PORT + "/design-league-home.html", (res) => {
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
const page = await (await browser.newContext({
  viewport: { width: 390, height: 844 },
})).newPage();
const log = [];

await page.goto("http://127.0.0.1:" + PORT + "/design-league-home.html", {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForSelector(".lh-actions", { timeout: 60000 });
await page.evaluate(() => { if (typeof openDataSets === "function") openDataSets(); });
await page.waitForSelector("[data-dash-board], .data-dash", { timeout: 20000 });

await page.locator('[data-dash-arrange="list"]').first().click();
await page.waitForSelector(".data-arrange", { timeout: 10000 });
log.push("opened arrange");

for (const mode of ["list", "board", "pick", "home4", "catalog"]) {
  await page.locator(`[data-dash-arrange-mode="${mode}"]`).first().click();
  await page.waitForTimeout(150);
  const on = await page.evaluate((m) => dataDashArrange === m, mode);
  if (!on) throw new Error("mode chip did not stick: " + mode);
  log.push("mode=" + mode);
}
await page.screenshot({ path: path.join(OUT, "board-arrange-catalog.png"), fullPage: false });

await page.locator('[data-dash-arrange-mode="list"]').first().click();
const before = await page.evaluate(() => dataDashArrangeDraft.slice());
const second = before[1];
await page.locator(`[data-dash-move="${second}"][data-dash-dir="-1"]`).first().click();
await page.waitForTimeout(100);
const afterUp = await page.evaluate(() => dataDashArrangeDraft.slice());
if (afterUp[0] !== second) throw new Error("list ↑ should move into draft[0]");
log.push("list-up ok");

await page.locator('[data-dash-arrange-mode="pick"]').first().click();
await page.locator(`[data-dash-pick="${afterUp[2]}"]`).first().click();
await page.locator(`[data-dash-pick="${afterUp[0]}"]`).first().click();
await page.waitForTimeout(100);
const afterPick = await page.evaluate(() => dataDashArrangeDraft.slice());
if (afterPick[0] !== afterUp[2]) throw new Error("pick→place should put picked door first");
log.push("pick ok");

await page.locator('[data-dash-arrange-mode="home4"]').first().click();
await page.locator('[data-dash-home-slot="0"]').first().click();
const poolId = await page.evaluate(() => dataDashArrangeDraft[5] || dataDashArrangeDraft[4]);
await page.locator(`[data-dash-home-pick="${poolId}"]`).first().click();
await page.waitForTimeout(100);
const afterHome = await page.evaluate(() => dataDashArrangeDraft.slice());
if (afterHome[0] !== poolId) throw new Error("Home 4 slot replace failed");
log.push("home4 ok");

await page.locator('[data-dash-arrange-save="1"]').first().click();
await page.waitForTimeout(200);
const saved = await page.evaluate(() => ({
  arrange: dataDashArrange,
  board: dataDashBoardTiles().slice(0, 4),
}));
if (saved.arrange) throw new Error("Save should close arrange");
if (saved.board[0] !== poolId) throw new Error("Save should commit draft to board");
log.push("save ok");

await page.screenshot({ path: path.join(OUT, "board-arrange-saved.png"), fullPage: false });
fs.writeFileSync(path.join(OUT, "board-arrange-all.log"), log.join("\n") + "\n");
console.log(JSON.stringify({ ok: true, log, top4: saved.board }, null, 2));
await browser.close();
