#!/usr/bin/env node
/** Design Mode: Reorder → ↑ / Top → Done on Your board. */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";

const ROOT = process.cwd();
const PORT = Number(process.env.BOARD_REORDER_PORT || 8798);
const OUT = fs.existsSync("/opt/cursor/artifacts")
  ? "/opt/cursor/artifacts"
  : path.join(ROOT, "tmp");
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
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
});
const page = await context.newPage();
const log = [];

await page.goto("http://127.0.0.1:" + PORT + "/design-league-home.html", {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForSelector(".lh-actions, [data-lh-menu]", { timeout: 45000 });

// Open League Data from Menu.
const menuBtn = page.locator('[data-lh-menu="1"], button:has-text("Menu")').first();
await menuBtn.click();
await page.waitForTimeout(300);
const dataItem = page.locator('button:has-text("League Data"), [data-lh-go="data"], [data-view="data"]').first();
if (await dataItem.count()) {
  await dataItem.click();
} else {
  await page.evaluate(() => {
    if (typeof openDataSets === "function") openDataSets();
    else {
      homeTab = "history";
      view = "home";
      dataSet = null;
      dataRoom = "overview";
      render();
    }
  });
}
await page.waitForSelector(".data-dash, [data-dash-board], .receipt-board", { timeout: 20000 });
log.push("opened Your board");

const reorder = page.locator('[data-dash-edit="1"]').first();
await reorder.waitFor({ timeout: 10000 });
const beforeIds = await page.evaluate(() => {
  return [...document.querySelectorAll("[data-dash-board] [data-dash-id]")]
    .map((el) => el.getAttribute("data-dash-id"));
});
log.push("before=" + beforeIds.join(","));

await reorder.click();
await page.waitForSelector(".receipt-board.is-organizing, .data-tile-ico", { timeout: 10000 });
const orgCols = await page.evaluate(() => {
  const board = document.querySelector(".receipt-board.is-organizing");
  return board ? getComputedStyle(board).gridTemplateColumns : "";
});
log.push("orgCols=" + orgCols);
if (!orgCols || orgCols.split(" ").length !== 1) {
  throw new Error("organizing board must be one column, got " + orgCols);
}

await page.screenshot({ path: path.join(OUT, "board-reorder-list.png"), fullPage: false });

// Move second tile up.
const second = beforeIds[1];
const upBtn = page.locator(`[data-dash-move="${second}"][data-dash-dir="-1"]`).first();
await upBtn.click();
await page.waitForTimeout(200);
const afterUp = await page.evaluate(() => {
  return [...document.querySelectorAll("[data-dash-board] [data-dash-id]")]
    .map((el) => el.getAttribute("data-dash-id"));
});
log.push("afterUp=" + afterUp.join(","));
if (afterUp[0] !== second) {
  throw new Error("↑ should put second tile first; got " + afterUp[0]);
}

// Pin a lower tile to Top.
const pinId = afterUp[Math.min(3, afterUp.length - 1)];
const topBtn = page.locator(`[data-dash-to="${pinId}"]`).first();
if (await topBtn.count()) {
  await topBtn.click();
  await page.waitForTimeout(200);
}
const afterTop = await page.evaluate(() => {
  return [...document.querySelectorAll("[data-dash-board] [data-dash-id]")]
    .map((el) => el.getAttribute("data-dash-id"));
});
log.push("afterTop=" + afterTop.join(","));
if (await topBtn.count() && afterTop[0] !== pinId) {
  throw new Error("Top should pin tile to #1; got " + afterTop[0]);
}

const done = page.locator('[data-dash-edit="1"]').first();
await done.click();
await page.waitForTimeout(200);
const stillOrg = await page.locator(".receipt-board.is-organizing").count();
if (stillOrg) throw new Error("Done must exit organizing mode");
const doneLab = (await done.innerText()).trim();
if (doneLab !== "Reorder") throw new Error("Done should flip label back to Reorder, got " + doneLab);
log.push("done ok");

await page.screenshot({ path: path.join(OUT, "board-reorder-done.png"), fullPage: false });
fs.writeFileSync(path.join(OUT, "board-reorder-simple.log"), log.join("\n") + "\n");
console.log(JSON.stringify({ ok: true, log }, null, 2));
await browser.close();
