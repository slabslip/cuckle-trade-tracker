/**
 * Multi-season manager arcs: early PF rank → final place, early trades,
 * playoff / last-place outcomes, and proxy-first motive on live capital.
 *
 * Cumulative PF rank stands in for mid-season place when W-L by week is absent.
 */

export function cumPfByWeek(scores, season, throughWeek) {
  const totals = new Map();
  for (const row of scores || []) {
    if (String(row.season) !== String(season)) continue;
    if (row.phase && row.phase !== "regular") continue;
    const w = Number(row.week) || 0;
    if (w < 1 || w > throughWeek) continue;
    const uid = String(row.user_id || "");
    if (!uid) continue;
    totals.set(uid, (totals.get(uid) || 0) + (Number(row.points) || 0));
  }
  return totals;
}

/** Rank 1 = highest cumulative PF. Ties broken by user_id for stability. */
export function rankMap(totals) {
  const rows = [...totals.entries()].map(([uid, pf]) => ({ uid, pf }));
  rows.sort((a, b) => b.pf - a.pf || a.uid.localeCompare(b.uid));
  const out = new Map();
  rows.forEach((r, i) => out.set(r.uid, i + 1));
  return out;
}

export function classifyArc(placeW4, placeFinal, teams) {
  const n = Math.max(2, Number(teams) || 10);
  const early = Number(placeW4) || Math.ceil(n / 2);
  const fin = Number(placeFinal) || Math.ceil(n / 2);
  const delta = early - fin; // + climbed
  if (delta >= 3) return "slow_burn";
  if (delta <= -3) return "fast_fade";
  if (early <= Math.ceil(n / 3) && fin <= 3) return "spike";
  return "steady";
}

/**
 * Parse origin seat name from pick labels like "2027 1st (KingHenryXXVI)".
 */
export function originFromPickLabel(label) {
  const m = String(label || "").match(/\(([^)]+)\)\s*$/);
  return m ? m[1] : "";
}

/**
 * Live capital snapshot: does each seat still hold their own soonest-year 1st,
 * and do they hold someone else's Early-band 1st while competing?
 */
export function liveFirstMotives(opts) {
  const picks = opts.picks || {};
  const projByName = opts.projByName || {};
  const names = opts.names || [];
  const soonest = opts.soonestYear;
  const byName = new Map();
  for (const name of names) {
    if (!name) continue;
    byName.set(name, {
      name,
      own_first: false,
      origin_first_seen: false,
      held_firsts: 0,
      held_early_others: 0,
      held_bands: [],
    });
  }
  for (const [key, entry] of Object.entries(picks)) {
    if (!entry || !entry.still_pick) continue;
    const parts = String(key).split(":");
    if (parts[0] !== "pick") continue;
    const year = Number(parts[1]);
    const round = Number(parts[2]);
    if (round !== 1) continue;
    if (soonest != null && year !== Number(soonest)) continue;
    const origin = originFromPickLabel(entry.label) || "";
    const holder = entry.holder || (entry.hops && entry.hops.length
      ? entry.hops[entry.hops.length - 1].to
      : "") || "";
    if (origin) {
      if (!byName.has(origin)) {
        byName.set(origin, {
          name: origin,
          own_first: false,
          origin_first_seen: false,
          held_firsts: 0,
          held_early_others: 0,
          held_bands: [],
        });
      }
      byName.get(origin).origin_first_seen = true;
      if (holder === origin) byName.get(origin).own_first = true;
    }
    if (!holder) continue;
    if (!byName.has(holder)) {
      byName.set(holder, {
        name: holder,
        own_first: false,
        origin_first_seen: false,
        held_firsts: 0,
        held_early_others: 0,
        held_bands: [],
      });
    }
    const row = byName.get(holder);
    row.held_firsts += 1;
    const originProj = origin ? projByName[origin] : null;
    const band = (originProj && originProj.band) || "Mid";
    row.held_bands.push(band);
    if (origin && origin !== holder && band === "Early") row.held_early_others += 1;
  }
  return byName;
}

