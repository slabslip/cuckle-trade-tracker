/**
 * 100-loop coverage of Your board against real Cuckle tape.
 * 10 seats × 10 manager jobs. Each loop asks: can the default 13 doors
 * surface a non-empty, named answer for this seat?
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const UI = path.join(ROOT, "data/ui");
const read = (f) => JSON.parse(fs.readFileSync(path.join(UI, f), "utf8"));

const members = read("members.json");
const titles = read("titles.json");
const picks = read("picks.json");
const cuffs = read("cuffs.json");
const league = read("league.json");
const marks = read("marks.json");
const direction = read("seat-direction.json");
const calc = read("calculator.json");

const DOORS = [
  "lopsided", "trade_mark", "pick_print", "my_picks", "past_champions",
  "season_place", "vs_you", "firsts_held", "forever",
  "passed_around", "seat_draft", "uninsured", "book_top",
];
const PARKED_DEAL = [
  "fill_holes", "move_extras", "poach_cuffs", "stash_young",
  "my_block", "league_block", "block_fits", "held_picks",
  "available_cuffs", "my_cuffs", "seat_manners", "seat_run",
];

function pickParts(key) {
  const m = String(key || "").match(/^pick:(\d{4}):(\d+):/);
  if (!m) return null;
  return { season: m[1], round: Number(m[2]) };
}
function windowDelta(side, key) {
  const w = side && side.windows && side.windows[key];
  if (!w || w.incomplete) return null;
  if (w.got == null || w.sent == null) return null;
  return w.got - w.sent;
}
function pickOwner(p) {
  const hops = (p && p.hops) || [];
  if (hops.length) return hops[hops.length - 1].to || "";
  return originOf(p);
}
function everOwned(p, seat) {
  if (!p || !seat) return false;
  if (p.used_by === seat) return true;
  if (originOf(p) === seat) return true;
  const hops = p.hops || [];
  for (let i = 0; i < hops.length; i++) {
    if (hops[i].from === seat || hops[i].to === seat) return true;
  }
  return false;
}
function originOf(p) {
  const label = (p && p.label) || "";
  const m = /\(([^)]+)\)\s*$/.exec(label);
  if (m) return m[1];
  const hops = (p && p.hops) || [];
  return hops.length ? (hops[0].from || "") : "";
}

const sides = (league.trade_boards && league.trade_boards.sides) || [];
const lists = league.player_lists || {};
const bookPlayers = (calc.players || []).concat(calc.picks || []);
const titleRows = titles.titles || [];

function mePath(uid) {
  const p = path.join(UI, "me", uid + ".json");
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
}

function score(ok, note, door) {
  return { status: ok ? "hit" : "miss", note, door };
}

function jobSmash(seat) {
  const hit = sides.find((s) => (s.name === seat || s.other === seat) && windowDelta(s, "t0") != null);
  const d = hit ? Math.round(windowDelta(hit, "t0")) : null;
  return score(!!hit, hit ? (hit.name + " vs " + hit.other + " t0 " + d) : "no accept-day row", "lopsided");
}
function jobAged(seat) {
  const hit = sides.find((s) => {
    if (s.name !== seat && s.other !== seat) return false;
    return windowDelta(s, "all") != null && windowDelta(s, "t0") != null;
  });
  const aged = hit ? Math.round(windowDelta(hit, "all") - windowDelta(hit, "t0")) : null;
  return score(!!hit, hit ? "aged " + aged : "no aged row", "trade_mark");
}
function jobOwnedPicks(seat) {
  const keys = Object.keys(picks);
  let n = 0;
  let sample = "";
  for (let i = 0; i < keys.length; i++) {
    const p = picks[keys[i]];
    if (everOwned(p, seat)) {
      n += 1;
      if (!sample && p.became) sample = keys[i] + " → " + p.became;
    }
  }
  return score(n > 0, n + " owned" + (sample ? " · " + sample : ""), "pick_print");
}
function jobOriginPicks(seat) {
  const keys = Object.keys(picks);
  let n = 0;
  let sample = "";
  for (let i = 0; i < keys.length; i++) {
    const p = picks[keys[i]];
    if (originOf(p) === seat) {
      n += 1;
      if (!sample) sample = keys[i] + (p.became ? " → " + p.became : "");
    }
  }
  return score(n > 0, n + " origin" + (sample ? " · " + sample : ""), "my_picks");
}
function jobTitles(seat) {
  const won = titleRows.filter((t) => t.name === seat);
  return score(titleRows.length > 0, won.length ? won.map((t) => t.season).join(",") : "league has titles, this seat has 0", "past_champions");
}
function jobFinish(mem) {
  return score(mem.place != null, (mem.place_season || "?") + " · " + mem.place, "season_place");
}
function jobVs(mem) {
  const me = mePath(mem.user_id);
  const partners = (me && me.partners) || [];
  const top = partners[0];
  return score(partners.length > 0, top ? (top.name + " · " + top.trades + " deals") : "no partners file", "vs_you");
}
function jobFirsts(seat) {
  const keys = Object.keys(picks);
  let n = 0;
  const years = [];
  for (let i = 0; i < keys.length; i++) {
    const p = picks[keys[i]];
    const parts = pickParts(keys[i]);
    if (!parts || parts.round !== 1) continue;
    if (!p.still_pick) continue;
    const owner = pickOwner(p);
    if (owner !== seat) continue;
    n += 1;
    years.push(parts.season);
  }
  // Zero firsts is a real answer (tank / win-now). Door currently omits the row.
  return {
    status: "hit",
    note: n + " firsts" + (years.length ? " · " + years.sort().join(",") : " · ZERO — door hides this seat"),
    door: "firsts_held",
    hiddenZero: n === 0,
  };
}
function jobForever(seat) {
  const rows = (lists.forever || []).filter((r) => r.team === seat);
  return score(true, rows.length ? rows.slice(0, 2).map((r) => r.name).join(", ") : "none on this seat", "forever");
}
function jobDepthFlow(mem) {
  const mine = ((cuffs && cuffs.rows) || []).filter((r) => String(r.owner_id) === String(mem.user_id) && !r.cuff_owned);
  const ownedNames = new Set(bookPlayers.filter((a) => String(a.owner_id) === String(mem.user_id)).map((a) => a.name));
  const passed = (lists.most_traded || []).filter((r) => ownedNames.has(r.name) || r.team === mem.name);
  const draft = marks.seats && marks.seats[mem.user_id] && marks.seats[mem.user_id].draft;
  const bits = [];
  if (mine.length) bits.push(mine.length + " uninsured · cuff hidden as 'No cuff'");
  if (passed.length) bits.push("holds " + passed[0].name);
  if (draft) bits.push("draft " + (draft.title || draft.hit || draft.sort || "row"));
  return {
    status: bits.length ? "hit" : "miss",
    note: bits.join(" · ") || "no cuff / passed / draft row",
    door: mine.length ? "uninsured" : (passed.length ? "passed_around" : "seat_draft"),
    cuffNameHidden: mine.some((r) => r.cuff),
  };
}

const JOBS = [
  ["smash_day", (m) => jobSmash(m.name)],
  ["aged_deal", (m) => jobAged(m.name)],
  ["pick_became", (m) => jobOwnedPicks(m.name)],
  ["origin_picks", (m) => jobOriginPicks(m.name)],
  ["who_won", (m) => jobTitles(m.name)],
  ["last_finish", (m) => jobFinish(m)],
  ["vs_them", (m) => jobVs(m)],
  ["future_firsts", (m) => jobFirsts(m.name)],
  ["forever_home", (m) => jobForever(m.name)],
  ["depth_or_flow", (m) => jobDepthFlow(m)],
];

const loops = [];
let n = 0;
for (let s = 0; s < members.length; s++) {
  const mem = members[s];
  for (let j = 0; j < JOBS.length; j++) {
    n += 1;
    const [job, fn] = JOBS[j];
    const r = fn(mem);
    loops.push({ n, seat: mem.name, job, ...r });
  }
}

const hits = loops.filter((r) => r.status === "hit").length;
const misses = loops.filter((r) => r.status === "miss").length;
const hiddenZeros = loops.filter((r) => r.hiddenZero).length;
const cuffHidden = loops.filter((r) => r.cuffNameHidden).length;

const byJob = {};
for (let i = 0; i < loops.length; i++) {
  const r = loops[i];
  if (!byJob[r.job]) byJob[r.job] = { hit: 0, miss: 0, notes: [] };
  byJob[r.job][r.status] += 1;
  if (r.hiddenZero || r.cuffNameHidden || r.status === "miss") byJob[r.job].notes.push(r.seat + ": " + r.note);
}

const parkedNeed = [];
for (let s = 0; s < members.length; s++) {
  const d = (direction.seats || []).find((x) => String(x.seat_user_id) === String(members[s].user_id));
  if (d && (d.holes || []).length) parkedNeed.push(members[s].name + " holes " + d.holes.join("/"));
  if (d && d.label === "Hard rebuild") parkedNeed.push(members[s].name + " " + d.label + " — Give/Get parked");
}

const out = {
  loops: n,
  doors_on_board: DOORS,
  parked_deal_ids: PARKED_DEAL,
  hit: hits,
  miss: misses,
  hidden_zero_firsts: hiddenZeros,
  uninsured_cuff_name_hidden: cuffHidden,
  by_job: byJob,
  parked_pressure: parkedNeed,
  sample_misses: loops.filter((r) => r.status === "miss").slice(0, 12),
};
console.log(JSON.stringify(out, null, 2));
if (n !== 100) {
  console.error("expected 100 loops, got", n);
  process.exit(1);
}
