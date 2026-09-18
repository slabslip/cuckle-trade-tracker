import { chromium } from "/tmp/node_modules/playwright/index.mjs";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const shotDir = "/opt/cursor/artifacts";
fs.mkdirSync(shotDir, { recursive: true });

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
};

function serve() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    let file = decodeURIComponent(url.pathname);
    if (file === "/") file = "/index.html";
    const full = path.join(ROOT, file);
    if (!full.startsWith(ROOT) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
      res.writeHead(404);
      res.end("missing");
      return;
    }
    res.writeHead(200, { "content-type": MIME[path.extname(full)] || "application/octet-stream" });
    fs.createReadStream(full).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

function fail(msg) {
  console.error("VERIFY FAIL: " + msg);
  process.exitCode = 1;
}

const server = await serve();
const port = server.address().port;
const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on("pageerror", (err) => console.error("PAGEERROR", err.message));

try {
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => typeof openLeagueDashboard === "function", { timeout: 15000 });

  const opened = await page.evaluate(async () => {
    try {
      await openLeagueDashboard({
        sleeper_league_id: "1389723418827460608",
        name: "Gm 2026 LLJ",
      });
      return {
        ok: true,
        screen: typeof appScreen !== "undefined" ? appScreen : "",
        kind: typeof leagueFormat === "function" ? leagueFormat().kind : "",
        seats: (typeof finishesBook !== "undefined" && finishesBook && finishesBook.seats) ? finishesBook.seats.length : 0,
        view: typeof view !== "undefined" ? view : "",
        who: typeof receiptWhoList !== "undefined" ? receiptWhoList : "",
      };
    } catch (err) {
      return { ok: false, err: String(err && err.message || err) };
    }
  });
  console.log("OPEN GM", opened);
  await page.waitForTimeout(800);
  const afterOpen = await page.evaluate(() => {
    if (typeof setHomeTab === "function") setHomeTab("history", { force: true });
    else homeTab = "history";
    dataDashOpenReport("season_place");
    return {
      who: receiptWhoList,
      view: view,
      screen: appScreen,
      homeTab: typeof homeTab !== "undefined" ? homeTab : "",
      html: document.body.innerText.slice(0, 800),
    };
  });
  console.log("OPEN DOOR", {
    who: afterOpen.who,
    view: afterOpen.view,
    screen: afterOpen.screen,
    homeTab: afterOpen.homeTab,
    html: afterOpen.html,
  });
  await page.waitForSelector(".receipt-portal-list, .row, .names, [data-receipt-door-filter]", { timeout: 15000 });
  await page.waitForTimeout(400);

  const gmCareer = await page.evaluate(() => {
    const captions = Array.from(document.querySelectorAll("p.caption")).map(function (p) { return p.textContent || ""; });
    const caption = captions.find(function (t) {
      return /final standing|Winners bracket|Pick a year|3rd-place game/.test(t);
    }) || "";
    const filter = document.querySelector("[data-receipt-door-filter]");
    const opts = filter
      ? Array.from(filter.options || []).map((o) => o.textContent + "=" + o.value)
      : [];
    return {
      caption: caption,
      filterLab: filter ? (filter.getAttribute("aria-label") || filter.previousSibling && filter.previousSibling.textContent || "") : "",
      hasYear: !!filter,
      opts,
      list: (document.querySelector(".receipt-portal-list") || document.body).innerText,
      kind: typeof leagueFormat === "function" ? leagueFormat().kind : "",
    };
  });
  console.log("GM CAREER", JSON.stringify({
    kind: gmCareer.kind,
    hasYear: gmCareer.hasYear,
    opts: gmCareer.opts,
    caption: gmCareer.caption.slice(0, 180),
  }, null, 2));
  if (gmCareer.kind !== "redraft") fail("GM How I finished is not redraft");
  if (!gmCareer.hasYear) fail("GM How I finished missing League year picker");
  if (!gmCareer.opts.some((o) => o.indexOf("2024") >= 0)) fail("GM year picker missing 2024");
  if (!/Pick a year for that board/.test(gmCareer.caption)) fail("GM career caption missing year-board copy");
  if (/Winners bracket, then record/.test(gmCareer.caption)) fail("GM career caption leaked dynasty copy");
  await page.screenshot({ path: `${shotDir}/review_gm_how_i_finished_career.png`, fullPage: true });

  await page.evaluate(() => {
    receiptDoorFilter = "y2024";
    render();
  });
  await page.waitForTimeout(400);
  const gm2024 = await page.evaluate(() => {
    const captions = Array.from(document.querySelectorAll("p.caption")).map(function (p) { return p.textContent || ""; });
    const caption = captions.find(function (t) { return /2024 final standings|final standing/.test(t); }) || "";
    return {
      caption: caption,
      list: (document.querySelector(".receipt-portal-list") || document.body).innerText,
    };
  });
  console.log("GM 2024\n" + gm2024.list.split("\n").slice(0, 40).join("\n"));
  if (!/2024 final standings/.test(gm2024.caption)) fail("2024 caption missing");
  if (!/1\.\s*fatassmexican/.test(gm2024.list) && !/1\. fatassmexican/.test(gm2024.list)) {
    if (!/fatassmexican/.test(gm2024.list) || !/Championship/.test(gm2024.list)) {
      fail("2024 board missing Tully championship");
    }
  }
  if (!/kotula69/.test(gm2024.list) || !/3rd-place game/.test(gm2024.list)) fail("2024 missing Kotula 3rd-place");
  if (!/Tbow00/.test(gm2024.list)) fail("2024 missing Tbow");
  if (!/TaylorJohnson16/.test(gm2024.list)) fail("2024 missing Taylor");
  if (!/ztrain123/.test(gm2024.list)) fail("2024 missing ztrain sacko");
  await page.screenshot({ path: `${shotDir}/review_gm_2024_board.png`, fullPage: true });

  await page.evaluate(async () => {
    receiptDoorFilter = "all";
    await openLeagueDashboard({
      sleeper_league_id: "1315431339301806080",
      name: "CuckleChunckle",
    });
  });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    if (typeof setHomeTab === "function") setHomeTab("history", { force: true });
    else homeTab = "history";
    dataDashOpenReport("season_place");
  });
  await page.waitForTimeout(500);
  const cuckle = await page.evaluate(() => {
    const captions = Array.from(document.querySelectorAll("p.caption")).map(function (p) { return p.textContent || ""; });
    const caption = captions.find(function (t) {
      return /Winners bracket|final standing|Pick a year|3rd-place/.test(t);
    }) || "";
    const filter = document.querySelector("[data-receipt-door-filter]");
    return {
      caption: caption,
      hasYear: !!filter,
      filterText: filter ? filter.innerText || filter.textContent : "",
      list: (document.querySelector(".receipt-portal-list") || document.body).innerText,
      kind: typeof leagueFormat === "function" ? leagueFormat().kind : "",
      yearWant: typeof finishYearWant === "function" ? finishYearWant() : "missing",
    };
  });
  console.log("CUCKLE", JSON.stringify({
    kind: cuckle.kind,
    hasYear: cuckle.hasYear,
    yearWant: cuckle.yearWant,
    caption: cuckle.caption.slice(0, 180),
  }, null, 2));
  if (cuckle.kind !== "dynasty") fail("Cuckle How I finished is not dynasty");
  if (cuckle.hasYear) fail("Cuckle How I finished leaked the League year picker");
  if (cuckle.yearWant) fail("Cuckle finishYearWant leaked a year: " + cuckle.yearWant);
  if (!/Winners bracket, then record/.test(cuckle.caption)) fail("Cuckle caption missing dynasty law");
  if (/Pick a year for that board/.test(cuckle.caption)) fail("Cuckle caption still asks to pick a year");
  if (/3rd-place game/.test(cuckle.caption)) fail("Cuckle caption leaked 3rd-place copy");
  await page.screenshot({ path: `${shotDir}/review_cuckle_how_i_finished.png`, fullPage: true });
} finally {
  await browser.close();
  server.close();
}

if (process.exitCode) process.exit(process.exitCode);
console.log("PASS standings review browser");
