import { chromium } from "/tmp/node_modules/playwright/index.mjs";
import fs from "node:fs";

const shotDir = "/opt/cursor/artifacts/screenshots";
fs.mkdirSync(shotDir, { recursive: true });
const host = process.env.OVERNIGHT_HOST || "http://127.0.0.1:55494";

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: false,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--window-size=390,844"],
});
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});

function fail(msg) {
  console.error("FAIL " + msg);
  process.exitCode = 1;
}

try {
  await page.goto(host + "/design-league-home.html", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(".overnight-slip", { timeout: 25000 });
  await page.waitForTimeout(600);
  const home = await page.locator(".overnight-slip").innerText();
  console.log("HOME LETTER\n" + home);
  if (!/Quiet night|trade last night|Wire moved/i.test(home)) fail("Home letter missing lede");
  if (/Last deal|No trades last night/i.test(home)) fail("Collapsed letter must hide trades / last deal");
  if (!/^OUT\b/m.test(home) || !/^IR\b/m.test(home)) fail("Home letter missing Out / IR bands");
  if (!/DJ Moore/i.test(home) || !/Michael Pittman/i.test(home)) fail("Collapsed Out must lead with Sunday starters");
  if (!/Nico Collins/i.test(home) || !/cuff unowned/i.test(home)) fail("Nico Out must name cuff unowned");
  if (!/Show all/i.test(home)) fail("Home letter missing expandable Show all");
  if (!(await page.locator(".overnight-slip").count())) fail("Home letter missing");
  if (await page.locator(".overnight-slip .sch-kv").count()) fail("Home letter must not show the settings grid");
  if (await page.locator(".sch-meters.four").count()) fail("Collapsed letter must hide meters");
  if (/Text this|That's not how I remember/i.test(home)) fail("Home letter still has Text this");
  const chip = page.locator("[data-overnight-share]");
  if (!(await chip.count())) fail("Home gold share chip missing");
  await page.screenshot({ path: `${shotDir}/overnight-home.png` });

  const more = page.locator("[data-overnight-more]");
  if (!(await more.count())) fail("Show all is not a button");
  await more.first().click();
  await page.waitForTimeout(400);
  const open = await page.locator(".overnight-slip").innerText();
  console.log("HOME EXPANDED\n" + open);
  if (/Show all/i.test(open)) fail("Show all still visible after expand");
  if (!/Show less/i.test(open)) fail("Expanded letter missing Show less");
  if (!/Last deal|No trades last night|sent /i.test(open)) fail("Expanded letter missing trades / last deal");
  if ((open.match(/\n/g) || []).length <= (home.match(/\n/g) || []).length) {
    fail("Expand did not reveal more rows");
  }
  const payload = await page.evaluate(function () {
    return {
      text: typeof overnightShareText === "function" ? overnightShareText() : "",
      url: typeof overnightShareUrl === "function" ? overnightShareUrl() : "",
      open: typeof overnightOpen !== "undefined" ? overnightOpen : false,
    };
  });
  console.log("SHARE\n" + payload.text + "\n" + payload.url);
  if (!payload.url.includes("r=overnight") || !payload.url.includes("src=share")) {
    fail("share URL must be ?r=overnight&src=share");
  }
  if (!/Out · /.test(payload.text) || !/IR · /.test(payload.text)) {
    fail("share text must use Out / IR titles");
  }
  if (!/A\.J\. Brown/.test(payload.text) || (payload.text.match(/ · /g) || []).length < 8) {
    fail("expanded share must send the full lists");
  }
  if (!/Nico Collins · WR · TipsUp · cuff unowned/.test(payload.text)) {
    fail("share must send Nico cuff unowned");
  }
  if (/\+\d+ more/.test(payload.text)) fail("full share must not say + more");
  if (/Text this|That's not how I remember/i.test(payload.text)) fail("share text still has Text this");
  await page.locator(".overnight-slip").screenshot({ path: `${shotDir}/overnight-home-open.png` });

  await page.evaluate(function () {
    if (typeof openMyTeamHome === "function") openMyTeamHome();
  });
  await page.waitForSelector(".team-schematic", { timeout: 25000 });
  await page.waitForTimeout(500);
  const analyzer = await page.locator(".team-schematic").innerText();
  console.log("TEAM ANALYZER\n" + analyzer);
  if (!/Starting lineup/i.test(analyzer)) fail("Team analyzer missing starting lineup");
  if (!/Cornerstones/i.test(analyzer)) fail("Team analyzer missing cornerstones");
  if (!/Depth score/i.test(analyzer)) fail("Team analyzer missing depth score");
  if (!/Draft capital/i.test(analyzer)) fail("Team analyzer missing draft capital");
  if (!(await page.locator(".team-sch-grades").count())) fail("Team analyzer missing positional grades");
  if (!(await page.locator("[data-analyzer-share]").count())) fail("Team analyzer missing image share chip");
  const analyzerBg = await page.locator(".team-schematic").evaluate((el) => getComputedStyle(el).backgroundColor);
  if (!/rgb\(18,\s*18,\s*20\)/.test(analyzerBg)) fail("Team analyzer must use dashboard chrome, not navy");
  await page.locator(".team-schematic").screenshot({ path: `${shotDir}/team-analyzer.png` });
  await page.screenshot({ path: `${shotDir}/team-analyzer-home.png` });

  const guest = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  const guestPage = await guest.newPage();
  await guestPage.goto(host + "/index.html?r=overnight&league=1315431339301806080&src=share", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await guestPage.waitForSelector(".overnight-slip", { timeout: 25000 });
  await guestPage.waitForTimeout(600);
  const ticket = await guestPage.locator(".overnight-slip").innerText();
  console.log("PUBLIC LETTER\n" + ticket);
  if (!/Quiet night|trade last night|Wire moved/i.test(ticket)) fail("Public letter missing lede");
  if (/Last deal|No trades last night/i.test(ticket)) fail("Public collapsed letter must hide last deal");
  if (!/^OUT\b/m.test(ticket) || !/^IR\b/m.test(ticket)) fail("Public letter missing Out / IR bands");
  if (!(await guestPage.locator(".receipt-cta").count())) fail("Unsigned overnight ticket missing claim CTA");
  await guestPage.screenshot({ path: `${shotDir}/overnight-share.png` });
  await guest.close();
} finally {
  await browser.close();
}

if (process.exitCode) process.exit(process.exitCode);
console.log("PASS overnight letter");
