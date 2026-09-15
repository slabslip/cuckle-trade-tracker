import { chromium } from "/tmp/node_modules/playwright/index.mjs";
import fs from "node:fs";

const shotDir = "/opt/cursor/artifacts/screenshots";
fs.mkdirSync(shotDir, { recursive: true });

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

async function openFinishDoor(url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("[data-lh-menu], .home-you-name, .lh-calc-door", { timeout: 25000 });
  await page.waitForTimeout(800);
  const menu = page.locator("[data-lh-menu]");
  if (await menu.count()) {
    await menu.first().click();
    await page.waitForTimeout(300);
  }
  const data = page.locator('[data-lh-menu-go="data"]');
  if (!(await data.count())) fail("League Data menu missing at " + url);
  await data.first().click();
  await page.waitForSelector('[data-dash-open="season_place"], .door-lab', { timeout: 15000 });
  await page.waitForTimeout(400);
  const door = page.locator('[data-dash-open="season_place"]');
  if (!(await door.count())) fail("How I finished door missing at " + url);
  await door.first().click();
  await page.waitForSelector(".receipt-portal-list .row, .receipt-portal-list .names", { timeout: 10000 });
  await page.waitForTimeout(400);
}

try {
  await openFinishDoor("http://127.0.0.1:55493/design-redraft-home.html");
  const gm = await page.locator(".receipt-portal-list").innerText();
  console.log("GM FINISHES\n" + gm);
  if (!/Biff34/.test(gm) || !/1\.0 avg/.test(gm) || !/1 season/.test(gm) || !/2025 1st/.test(gm)) {
    fail("Gm list missing Biff 1.0 avg / 1 season / 2025 1st");
  }
  if (!/TrumanCooper/.test(gm) || !/10\.0 avg/.test(gm) || !/2025 10th/.test(gm)) {
    fail("Gm list missing Truman 10.0 avg");
  }
  if (!/JnastyGBE300/.test(gm) || !/2\.0 avg/.test(gm)) fail("Gm list missing Jnasty 2.0 avg");
  if (/SethHenry12/.test(gm)) fail("Gm list must omit Seth (no completed season)");
  const caption = await page.locator(".receipt-who caption, .caption").first().innerText().catch(() => "");
  console.log("GM CAPTION " + caption);
  await page.screenshot({ path: `${shotDir}/finishes-gm.png`, fullPage: true });

  await openFinishDoor("http://127.0.0.1:55493/design-league-home.html");
  const ck = await page.locator(".receipt-portal-list").innerText();
  console.log("CUCKLE FINISHES\n" + ck);
  if (!/SF69erss/.test(ck) || !/avg/.test(ck) || !/season/.test(ck)) {
    fail("Cuckle list missing a ranked average and season count");
  }
  if (!/2025/.test(ck)) fail("Cuckle list missing yearly places");
  await page.screenshot({ path: `${shotDir}/finishes-cuckle.png`, fullPage: true });
} finally {
  await browser.close();
}

if (process.exitCode) process.exit(process.exitCode);
console.log("PASS finishes doors");
