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
  await page.waitForSelector(".overnight-slip, .lh-calc-door", { timeout: 25000 });
  await page.waitForSelector(".overnight-slip", { timeout: 15000 });
  await page.waitForTimeout(600);
  const home = await page.locator(".overnight-slip").innerText();
  console.log("HOME LETTER\n" + home);
  if (!/Quiet night|trade last night|Wire moved/i.test(home)) fail("Home letter missing lede");
  if (!/No trades last night|sent /.test(home)) fail("Home letter missing trades / last deal");
  if (!/On IR\s*\/\s*Out/i.test(home)) fail("Home letter missing IR board");
  if (!/A\.J\. Brown/.test(home)) fail("Home letter missing A.J. Brown");
  if (/Text this|That's not how I remember/i.test(home)) fail("Home letter still has Text this");
  const chip = page.locator("[data-overnight-share]");
  if (!(await chip.count())) fail("Home gold share chip missing");
  const payload = await page.evaluate(function () {
    return {
      text: typeof overnightShareText === "function" ? overnightShareText() : "",
      url: typeof overnightShareUrl === "function" ? overnightShareUrl() : "",
    };
  });
  console.log("SHARE\n" + payload.text + "\n" + payload.url);
  if (!payload.url.includes("r=overnight") || !payload.url.includes("src=share")) {
    fail("share URL must be ?r=overnight&src=share");
  }
  if (!/Quiet night/.test(payload.text) || !/A\.J\. Brown/.test(payload.text)) {
    fail("share text must be the league letter");
  }
  if (/Text this|That's not how I remember/i.test(payload.text)) {
    fail("share text still has Text this");
  }
  await page.screenshot({ path: `${shotDir}/overnight-home.png` });

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
  if (!/A\.J\. Brown/.test(ticket)) fail("Public letter missing A.J. Brown");
  if (!/On IR\s*\/\s*Out/i.test(ticket)) fail("Public letter missing IR board");
  if (!(await guestPage.locator(".receipt-cta").count())) fail("Unsigned overnight ticket missing claim CTA");
  await guestPage.screenshot({ path: `${shotDir}/overnight-share.png` });
  await guest.close();
} finally {
  await browser.close();
}

if (process.exitCode) process.exit(process.exitCode);
console.log("PASS overnight letter");
