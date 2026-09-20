import { chromium } from "/tmp/node_modules/playwright/index.mjs";
import fs from "node:fs";

const shotDir = "/opt/cursor/artifacts/screenshots";
fs.mkdirSync(shotDir, { recursive: true });
const host = process.env.OVERNIGHT_HOST || "http://127.0.0.1:8765";

const seats = [
  { name: "TrumanCooper", uid: "458342725222133760", draft: 4, overall: 5, note: "13 picks" },
  { name: "ARae", uid: "458004578168729600", draft: 5, overall: 5, note: "19 picks" },
  { name: "TipsUp", uid: "457784547094818816", draft: 1, overall: 6, note: "2 picks" },
];

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
  await page.waitForSelector(".overnight-slip, .team-schematic, .screen-h", { timeout: 25000 });
  await page.waitForTimeout(800);

  for (const seat of seats) {
    await page.evaluate((uid) => {
      if (typeof openMyTeamHome === "function") openMyTeamHome(uid);
    }, seat.uid);
    await page.waitForSelector(".team-schematic", { timeout: 25000 });
    await page.waitForTimeout(700);
    const text = await page.locator(".team-schematic").innerText();
    console.log("ANALYZER " + seat.name + "\n" + text + "\n");
    if (!/Draft capital/i.test(text)) fail(seat.name + " missing Draft capital");
    if (!/top 12 scored like roster slots/i.test(text)) fail(seat.name + " missing 12-slot draft note");
    if (/Short a starter/i.test(text)) fail(seat.name + " depth note must name backups, not a starter hole");
    const grades = await page.evaluate((uid) => {
      const card = typeof teamAnalyzerCard === "function" ? teamAnalyzerCard(uid) : null;
      return card ? {
        name: card.name,
        overall: card.overall,
        draft: card.draft,
        grades: card.grades,
        pick_n: card.pick_n,
        depth: card.depth && card.depth.score,
      } : null;
    }, seat.uid);
    console.log("CARD " + JSON.stringify(grades));
    if (!grades) fail(seat.name + " card missing");
    if (grades.draft !== seat.draft) fail(seat.name + " draft " + grades.draft + " != " + seat.draft);
    if (grades.overall !== seat.overall) fail(seat.name + " overall " + grades.overall + " != " + seat.overall);
    if (!/rgb\(18,\s*18,\s*20\)/.test(await page.locator(".team-schematic").evaluate((el) => getComputedStyle(el).backgroundColor))) {
      fail(seat.name + " analyzer is not dashboard chrome");
    }
    const slug = seat.name.toLowerCase();
    await page.locator(".team-schematic").screenshot({ path: `${shotDir}/analyzer-${slug}.png` });
    await page.screenshot({ path: `${shotDir}/analyzer-${slug}-home.png` });
    const png = await page.evaluate((uid) => {
      const canvas = teamAnalyzerShareDraw(uid);
      if (!canvas) return null;
      return {
        w: canvas.width,
        h: canvas.height,
        data: canvas.toDataURL("image/png"),
      };
    }, seat.uid);
    if (!png || !png.data) fail(seat.name + " share PNG missing");
    else if (png.w !== 1080 || png.h < 1400) fail(seat.name + " share PNG is not a full card " + png.w + "x" + png.h);
    else {
      const buf = Buffer.from(png.data.replace(/^data:image\/png;base64,/, ""), "base64");
      fs.writeFileSync(`${shotDir}/share-${slug}.png`, buf);
      console.log("PNG " + seat.name + " " + png.w + "x" + png.h + " " + buf.length);
    }
  }

  const homeBg = await page.locator(".team-schematic").evaluate((el) => getComputedStyle(el).backgroundColor);
  console.log("chrome " + homeBg);
} finally {
  await browser.close();
}

if (process.exitCode) process.exit(process.exitCode);
console.log("ok");
