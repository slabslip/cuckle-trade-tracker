#!/usr/bin/env node
/** Map pick:year:round:origin_roster → slot + drafted player. Official Sleeper GETs. */
import { readJson, setLeagueId, sleeperGet, writeJson, ymd } from "./lib.mjs";

setLeagueId(process.argv[2] || process.env.LEAGUE_ID);

function chooseDraft(drafts) {
  const nfl = drafts.filter((d) => !d.sport || d.sport === "nfl");
  const complete = nfl.filter((d) => d.status === "complete");
  const pool = complete.length ? complete : nfl;
  if (!pool.length) return null;
  const rookie = pool.filter((d) => {
    const rounds = d.settings?.rounds ?? 99;
    return rounds >= 3 && rounds <= 5;
  });
  return (rookie.length ? rookie : pool).sort((a, b) => {
    const ra = a.settings?.rounds ?? 99;
    const rb = b.settings?.rounds ?? 99;
    return ra - rb;
  })[0];
}

async function main() {
  const leagues = readJson("leagues.json", []);
  const seats = readJson("seats.json", []);
  const ownerAt = new Map();
  for (const s of seats) {
    ownerAt.set(`${s.season}:${s.roster_id}`, s.owner_id);
  }

  const draftMeta = [];
  const draftPicks = [];
  const resolutions = [];

  for (const league of leagues) {
    const list = (await sleeperGet(`/league/${league.league_id}/drafts`)) || [];
    const chosen = chooseDraft(list);
    if (!chosen) continue;

    const detail = (await sleeperGet(`/draft/${chosen.draft_id}`)) || chosen;
    const slotToRoster = Object.fromEntries(
      Object.entries(detail.slot_to_roster_id || {}).filter(([k, v]) => k !== "" && v != null),
    );
    const asOf = ymd(detail.last_picked || detail.start_time || detail.created || Date.now());
    const season = String(detail.season || league.season);
    const rounds = detail.settings?.rounds ?? null;

    draftMeta.push({
      draft_id: detail.draft_id,
      league_id: league.league_id,
      season,
      status: detail.status,
      type: detail.type,
      rounds,
      as_of: asOf,
      slot_to_roster_id: slotToRoster,
    });

    if (detail.status !== "complete" && detail.status !== "drafting") {
      continue;
    }

    const picks = (await sleeperGet(`/draft/${detail.draft_id}/picks`)) || [];
    for (const p of picks) {
      if (!p.player_id) continue;
      const draftSlot = p.draft_slot;
      const originRoster = slotToRoster[String(draftSlot)] ?? slotToRoster[draftSlot];
      if (originRoster == null) continue;
      const round = p.round;
      const pickKey = `pick:${season}:${round}:${originRoster}`;
      const playerKey = `player:${p.player_id}`;
      const draftedByRoster = p.roster_id;
      const draftedByUser = ownerAt.get(`${league.season}:${draftedByRoster}`) || null;
      const label = [p.metadata?.first_name, p.metadata?.last_name].filter(Boolean).join(" ")
        || playerKey;

      draftPicks.push({
        draft_id: detail.draft_id,
        season,
        round,
        draft_slot: draftSlot,
        pick_no: p.pick_no,
        origin_roster_id: originRoster,
        roster_id: draftedByRoster,
        drafted_by_user_id: draftedByUser,
        player_id: String(p.player_id),
        label,
        as_of: asOf,
      });

      resolutions.push({
        pick_key: pickKey,
        as_of: asOf,
        kind: "slot",
        draft_slot: draftSlot,
        pick_no: p.pick_no,
        draft_id: detail.draft_id,
      });
      resolutions.push({
        pick_key: pickKey,
        as_of: asOf,
        kind: "player",
        player_key: playerKey,
        label,
        pick_no: p.pick_no,
        draft_slot: draftSlot,
        drafted_by_roster_id: draftedByRoster,
        drafted_by_user_id: draftedByUser,
        draft_id: detail.draft_id,
      });
    }
  }

  writeJson("drafts.json", draftMeta);
  writeJson("draft_picks.json", draftPicks);
  writeJson("asset_resolutions.json", resolutions);

  const playerRes = resolutions.filter((r) => r.kind === "player");
  console.log(
    JSON.stringify(
      {
        drafts: draftMeta.length,
        draft_picks: draftPicks.length,
        resolutions: resolutions.length,
        picks_resolved: playerRes.length,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
