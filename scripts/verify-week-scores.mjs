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

async function openBoard(url) {
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
  await page.waitForSelector('[data-dash-open="week_scores"], .door-lab', { timeout: 15000 });
  await page.waitForTimeout(400);
}

try {
  await openBoard("http://127.0.0.1:55493/design-redraft-home.html");
  const door = page.locator('[data-dash-open="week_scores"]');
  if (!(await door.count())) fail("Week scores door missing on Gm board");
  const doorText = await door.innerText();
  if (!/Week scores/.test(doorText)) fail("Week scores label missing: " + doorText);
  await page.screenshot({ path: `${shotDir}/week-scores-gm-board.png` });
  await door.first().click();
  await page.waitForSelector("text=Highest weeks", { timeout: 10000 });
  await page.waitForSelector("text=Lowest weeks", { timeout: 5000 });
  const allText = await page.locator(".receipt-portal-list").innerText();
  console.log("GM ALL\n" + allText);
  if (!allText.includes("Aballers") || !allText.includes("177.96")) fail("Gm high missing Aballers 177.96");
  if (!allText.includes("JnastyGBE300") || !allText.includes("34.82")) fail("Gm low missing JnastyGBE300 34.82");
  if (allText.includes("44.58") || allText.includes("45.70")) fail("Gm all lists still show consolation leftovers");
  await page.screenshot({ path: `${shotDir}/week-scores-gm-all.png`, fullPage: true });

  await page.selectOption("[data-receipt-door-filter]", "regular");
  await page.waitForTimeout(200);
  const regText = await page.locator(".receipt-portal-list").innerText();
  console.log("GM REGULAR\n" + regText);
  if (!regText.includes("172.08") || !regText.includes("34.82")) fail("Gm regular lists lost the extremes");
  if (regText.includes("163.38")) fail("Gm regular still shows playoff 163.38");

  await page.selectOption("[data-receipt-door-filter]", "playoff");
  await page.waitForTimeout(200);
  const poText = await page.locator(".receipt-portal-list").innerText();
  console.log("GM PLAYOFF\n" + poText);
  if (!poText.includes("163.38") || !poText.includes("85.28")) fail("Gm playoff lists wrong");
  if (poText.includes("44.58") || poText.includes("157.58") || poText.includes("45.70") || poText.includes("week 18")) {
    fail("Gm playoff lists still show consolation / leftover weeks");
  }
  await page.screenshot({ path: `${shotDir}/week-scores-gm-playoff.png`, fullPage: true });

  await page.goto("http://127.0.0.1:55493/design-league-home.html", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("[data-lh-menu], .home-you-name, .lh-calc-door", { timeout: 25000 });
  await page.waitForTimeout(800);
  if (await page.locator("[data-lh-menu]").count()) await page.locator("[data-lh-menu]").first().click();
  await page.waitForTimeout(300);
  if (await page.locator('[data-lh-menu-go="data"]').count()) {
    await page.locator('[data-lh-menu-go="data"]').first().click();
    await page.waitForSelector('[data-dash-open="week_scores"]', { timeout: 15000 });
    await page.screenshot({ path: `${shotDir}/week-scores-cuckle-board.png` });
    await page.locator('[data-dash-open="week_scores"]').first().click();
    await page.waitForSelector("text=Highest weeks", { timeout: 10000 });
    const cuckle = await page.locator(".receipt-portal-list").innerText();
    console.log("CUCKLE ALL\n" + cuckle);
    if (!cuckle.includes("bigjberg") || !cuckle.includes("278.93")) fail("Cuckle high missing bigjberg 278.93");
    if (!cuckle.includes("BubbaCuckShremp") || !cuckle.includes("30.00")) fail("Cuckle low missing BubbaCuckShremp 30.00");
    if (cuckle.includes("5.04")) fail("Cuckle all lists still show week 18 leftover 5.04");
    await page.screenshot({ path: `${shotDir}/week-scores-cuckle-all.png`, fullPage: true });
  } else {
    fail("Cuckle League Data menu missing");
  }
} catch (err) {
  console.error(err);
  await page.screenshot({ path: `${shotDir}/week-scores-error.png`, fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
if (!process.exitCode) console.log("OK week scores door");
