#!/usr/bin/env node
/**
 * Live GM dash: pending_sync row + hosted book must not paint the meter-sync strip.
 * How I finished stays off the default redraft home board.
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

const CHROME = process.env.CHROME
  || (existsSync("/usr/local/bin/google-chrome") ? "/usr/local/bin/google-chrome" : "/usr/bin/google-chrome-stable");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".css": "text/css",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
};

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

function fail(msg) {
  console.error("FAIL meter-ready: " + msg);
  process.exit(1);
}

async function main() {
  const { server, origin } = await startLocalServer();
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--window-size=390,844"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });
    await page.evaluateOnNewDocument(() => {
      const user = {
        access_token: "design-mode",
        refresh_token: "",
        expires_at: Math.floor(Date.now() / 1000) + 86400,
        user_id: "design-user",
        username: "designer",
        seat_user_id: "458342725222133760",
        seat_name: "TrumanCooper",
      };
      const league = {
        sleeper_league_id: "1389723418827460608",
        name: "Gm 2026 LLJ",
        status: "pending_sync",
        sleeper_user_id: "458342725222133760",
        team_name: "TrumanCooper",
      };
      localStorage.setItem("cuckle.auth.v1", JSON.stringify(user));
      localStorage.setItem("cuckle.active_league.v1", JSON.stringify(league));
      localStorage.setItem("cuckle.memberships.v1", JSON.stringify([league]));
      sessionStorage.setItem("cuckle.design.league_home", "1");
    });
    await page.goto(
      origin + "/index.html?design=league-home&league=1389723418827460608&_=" + Date.now(),
      { waitUntil: "networkidle0", timeout: 60000 },
    );
    await page.waitForSelector(".home-top-doors, .lh-calc-door, .lh-actions", { timeout: 20000 });
    const painted = await page.evaluate(() => {
      const banner = document.querySelector("#app .sync-banner");
      const doors = [...document.querySelectorAll("#app [data-dash-open]")].map((el) => el.getAttribute("data-dash-open"));
      const labels = [...document.querySelectorAll("#app .door-lab, #app .lh-calc-door")].map((el) => (el.textContent || "").trim());
      return {
        banner: banner ? (banner.textContent || "").trim() : "",
        doors: doors,
        labels: labels,
        body: (document.querySelector("#app") && document.querySelector("#app").innerText) || "",
      };
    });
    if (/Meter sync still pending/i.test(painted.banner) || /Meter sync still pending/i.test(painted.body)) {
      fail("banner still paints when the hosted GM book is loaded: " + painted.banner);
    }
    if (!/Regular season avg|Career average|Career net/i.test(painted.body + painted.labels.join(" "))) {
      fail("GM career doors did not paint");
    }
    if (painted.doors.indexOf("season_place") >= 0) {
      fail("How I finished is still on the default GM home board");
    }
    const tabs = ["teams", "news", "ledger"];
    for (const tab of tabs) {
      const btn = await page.$('[data-home-tab="' + tab + '"]');
      if (!btn) fail("missing " + tab + " tab");
      await btn.click();
      await page.waitForFunction((want) => {
        const on = document.querySelector('.lh-actions [data-home-tab="' + want + '"].on, .lh-actions [data-home-tab="' + want + '"][aria-selected="true"]');
        return !!(on || document.querySelector(".news-tab, .teams-page, [data-ledger], h2"));
      }, { timeout: 8000 }, tab);
      const after = await page.evaluate(() => (document.querySelector("#app") && document.querySelector("#app").innerText) || "");
      if (/Meter sync still pending/i.test(after)) fail("banner returned on " + tab);
      if (/This tab could not load/i.test(after)) fail(tab + " tab fell through to the error caption");
    }
    const home = await page.$('[data-home-tab="home"]');
    if (home) await home.click();
    await page.screenshot({ path: "/tmp/meter-ready-gm.png", fullPage: false });
    console.log("PASS meter-ready", origin, "/tmp/meter-ready-gm.png");
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
