#!/usr/bin/env node
/**
 * Store-shell gate: live product origin with ?store=1 (never Design Mode).
 *
 *   node scripts/store-device-gate.mjs
 *   STORE_ORIGIN=https://slabslip.github.io/cuckle-trade-tracker node scripts/store-device-gate.mjs
 *
 * Default origin is a local static server over the generated index.html.
 * Chrome: /usr/bin/google-chrome-stable. puppeteer-core: /tmp/node_modules.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(join(process.cwd(), "package.json"));
let puppeteer;
try {
  puppeteer = require("/tmp/node_modules/puppeteer-core");
} catch {
  puppeteer = require("puppeteer-core");
}

const CHROME = process.env.CHROME || "/usr/bin/google-chrome-stable";
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".css": "text/css",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
};

const CHECKS = [
  ["five tabs", (html) =>
    html.includes('homeTabAction("home"') &&
    html.includes('homeTabAction("teams"') &&
    html.includes('homeTabAction("news"') &&
    html.includes('homeTabAction("ledger"') &&
    html.includes("lhMenuAction(") &&
    !html.includes('homeTabAction("calc"')],
  ["store honor-system copy", (html) =>
    html.includes("Honor-system side bets") &&
    html.includes("no money moves in the app") &&
    html.includes("Propose a side bet")],
  ["calc + teams + news + menu", (html) =>
    html.includes("function renderTeamsPage(") &&
    html.includes("function renderLedger(") &&
    html.includes('data-view="calc"') &&
    html.includes("lhMenuAction(")],
  ["no design query", (html, url) => !String(url).includes("design=")],
];

function startLocalServer() {
  const root = process.cwd();
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const path = decodeURIComponent((req.url || "/").split("?")[0]);
      const file = path === "/" ? "/index.html" : path;
      const abs = join(root, file.replace(/^\//, ""));
      if (!existsSync(abs)) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      try {
        const body = await readFile(abs);
        res.writeHead(200, { "content-type": MIME[extname(abs)] || "application/octet-stream" });
        res.end(body);
      } catch {
        res.writeHead(500);
        res.end("err");
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, origin: `http://127.0.0.1:${port}` });
    });
  });
}

async function main() {
  const remote = process.env.STORE_ORIGIN || "";
  let server = null;
  const origin = remote || (await startLocalServer().then((s) => {
    server = s.server;
    return s.origin;
  }));
  const url = `${origin.replace(/\/$/, "")}/?store=1`;
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", `--window-size=390,844`],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });
  await page.setUserAgent("Mozilla/5.0 ChuckleStore/1 (iPhone; Chuckle Fantasy) store-device-gate");
  await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });
  await page.waitForSelector("#app", { timeout: 20000 });
  const html = await page.content();
  const href = page.url();
  const failures = [];
  for (const [name, fn] of CHECKS) {
    if (!fn(html, href)) failures.push(name);
  }
  const shot = "/tmp/store-device-gate.png";
  await page.screenshot({ path: shot, fullPage: false });
  await browser.close();
  if (server) server.close();
  if (failures.length) {
    console.error("FAIL", failures.join(", "));
    process.exit(1);
  }
  console.log("PASS store-device-gate", url, shot);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
