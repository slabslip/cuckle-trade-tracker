import assert from "node:assert/strict";
import {
  pythagWinPct,
  winProb,
  pickSlotFromFinish,
  projectFinishBook,
  formAdjPyth,
  summarizeFormByRoster,
  scoreFormLeague,
  PATH_WEIGHT,
  ARC_WEIGHT,
  FORM_WEIGHT,
} from "./lib/projected-finish.mjs";

assert.ok(pythagWinPct(1000, 800) > 0.5);
assert.ok(pythagWinPct(800, 1000) < 0.5);
assert.equal(Math.round(winProb(0.6, 0.4) * 100), 60);
assert.equal(pickSlotFromFinish(10, 10), 1);
assert.equal(pickSlotFromFinish(1, 10), 10);
assert.equal(pickSlotFromFinish(5, 10), 6);
assert.ok(PATH_WEIGHT >= 0.30);
assert.ok(ARC_WEIGHT >= 0.1);
assert.ok(FORM_WEIGHT >= 0.1);
assert.ok(formAdjPyth(0.5, 1.5, 1.5) > 0.5);
assert.ok(formAdjPyth(0.5, -1.5, -1.5) < 0.5);

const book = projectFinishBook({
  rosters: [
    { roster_id: 1, owner_id: "a", settings: { wins: 5, losses: 1, fpts: 1000, fpts_against: 800 } },
    { roster_id: 2, owner_id: "b", settings: { wins: 1, losses: 5, fpts: 700, fpts_against: 900 } },
  ],
  ownerByRoster: { 1: "a", 2: "b" },
  nameByUser: { a: "Alpha", b: "Beta" },
  remainingPairs: [[1, 2], [1, 2]],
  teams: 2,
  season: 2026,
  week: 6,
  playoffWeekStart: 15,
});

assert.equal(book.v, 3);
assert.equal(book.seats[0].name, "Alpha");
assert.equal(book.seats[0].proj_finish, 1);
assert.equal(book.seats[0].proj_slot, 2);
assert.equal(book.seats[1].proj_finish, 2);
assert.equal(book.seats[1].proj_slot, 1);
assert.equal(book.seats[1].band, "Early");
assert.ok(book.seats[0].expected_wins > book.seats[1].expected_wins);

// Soft board: same record, but Beta has the easy remaining slate + climb history.
// Alpha has the brutal slate + fade history. Projection should move Beta ahead.
const movers = projectFinishBook({
  rosters: [
    {
      roster_id: 1,
      owner_id: "lead",
      settings: { wins: 3, losses: 3, fpts: 900, fpts_against: 880, fpts_decimal: 0 },
    },
    {
      roster_id: 2,
      owner_id: "chase",
      settings: { wins: 3, losses: 3, fpts: 860, fpts_against: 900, fpts_decimal: 0 },
    },
    {
      roster_id: 3,
      owner_id: "tank",
      settings: { wins: 1, losses: 5, fpts: 700, fpts_against: 950, fpts_decimal: 0 },
    },
  ],
  ownerByRoster: { 1: "lead", 2: "chase", 3: "tank" },
  nameByUser: { lead: "LeadNow", chase: "ChaseArc", tank: "TankSoft" },
  // Lead draws Tank (hard) twice; Chase draws Lead then gets easier? Actually need
  // Chase to face the weak tank more. Lead faces Chase+Chase; Chase faces Lead+Tank; Tank faces Chase+Lead.
  // Better: Lead vs Chase, Lead vs Chase, Chase vs Tank, Chase vs Tank → Chase gets two easy Tank games.
  remainingPairs: [
    [1, 2],
    [1, 2],
    [2, 3],
    [2, 3],
    [1, 3],
    [1, 3],
  ],
  teams: 3,
  season: 2026,
  week: 6,
  playoffWeekStart: 15,
  arcByUser: {
    lead: { avg_climb: -2, fast_fade_rate: 0.5, slow_burn_rate: 0, n: 6 },
    chase: { avg_climb: 2, fast_fade_rate: 0, slow_burn_rate: 0.4, n: 6 },
    tank: { avg_climb: 0, fast_fade_rate: 0, slow_burn_rate: 0, n: 6 },
  },
});

const byName = Object.fromEntries(movers.seats.map((s) => [s.name, s]));
assert.equal(byName.LeadNow.place_now, 1, "Lead owns place now on PF");
assert.ok(
  byName.ChaseArc.proj_finish < byName.LeadNow.proj_finish,
  "ChaseArc should project ahead of LeadNow on path+ease+arc",
);
assert.ok(byName.ChaseArc.delta_place > 0, "ChaseArc climbs vs place now");
assert.ok(movers.seats.some((s) => s.delta_place !== 0), "v2 book must move at least one seat");

// Form: same race + slate, but Over clears proj every week and Under misses.
// Projection / remaining leans must favor Over — not raw PF/PA alone.
const formRows = scoreFormLeague(summarizeFormByRoster({
  1: [
    { week: 1, actual: 120, proj: 100, delta: 20 },
    { week: 2, actual: 125, proj: 100, delta: 25 },
    { week: 3, actual: 130, proj: 105, delta: 25 },
    { week: 4, actual: 128, proj: 102, delta: 26 },
  ],
  2: [
    { week: 1, actual: 90, proj: 110, delta: -20 },
    { week: 2, actual: 88, proj: 112, delta: -24 },
    { week: 3, actual: 85, proj: 108, delta: -23 },
    { week: 4, actual: 92, proj: 115, delta: -23 },
  ],
}));
assert.ok(formRows["1"].form_delta > 0);
assert.ok(formRows["2"].form_delta < 0);

const formBook = projectFinishBook({
  rosters: [
    {
      roster_id: 1,
      owner_id: "over",
      settings: { wins: 3, losses: 3, fpts: 900, fpts_against: 900 },
    },
    {
      roster_id: 2,
      owner_id: "under",
      settings: { wins: 3, losses: 3, fpts: 900, fpts_against: 900 },
    },
  ],
  ownerByRoster: { 1: "over", 2: "under" },
  nameByUser: { over: "OverProj", under: "UnderProj" },
  remainingPairs: [[1, 2], [1, 2], [1, 2], [1, 2]],
  teams: 2,
  season: 2026,
  week: 4,
  playoffWeekStart: 15,
  formByRoster: formRows,
});
const formBy = Object.fromEntries(formBook.seats.map((s) => [s.name, s]));
assert.ok(formBy.OverProj.proj_finish < formBy.UnderProj.proj_finish, "over-proj seat ranks ahead");
assert.ok(
  formBy.OverProj.expected_remaining_wins > formBy.UnderProj.expected_remaining_wins,
  "over-proj seat gets better remaining leans",
);
assert.ok(formBy.OverProj.form_delta > 0);
assert.ok(formBy.UnderProj.form_delta < 0);
assert.ok(
  formBy.OverProj.remaining[0].p_win > 0.55,
  "matchup lean must credit form, not sit at coin-flip",
);

console.log("projected-finish.test.mjs ok", {
  lead: byName.LeadNow.proj_finish,
  chase: byName.ChaseArc.proj_finish,
  deltas: movers.seats.map((s) => s.name + ":" + s.delta_place),
  form: {
    over: formBy.OverProj.proj_finish,
    under: formBy.UnderProj.proj_finish,
    lean: formBy.OverProj.remaining[0].p_win,
  },
});
