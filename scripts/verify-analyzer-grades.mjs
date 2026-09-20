import { chromium } from "/tmp/node_modules/playwright/index.mjs";
import fs from "node:fs";

const shotDir = "/tmp/analyzer-shots";
fs.mkdirSync(shotDir, { recursive: true });
const pubDir = "/opt/cursor/artifacts/screenshots";
try { fs.mkdirSync(pubDir, { recursive: true }); } catch (e) { /* optional */ }
const host = process.env.OVERNIGHT_HOST || "http://127.0.0.1:8765";

const seats = [
  { name: "TrumanCooper", uid: "458342725222133760", draft: 5, overall: 4, now: 5, later: 4, label: "Rebuild", note: "13 picks" },
  { name: "ARae", uid: "458004578168729600", draft: 8, overall: 6, now: 6, later: 6, label: "Hard tank", note: "19 picks" },
  { name: "TipsUp", uid: "457784547094818816", draft: 0, overall: 7, now: 8, later: 1, label: "Win now", note: "2 picks" },
  { name: "SF69erss", uid: "457779824002330624", draft: 2, overall: 7, now: 8, later: 2, label: "Win now · reload", note: "10 picks" },
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
    if (!/\bNOW\b/.test(text) || !/\bLATER\b/.test(text)) fail(seat.name + " missing Now / Later");
    if (!/this year's desk/i.test(text)) fail(seat.name + " missing Now desk note");
    if (!/next two drafts \+ book/i.test(text)) fail(seat.name + " missing Later book note");
    if (!/next two drafts weigh most/i.test(text)) fail(seat.name + " missing next-two-drafts note");
    if (/Short a starter/i.test(text)) fail(seat.name + " depth note must name backups, not a starter hole");
    if (!/after the desk/i.test(text)) fail(seat.name + " depth note must say after the desk");
    const grades = await page.evaluate((uid) => {
      const card = typeof teamAnalyzerCard === "function" ? teamAnalyzerCard(uid) : null;
      return card ? {
        name: card.name,
        overall: card.overall,
        now: card.now,
        later: card.later,
        rooms: card.rooms,
        draft: card.draft,
        grades: card.grades,
        pick_n: card.pick_n,
        depth: card.depth && card.depth.score,
        label: card.label,
      } : null;
    }, seat.uid);
    console.log("CARD " + JSON.stringify(grades));
    if (!grades) fail(seat.name + " card missing");
    if (grades.draft !== seat.draft) fail(seat.name + " draft " + grades.draft + " != " + seat.draft);
    if (grades.overall !== seat.overall) fail(seat.name + " overall " + grades.overall + " != " + seat.overall);
    if (grades.now !== seat.now) fail(seat.name + " now " + grades.now + " != " + seat.now);
    if (grades.later !== seat.later) fail(seat.name + " later " + grades.later + " != " + seat.later);
    if (grades.label !== seat.label) fail(seat.name + " window " + grades.label + " != " + seat.label);
    if (!/rgb\(18,\s*18,\s*20\)/.test(await page.locator(".team-schematic").evaluate((el) => getComputedStyle(el).backgroundColor))) {
      fail(seat.name + " analyzer is not dashboard chrome");
    }
    const slug = seat.name.toLowerCase();
    const cardShot = `${shotDir}/analyzer-${slug}.png`;
    const homeShot = `${shotDir}/analyzer-${slug}-home.png`;
    await page.locator(".team-schematic").screenshot({ path: cardShot });
    await page.screenshot({ path: homeShot });
    try {
      fs.copyFileSync(cardShot, `${pubDir}/analyzer-${slug}.png`);
      fs.copyFileSync(homeShot, `${pubDir}/analyzer-${slug}-home.png`);
    } catch (e) { /* artifacts store can EIO */ }
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
      try { fs.writeFileSync(`${pubDir}/share-${slug}.png`, buf); } catch (e) { /* artifacts store can EIO */ }
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
