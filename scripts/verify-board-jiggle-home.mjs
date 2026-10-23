#!/usr/bin/env node
/** Design Mode: Apple Home jiggle — Edit, drag reflow, − remove, Done; More hub. */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";

const PORT = Number(process.env.BOARD_JIGGLE_PORT || 8798);
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

await page.locator('[data-dash-edit="1"]').first().click();
await page.waitForSelector(".receipt-board.is-jiggle", { timeout: 10000 });
const editing = await page.evaluate(() => !!(dataDashEdit && document.querySelector(".receipt-board.is-jiggle")));
if (!editing) throw new Error("Edit should enter jiggle");
log.push("edit-jiggle");

const before = await page.evaluate(() => dataDashBoardTiles().slice());
const second = before[1];
const firstBox = await page.locator(`[data-dash-board] [data-dash-id="${before[0]}"]`).boundingBox();
const secondEl = page.locator(`[data-dash-board] [data-dash-id="${second}"]`);
const secondBox = await secondEl.boundingBox();
if (!firstBox || !secondBox) throw new Error("missing tile boxes");

await page.mouse.move(secondBox.x + secondBox.width / 2, secondBox.y + secondBox.height / 2);
await page.mouse.down();
await page.waitForTimeout(180);
await page.mouse.move(
  firstBox.x + firstBox.width / 2,
  firstBox.y + firstBox.height / 2,
  { steps: 12 },
);
await page.waitForTimeout(80);
await page.mouse.up();
await page.waitForTimeout(200);

const afterDrag = await page.evaluate(() => dataDashBoardTiles().slice());
if (afterDrag[0] !== second) {
  throw new Error("drag should put second door into slot 0; got " + afterDrag[0]);
}
log.push("drag-reflow");
await page.screenshot({ path: path.join(OUT, "board-jiggle-drag.png"), fullPage: false });

const cutId = afterDrag[afterDrag.length - 1];
const nBefore = afterDrag.length;
await page.locator(`.data-tile-del[data-dash-remove="${cutId}"]`).first().click();
await page.waitForTimeout(150);
const afterCut = await page.evaluate(() => dataDashBoardTiles().slice());
if (afterCut.length !== nBefore - 1 || afterCut.includes(cutId)) {
  throw new Error("− should remove door " + cutId);
}
log.push("remove");

await page.locator('[data-dash-edit="1"]').first().click();
await page.waitForTimeout(150);
const done = await page.evaluate(() => ({
  edit: dataDashEdit,
  jiggle: !!document.querySelector(".receipt-board.is-jiggle"),
  board0: dataDashBoardTiles()[0],
}));
if (done.edit || done.jiggle) throw new Error("Done should exit jiggle");
if (done.board0 !== second) throw new Error("order must persist after Done");
log.push("done");

await page.locator('[data-dash-edit="1"]').first().click();
await page.waitForSelector(".receipt-board.is-jiggle", { timeout: 10000 });
await page.locator('[data-dash-arrange="list"]').first().click();
await page.waitForSelector(".data-arrange", { timeout: 10000 });
for (const mode of ["list", "board", "pick", "home4", "catalog"]) {
  await page.locator(`[data-dash-arrange-mode="${mode}"]`).first().click();
  await page.waitForTimeout(100);
  const on = await page.evaluate((m) => dataDashArrange === m, mode);
  if (!on) throw new Error("More hub mode failed: " + mode);
}
log.push("more-hub");
await page.locator('[data-dash-arrange-cancel="1"]').first().click();
await page.waitForTimeout(100);

await page.screenshot({ path: path.join(OUT, "board-jiggle-done.png"), fullPage: false });
fs.writeFileSync(path.join(OUT, "board-jiggle-home.log"), log.join("\n") + "\n");
console.log(JSON.stringify({ ok: true, log, board0: done.board0 }, null, 2));
await browser.close();
