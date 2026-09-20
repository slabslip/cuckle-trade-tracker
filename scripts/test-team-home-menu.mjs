#!/usr/bin/env node
import fs from "node:fs";

const ROOT = new URL("../", import.meta.url).pathname;
const page = fs.readFileSync(`${ROOT}index.html`, "utf8");
const gen = fs.readFileSync(`${ROOT}generate-page.mjs`, "utf8");

function need(cond, msg) {
  if (!cond) throw new Error(msg);
}

function fnSrc(src, name) {
  const start = src.indexOf("function " + name + "(");
  if (start < 0) return "";
  let i = src.indexOf("{", start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return "";
}

const nav = fnSrc(page, "paintBottomNav");
const genNav = fnSrc(gen, "paintBottomNav");
need(nav.includes("!(me && data)") === false, "gold bar must stay on when a seat is open");
need(nav.includes('view === "home"') && nav.includes('view === "calc"') && nav.includes('view === "trade"'),
  "gold bar still covers league home, calc, and trade");
need(nav.includes('view === "trades"') && nav.includes('view === "partners"') && nav.includes('view === "drafts"'),
  "gold bar must cover the team-home section tabs");
need(nav.includes('appScreen === "settings"') && nav.includes('appScreen === "profile"'),
  "gold bar must stay on settings");
need(fnSrc(page, "paintBottomNav") === genNav, "index.html and generate-page.mjs must share paintBottomNav");
need(page.includes('if (html.indexOf(\'class="lh-actions\') < 0) html += homeChips()')
  && gen.includes('if (html.indexOf(\'class="lh-actions\') < 0) html += homeChips()'),
  "dash render must mount the gold bar when a screen did not already paint it");
need(fnSrc(page, "renderLeagueHome").includes("homeChips()")
  && fnSrc(page, "renderSettings").includes("homeChips()"),
  "league home and settings still compose the gold bar");

console.log(JSON.stringify({ ok: true, bar: "all-league-screens" }));