export function buildSeasonArcsBook(opts) {
  const scores = opts.scores || [];
  const standings = opts.standings || []; // [{season, rows:[{user_id,name,place,...}]}]
  const trades = opts.trades || [];
  const tradeLegs = opts.tradeLegs || [];
  const members = opts.members || [];
  const picks = opts.picks || {};
  const projSeats = opts.projSeats || [];
  const teams = Number(opts.teams) || 10;
  const liveSeason = opts.liveSeason != null ? Number(opts.liveSeason) : null;
  const soonestPickYear = opts.soonestPickYear != null
    ? Number(opts.soonestPickYear)
    : (liveSeason != null ? liveSeason + 1 : null);

  const nameByUser = {};
  for (const m of members) {
    if (m && m.user_id) nameByUser[String(m.user_id)] = m.name || String(m.user_id);
  }

  const seasons = [];
  for (const block of standings) {
    const season = String(block.season);
    const rows = block.rows || [];
    if (!rows.length) continue;
    const rank4 = rankMap(cumPfByWeek(scores, season, 4));
    const rank8 = rankMap(cumPfByWeek(scores, season, 8));
    const earlyTrades = new Map();
    const earlyPlayerNet = new Map(); // +players in − players out (count)
    for (const t of trades) {
      if (String(t.season) !== season) continue;
      const week = Number(t.week);
      if (!(week >= 0 && week <= 4)) continue;
      const uids = (t.user_ids || []).map(String);
      for (const uid of uids) earlyTrades.set(uid, (earlyTrades.get(uid) || 0) + 1);
      const tid = String(t.transaction_id || "");
      if (!tid) continue;
      for (const leg of tradeLegs) {
        if (String(leg.transaction_id) !== tid) continue;
        if (leg.kind !== "player") continue;
        const uid = String(leg.to_user_id || "");
        if (!uid) continue;
        const dir = leg.direction === "out" ? -1 : 1;
        earlyPlayerNet.set(uid, (earlyPlayerNet.get(uid) || 0) + dir);
      }
    }

    const seatRows = [];
    for (const r of rows) {
      const uid = String(r.user_id || "");
      if (!uid) continue;
      const placeFinal = Number(r.place) || null;
      const placeW4 = rank4.get(uid) || null;
      const placeW8 = rank8.get(uid) || null;
      const delta = (placeW4 != null && placeFinal != null) ? (placeW4 - placeFinal) : 0;
      const arc = classifyArc(placeW4, placeFinal, rows.length || teams);
      const madePlayoffs = placeFinal != null && placeFinal <= 6;
      const avoidedLast = placeFinal != null && placeFinal < (rows.length || teams);
      seatRows.push({
        user_id: uid,
        name: r.name || nameByUser[uid] || uid,
        place_w4: placeW4,
        place_w8: placeW8,
        place_final: placeFinal,
        delta_early_final: delta,
        arc,
        early_trades_n: earlyTrades.get(uid) || 0,
        bought_players_early: earlyPlayerNet.get(uid) || 0,
        made_playoffs: madePlayoffs,
        avoided_last: avoidedLast,
      });
    }
    seasons.push({
      season,
      teams: rows.length || teams,
      seats: seatRows.sort((a, b) => (a.place_final || 99) - (b.place_final || 99)),
    });
  }

  seasons.sort((a, b) => Number(b.season) - Number(a.season));

  const projByName = {};
  for (const s of projSeats) {
    if (s && s.name) projByName[s.name] = s;
  }
  const allNames = new Set(Object.values(nameByUser));
  for (const block of seasons) {
    for (const s of block.seats) if (s.name) allNames.add(s.name);
  }
  const motives = liveFirstMotives({
    picks,
    projByName,
    names: [...allNames],
    soonestYear: soonestPickYear,
  });

  // Career roll-up per user
  const career = new Map();
  for (const block of seasons) {
    for (const s of block.seats) {
      if (!career.has(s.user_id)) {
        career.set(s.user_id, {
          user_id: s.user_id,
          name: s.name,
          n: 0,
          slow_burn_n: 0,
          fast_fade_n: 0,
          spike_n: 0,
          steady_n: 0,
          climb_sum: 0,
          early_trades_sum: 0,
          bubble_n: 0, // early buy + made playoffs or avoided last
          playoff_n: 0,
        });
      }
      const c = career.get(s.user_id);
      c.n += 1;
      c.name = s.name || c.name;
      c[`${s.arc}_n`] = (c[`${s.arc}_n`] || 0) + 1;
      c.climb_sum += Number(s.delta_early_final) || 0;
      c.early_trades_sum += Number(s.early_trades_n) || 0;
      if (s.made_playoffs) c.playoff_n += 1;
      if ((s.bought_players_early || 0) > 0 && (s.made_playoffs || s.avoided_last)
        && (s.early_trades_n || 0) > 0) {
        c.bubble_n += 1;
      }
    }
  }

  const seats = [...career.values()].map((c) => {
    const motive = motives.get(c.name) || null;
    const proj = projByName[c.name] || null;
    const ownFirst = motive && motive.origin_first_seen ? !!motive.own_first : null;
    const competing = proj
      ? (Number(proj.proj_finish) <= 6 || Number(proj.place_now) <= 8)
      : (c.n ? (c.playoff_n / c.n) >= 0.4 : false);
    const proxyMotive = motive && motive.origin_first_seen
      ? (!motive.own_first && competing && (motive.held_early_others > 0 || motive.held_firsts > 0))
      : false;
    return {
      user_id: c.user_id,
      name: c.name,
      n: c.n,
      slow_burn_rate: c.n ? +(c.slow_burn_n / c.n).toFixed(3) : 0,
      fast_fade_rate: c.n ? +(c.fast_fade_n / c.n).toFixed(3) : 0,
      avg_climb: c.n ? +(c.climb_sum / c.n).toFixed(2) : 0,
      early_trades_avg: c.n ? +(c.early_trades_sum / c.n).toFixed(2) : 0,
      bubble_rate: c.n ? +(c.bubble_n / c.n).toFixed(3) : 0,
      playoff_rate: c.n ? +(c.playoff_n / c.n).toFixed(3) : 0,
      owned_own_first: ownFirst,
      held_firsts: motive ? motive.held_firsts : 0,
      held_early_others: motive ? motive.held_early_others : 0,
      proxy_motive: proxyMotive,
      live_band: proj ? proj.band : null,
      live_proj_finish: proj ? proj.proj_finish : null,
      live_delta_place: proj ? proj.delta_place : null,
    };
  });

  seats.sort((a, b) => b.slow_burn_rate - a.slow_burn_rate || b.avg_climb - a.avg_climb);

  return {
    v: 1,
    teams,
    live_season: liveSeason,
    soonest_pick_year: soonestPickYear,
    seasons,
    seats,
    rule: {
      early_week: 4,
      mid_week: 8,
      arc: "slow_burn Δ≥+3 · fast_fade Δ≤−3 · spike early top-third + final ≤3 · else steady",
      place_proxy: "cumulative PF rank through week N (regular season)",
      bubble: "week≤4 trade + net player buy + made playoffs or avoided last",
      proxy: "does not hold own soonest 1st, still competing, holds other firsts",
    },
  };
}

export function pickArchetype(seat, dirLabel) {
  const s = seat || {};
  const n = Number(s.n) || 0;
  const label = String(dirLabel || "");
  const band = s.live_band || null;
  const proj = s.live_proj_finish != null ? Number(s.live_proj_finish) : null;
  const held = Number(s.held_firsts) || 0;
  const climb = Number(s.avg_climb) || 0;
  const bubble = Number(s.bubble_rate) || 0;
  const slow = Number(s.slow_burn_rate) || 0;
  const fade = Number(s.fast_fade_rate) || 0;
  const earlyTrades = Number(s.early_trades_avg) || 0;
  const hardRebuild = /hard rebuild|^rebuild$|tank/i.test(label);
  const reload = /\breload\b/i.test(label);

  // Incentive first — never bury proxy under bubble mush.
  if (s.proxy_motive) {
    return {
      id: "proxy_contender",
      lab: "Proxy contender",
      why: "Does not hold their own soonest 1st while still competing — keeps held Early capital valuable.",
    };
  }

  // Aligned tank: Early race + rebuild team (own first or not — sculpting the present).
  if (band === "Early" && hardRebuild) {
    return {
      id: "tank_sculptor",
      lab: "Tank sculptor",
      why: "Projected Early pick band with a rebuild window — selling the present for capital.",
    };
  }

  // Career fade beats Reload-team chrome (DarkWing: Early + Reload label, but Δplace sinks).
  // Must sit above reload_on_early or fade history never surfaces on Early seats.
  if (n >= 2 && fade >= 0.4 && climb <= -1.5) {
    return {
      id: "fast_fade",
      lab: "Fast fade",
      why: "Often looks strong early and slides down the final board.",
    };
  }

  // Studs on a sinking seat — not a mid-table bubble. Bubba stays here (no fade history).
  if (band === "Early" && reload) {
    return {
      id: "reload_on_early",
      lab: "Reload on Early",
      why: "Early pick band with a Reload team — decide whether to sell win-now pieces into the 1.0x.",
    };
  }

  // Title path beats career bubble rate (Ted / SF were mislabeled Bubble).
  if (band === "Late" || (proj != null && proj <= 3)) {
    return {
      id: "win_now_race",
      lab: "Race favorite",
      why: "Projected Late pick band — title path this season.",
    };
  }

  // Capital stack Mid/Early + rebuild/hoard — ARae case.
  if (held >= 3 && (band === "Mid" || band === "Early") && (hardRebuild || held >= 4)) {
    return {
      id: "capital_hoarder",
      lab: "Capital hoarder",
      why: "Holds a pile of firsts while the race is still Mid/Early — capital story beats bubble.",
    };
  }
  if (n >= 2 && (slow >= 0.35 || (climb >= 1.0 && band === "Mid"))) {
    return {
      id: "slow_burn",
      lab: "Slow burn",
      why: "Starts soft on the scoreboard and climbs by season’s end.",
    };
  }

  // True mid-table early buyer only.
  if (n >= 2 && bubble >= 0.6 && proj != null && proj >= 4 && proj <= 7
    && s.owned_own_first !== false) {
    return {
      id: "bubble_trader",
      lab: "Bubble trader",
      why: "Often buys players early, then makes the playoffs or avoids last — mid-table push.",
    };
  }

  if (n >= 2 && fade >= 0.4) {
    return {
      id: "fast_fade",
      lab: "Fast fade",
      why: "Often looks strong early and slides down the final board.",
    };
  }
  if (n >= 2 && slow >= 0.4) {
    return {
      id: "slow_burn",
      lab: "Slow burn",
      why: "Starts soft on the scoreboard and climbs by season’s end.",
    };
  }
  if (held >= 2 && earlyTrades < 1) {
    return {
      id: "capital_hoarder",
      lab: "Capital hoarder",
      why: "Holds multiple firsts and rarely deals early.",
    };
  }
  return {
    id: "balanced",
    lab: "Balanced",
    why: "No dominant arc yet — watch the race and the tape.",
  };
}

export function buildArchetypesBook(arcsBook, seatDirection) {
  const dirByUser = {};
  for (const s of (seatDirection && seatDirection.seats) || []) {
    if (s && s.seat_user_id) dirByUser[String(s.seat_user_id)] = s.label || "";
  }
  const seats = (arcsBook.seats || []).map((s) => {
    const arch = pickArchetype(s, dirByUser[String(s.user_id)]);
    return {
      user_id: s.user_id,
      name: s.name,
      archetype: arch.id,
      lab: arch.lab,
      why: arch.why,
      n: s.n,
      slow_burn_rate: s.slow_burn_rate,
      fast_fade_rate: s.fast_fade_rate,
      bubble_rate: s.bubble_rate,
      avg_climb: s.avg_climb,
      proxy_motive: !!s.proxy_motive,
      owned_own_first: s.owned_own_first,
      held_firsts: s.held_firsts,
      held_early_others: s.held_early_others,
      live_band: s.live_band,
      live_proj_finish: s.live_proj_finish,
      live_delta_place: s.live_delta_place,
    };
  });
  seats.sort((a, b) => {
    const order = {
      proxy_contender: 0,
      tank_sculptor: 1,
      reload_on_early: 2,
      capital_hoarder: 3,
      slow_burn: 4,
      fast_fade: 5,
      bubble_trader: 6,
      win_now_race: 7,
      balanced: 8,
    };
    return (order[a.archetype] ?? 9) - (order[b.archetype] ?? 9)
      || String(a.name).localeCompare(String(b.name));
  });
  return {
    v: 1,
    as_of: arcsBook.as_of || null,
    league_id: arcsBook.league_id || null,
    live_season: arcsBook.live_season,
    soonest_pick_year: arcsBook.soonest_pick_year,
    seats,
    rule: {
      priority: "proxy → tank → reload-on-early → hoarder → slow burn → fast fade → bubble (mid only) → race favorite → balanced",
      min_seasons_soft: 2,
      bubble_gate: "bubble_rate≥0.6 and proj 4–7 and owns own first",
    },
  };
}
