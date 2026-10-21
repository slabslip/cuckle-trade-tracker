#!/usr/bin/env python3
"""
Measure dynasty cuff-value moves when the starter missed games (2024–2025).

Sources
  - data/value_curve.json          DynastyProcess Superflex (2qb), monthly
  - data/dp/latest/db_playerids.csv  gsis / pfr → sleeper
  - nflverse injuries + snap counts  (fetched once into --cache)

This is research. It does not write extras VA. Re-run:

  python3 scripts/cuff-history.py
  python3 scripts/cuff-history.py --write
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import statistics
import urllib.request
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CURVE_PATH = ROOT / "data" / "value_curve.json"
IDS_PATH = ROOT / "data" / "dp" / "latest" / "db_playerids.csv"
DEFAULT_CACHE = Path("/tmp/cuff-study")
DEFAULT_OUT = ROOT / "data" / "research" / "cuff-history.json"

NFLVERSE = {
    ("injuries", 2024): "https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_2024.csv",
    ("injuries", 2025): "https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_2025.csv",
    ("snaps", 2024): "https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_2024.csv",
    ("snaps", 2025): "https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_2025.csv",
}

SEASONS = (2024, 2025)
PRESEASON = {2024: "2024-08-30", 2025: "2025-08-29"}
WEEK1_THU = {2024: date(2024, 9, 5), 2025: date(2025, 9, 4)}
SKILL = {"QB", "RB", "WR", "TE"}
FB_AS_RB = {"FB", "HB"}

# Preseason DP floor so we study real starters, not committees of backups.
MIN_STARTER = {"QB": 2200, "RB": 1400, "TE": 900, "WR": 1800}
# Realized cuff must have been a backup on the board, not a 1B.
MAX_CUFF_SHARE = {"QB": 0.45, "RB": 0.50, "TE": 0.55, "WR": 0.55}
MIN_CUFF_AVG_SNAPS = {"QB": 20, "RB": 10, "TE": 12, "WR": 18}
MIN_OUT_WEEKS = 2
EARLY_LAST_WEEK = 8
# Unpriced depth (Mac Jones at 3, Dare Ogunbowale at 2) makes % moves junk.
MIN_CUFF_BEFORE = 20

# One-week rest / healthy scratch is not an event. QB benchings without
# an Out/Doubtful tag are also dropped (Young, Levis, etc.).
QB_REQUIRE_INJURY = True
QB_MIN_CUFF_BEFORE = 50


def week_thu(season: int, week: int) -> date:
    return WEEK1_THU[season] + timedelta(days=7 * (week - 1))


def fetch(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 1000:
        return
    print(f"fetch {url}")
    with urllib.request.urlopen(url, timeout=60) as r, dest.open("wb") as out:
        out.write(r.read())


def ensure_cache(cache: Path) -> dict[tuple[str, int], Path]:
    paths = {}
    for (kind, year), url in NFLVERSE.items():
        dest = cache / f"{kind}_{year}.csv"
        fetch(url, dest)
        paths[(kind, year)] = dest
    return paths


def load_ids() -> tuple[dict[str, dict], dict[str, str], dict[str, str]]:
    by_sleeper: dict[str, dict] = {}
    gsis_to_sleeper: dict[str, str] = {}
    pfr_to_sleeper: dict[str, str] = {}
    with IDS_PATH.open() as f:
        for r in csv.DictReader(f):
            sid = (r.get("sleeper_id") or "").strip()
            if not sid or sid == "NA":
                continue
            pos = (r.get("position") or "").strip()
            rec = {
                "sleeper_id": sid,
                "name": r.get("name") or sid,
                "pos": pos if pos in SKILL else ("RB" if pos in FB_AS_RB else pos),
                "gsis": r.get("gsis_id") or "",
                "pfr": r.get("pfr_id") or "",
            }
            by_sleeper[sid] = rec
            gsis = (r.get("gsis_id") or "").strip()
            if gsis and gsis != "NA":
                gsis_to_sleeper[gsis] = sid
            pfr = (r.get("pfr_id") or "").strip()
            if pfr and pfr != "NA":
                pfr_to_sleeper[pfr] = sid
    return by_sleeper, gsis_to_sleeper, pfr_to_sleeper


def load_curve() -> tuple[list[str], dict[str, dict[str, float]]]:
    rows = json.loads(CURVE_PATH.read_text())
    by: dict[str, dict[str, float]] = defaultdict(dict)
    dates = set()
    for r in rows:
        if r.get("provider") != "dynastyprocess" or r.get("format_key") != "2qb":
            continue
        key = r.get("asset_key") or ""
        if not key.startswith("player:"):
            continue
        as_of = r["as_of"]
        dates.add(as_of)
        if r.get("value") is None:
            continue
        by[as_of][key] = float(r["value"])
    ordered = sorted(dates)
    return ordered, dict(by)


def value_on(curve_dates: list[str], curve: dict[str, dict[str, float]], sid: str, as_of: str) -> float | None:
    key = f"player:{sid}"
    last = None
    for d in curve_dates:
        if d <= as_of:
            if key in curve.get(d, {}):
                last = curve[d][key]
        else:
            break
    return last


def value_at_date(curve_dates: list[str], curve: dict[str, dict[str, float]], sid: str, when: date) -> float | None:
    return value_on(curve_dates, curve, sid, when.isoformat())


def next_snap_after(curve_dates: list[str], when: date) -> str | None:
    iso = when.isoformat()
    for d in curve_dates:
        if d > iso:
            return d
    return None


def snaps_in_window(curve_dates: list[str], start: date, end: date) -> list[str]:
    a, b = start.isoformat(), end.isoformat()
    return [d for d in curve_dates if a < d <= b]


def load_snaps(path: Path, pfr_to_sleeper: dict[str, str]) -> tuple[dict, set]:
    """snaps[(season, week, team, pos)] -> list of {sid, name, snaps}
    teams_played[(season, week)] -> set of teams
    """
    snaps = defaultdict(list)
    teams_played = defaultdict(set)
    unmatched = 0
    with path.open() as f:
        for r in csv.DictReader(f):
            if r.get("game_type") != "REG":
                continue
            raw_pos = (r.get("position") or "").strip()
            pos = "RB" if raw_pos in FB_AS_RB else raw_pos
            if pos not in SKILL:
                continue
            season = int(r["season"])
            week = int(r["week"])
            team = r["team"].strip()
            teams_played[(season, week)].add(team)
            pfr = (r.get("pfr_player_id") or "").strip()
            sid = pfr_to_sleeper.get(pfr)
            if not sid:
                unmatched += 1
                continue
            try:
                off = float(r.get("offense_snaps") or 0)
            except ValueError:
                off = 0.0
            snaps[(season, week, team, pos)].append(
                {
                    "sleeper_id": sid,
                    "name": r.get("player") or sid,
                    "snaps": off,
                    "pfr": pfr,
                }
            )
    if unmatched:
        print(f"  snap rows with no sleeper id: {unmatched} in {path.name}")
    return snaps, teams_played


def load_injuries(path: Path, gsis_to_sleeper: dict[str, str]) -> dict:
    """out[(season, week, sid)] -> {status, injury, team, pos, name}"""
    out = {}
    with path.open() as f:
        for r in csv.DictReader(f):
            if r.get("game_type") != "REG":
                continue
            status = (r.get("report_status") or "").strip()
            if status not in {"Out", "Doubtful"}:
                continue
            gsis = (r.get("gsis_id") or "").strip()
            sid = gsis_to_sleeper.get(gsis)
            if not sid:
                continue
            raw_pos = (r.get("position") or "").strip()
            pos = "RB" if raw_pos in FB_AS_RB else raw_pos
            season = int(r["season"])
            week = int(r["week"])
            out[(season, week, sid)] = {
                "status": status,
                "injury": r.get("report_primary_injury") or "",
                "team": r["team"].strip(),
                "pos": pos,
                "name": r.get("full_name") or sid,
            }
    return out


def merge_snaps(cache_paths: dict, pfr_to_sleeper: dict[str, str]):
    snaps = {}
    teams = {}
    for year in SEASONS:
        s, t = load_snaps(cache_paths[("snaps", year)], pfr_to_sleeper)
        snaps.update(s)
        teams.update(t)
    return snaps, teams


def merge_injuries(cache_paths: dict, gsis_to_sleeper: dict[str, str]):
    inj = {}
    for year in SEASONS:
        inj.update(load_injuries(cache_paths[("injuries", year)], gsis_to_sleeper))
    return inj


def players_on_team_pos(snaps, injuries, season: int, team: str, pos: str) -> dict[str, str]:
    """sleeper_id -> display name for anyone who snapped or was Out on that team+pos."""
    names = {}
    for week in range(1, 19):
        for row in snaps.get((season, week, team, pos), []):
            names[row["sleeper_id"]] = row["name"]
    for (s, w, sid), rec in injuries.items():
        if s == season and rec["team"] == team and rec["pos"] == pos:
            names[sid] = rec["name"]
    return names


def starter_out_weeks(snaps, teams_played, injuries, season, team, pos, starter_id) -> list[int]:
    missed = []
    for week in range(1, 19):
        if team not in teams_played.get((season, week), set()):
            continue  # bye
        rows = snaps.get((season, week, team, pos), [])
        starter_snaps = 0.0
        for row in rows:
            if row["sleeper_id"] == starter_id:
                starter_snaps = row["snaps"]
                break
        inj = injuries.get((season, week, starter_id))
        tagged_out = bool(inj and inj["status"] in {"Out", "Doubtful"} and inj["team"] == team)
        if starter_snaps <= 2 or tagged_out and starter_snaps <= 8:
            # Count as out only if they actually did not play meaningful snaps.
            if starter_snaps <= 8:
                missed.append(week)
    return missed


def team_byes(teams_played, season: int, team: str) -> set[int]:
    played = {w for w in range(1, 19) if team in teams_played.get((season, w), set())}
    return {w for w in range(1, 19) if w not in played}


def stretches(weeks: list[int], byes: set[int]) -> list[tuple[int, int, list[int]]]:
    """Consecutive out weeks; a bye between two out weeks is the same absence."""
    if not weeks:
        return []
    weeks = sorted(weeks)
    groups = [[weeks[0]]]
    for w in weeks[1:]:
        gap = set(range(groups[-1][-1] + 1, w))
        if not gap or gap <= byes:
            groups[-1].append(w)
        else:
            groups.append([w])
    out = []
    for g in groups:
        if len(g) >= MIN_OUT_WEEKS:
            out.append((g[0], g[-1], g))
    return out


def prior_played_weeks(teams_played, season, team, start: int, n: int = 2) -> list[int]:
    found = []
    w = start - 1
    while w >= 1 and len(found) < n:
        if team in teams_played.get((season, w), set()):
            found.append(w)
        w -= 1
    return list(reversed(found))


def snap_totals(snaps, season, team, pos, weeks, exclude=frozenset()):
    tot = defaultdict(lambda: [0.0, ""])
    for week in weeks:
        for row in snaps.get((season, week, team, pos), []):
            if row["sleeper_id"] in exclude:
                continue
            tot[row["sleeper_id"]][0] += row["snaps"]
            tot[row["sleeper_id"]][1] = row["name"]
    return tot


def snap_leader(snaps, season, team, pos, weeks, exclude) -> tuple[str | None, str | None, float]:
    tot = snap_totals(snaps, season, team, pos, weeks, exclude)
    if not tot:
        return None, None, 0.0
    sid, (sn, name) = max(tot.items(), key=lambda kv: kv[1][0])
    return sid, name, sn / max(1, len(weeks))


def pick_cuff(snaps, curve_dates, curve, season, team, pos, weeks, exclude, before_day):
    """Snap leader if they were a priced backup; else the highest-priced teammate who played."""
    tot = snap_totals(snaps, season, team, pos, weeks, exclude)
    if not tot:
        return None, None, 0.0
    scored = []
    for sid, (sn, name) in tot.items():
        avg = sn / max(1, len(weeks))
        if avg < MIN_CUFF_AVG_SNAPS[pos]:
            continue
        val = value_at_date(curve_dates, curve, sid, before_day) or 0.0
        scored.append((val, avg, sid, name))
    if not scored:
        return None, None, 0.0
    # Prefer the back who actually got the work, as long as DP priced them.
    by_snaps = sorted(scored, key=lambda r: r[1], reverse=True)
    for val, avg, sid, name in by_snaps:
        if val >= MIN_CUFF_BEFORE:
            return sid, name, avg
    val, avg, sid, name = max(scored, key=lambda r: r[0])
    return sid, name, avg


def injury_note(injuries, season, sid, weeks) -> tuple[bool, str]:
    tags = []
    for week in weeks:
        rec = injuries.get((season, week, sid))
        if rec:
            tags.append(f"W{week} {rec['status']} {rec['injury']}".strip())
    return bool(tags), "; ".join(tags[:3])


def mean(xs: list[float]) -> float | None:
    return round(statistics.mean(xs), 1) if xs else None


def median(xs: list[float]) -> float | None:
    return round(statistics.median(xs), 1) if xs else None


def collect_events(curve_dates, curve, by_sleeper, snaps, teams_played, injuries):
    events = []
    skipped = defaultdict(int)
    seen = set()

    teams = set()
    for (season, week, team, pos) in snaps:
        teams.add((season, team))

    for season, team in sorted(teams):
        byes = team_byes(teams_played, season, team)
        for pos in ("QB", "RB", "TE", "WR"):
            names = players_on_team_pos(snaps, injuries, season, team, pos)
            if not names:
                continue
            pre = PRESEASON[season]
            ranked = []
            for sid, name in names.items():
                val = value_on(curve_dates, curve, sid, pre)
                if val is None:
                    continue
                ranked.append((val, sid, name))
            ranked.sort(reverse=True)
            if not ranked:
                skipped["no_preseason_value"] += 1
                continue

            # Anyone expensive enough to be a lead — August #1 or the snap
            # leader walking into the absence (Zack Moss → Chase Brown).
            candidates = []
            if ranked[0][0] >= MIN_STARTER[pos]:
                candidates.append(ranked[0])
            for val, sid, name in ranked[1:]:
                if val >= MIN_STARTER[pos]:
                    candidates.append((val, sid, name))

            for starter_val, starter_id, starter_name in candidates:
                missed = starter_out_weeks(
                    snaps, teams_played, injuries, season, team, pos, starter_id
                )
                for start, end, weeks in stretches(missed, byes):
                    key = (season, team, pos, starter_id, start)
                    if key in seen:
                        continue
                    prior = prior_played_weeks(teams_played, season, team, start)
                    lead_id = None
                    if prior:
                        lead_id, _, _ = snap_leader(
                            snaps, season, team, pos, prior, exclude=set()
                        )
                    august_one = ranked[0][1] == starter_id
                    never_played = not prior and start <= 2
                    zero_open = True
                    for w in weeks[: min(3, len(weeks))]:
                        rows = snaps.get((season, w, team, pos), [])
                        got = next((r["snaps"] for r in rows if r["sleeper_id"] == starter_id), 0.0)
                        if got > 0:
                            zero_open = False
                            break
                    # August #1 with a true week-1 IR (CMC: 0 snaps). A healthy
                    # scratch rookie (Kaleb Johnson, 2 snaps) is not a starter-out.
                    if lead_id != starter_id and not (
                        august_one and start <= 2 and zero_open
                    ):
                        skipped["not_the_lead"] += 1
                        continue
                    seen.add(key)

                    confirmed, note = injury_note(injuries, season, starter_id, weeks)
                    if pos == "QB" and QB_REQUIRE_INJURY and not confirmed:
                        skipped["qb_bench_not_injury"] += 1
                        continue
                    if pos != "QB" and not confirmed and len(weeks) < 3:
                        skipped["short_unconfirmed"] += 1
                        continue

                    before_day = week_thu(season, start) - timedelta(days=1)
                    # First monthly snap after that week's Thursday — do not skip
                    # the in-month print (Sep 26/27 is the CMC / Pacheco reaction).
                    return_day = week_thu(season, end) + timedelta(days=14)
                    before_asof = max(
                        (d for d in curve_dates if d <= before_day.isoformat()), default=None
                    )
                    during_asof = next_snap_after(curve_dates, week_thu(season, start))
                    window = snaps_in_window(curve_dates, before_day, return_day)
                    if during_asof and during_asof not in window:
                        window = [during_asof] + window

                    cuff_id, cuff_name, cuff_avg = pick_cuff(
                        snaps, curve_dates, curve, season, team, pos, weeks,
                        exclude={starter_id}, before_day=before_day,
                    )
                    if not cuff_id:
                        skipped["no_cuff_snaps"] += 1
                        continue

                    cuff_before = value_at_date(curve_dates, curve, cuff_id, before_day)
                    starter_before = value_at_date(curve_dates, curve, starter_id, before_day)

                    # Brooks → Chuba / Kaleb → Warren: the "starter" never took
                    # the job and the next man was already a priced RB2. CMC →
                    # Mason is the opposite (cheap cuff, starter hurt week 1).
                    week1_lead, _, _ = snap_leader(
                        snaps, season, team, pos, [start], exclude=set()
                    )
                    planned_incumbent = (
                        never_played
                        and week1_lead == cuff_id
                        and (cuff_before or 0) >= 150
                    )
                    if (prior and lead_id == cuff_id) or planned_incumbent:
                        skipped["incumbent"] += 1
                        continue
                    if cuff_before is None or starter_before is None:
                        skipped["missing_curve"] += 1
                        continue
                    if starter_before <= 0 or cuff_before < MIN_CUFF_BEFORE:
                        skipped["cuff_unpriced"] += 1
                        continue
                    if pos == "QB" and cuff_before < QB_MIN_CUFF_BEFORE:
                        skipped["qb_unpriced"] += 1
                        continue
                    if cuff_before / starter_before > MAX_CUFF_SHARE[pos]:
                        skipped["not_a_backup"] += 1
                        continue

                    cuff_during = (
                        value_on(curve_dates, curve, cuff_id, during_asof) if during_asof else None
                    )
                    peak = None
                    peak_asof = None
                    for d in window:
                        v = value_on(curve_dates, curve, cuff_id, d)
                        if v is None:
                            continue
                        if peak is None or v > peak:
                            peak, peak_asof = v, d
                    if cuff_during is None:
                        cuff_during = peak
                        during_asof = peak_asof
                    if cuff_during is None:
                        skipped["no_during_snap"] += 1
                        continue

                    delta = cuff_during - cuff_before
                    delta_peak = (peak - cuff_before) if peak is not None else delta
                    timing = "early" if start <= EARLY_LAST_WEEK else "late"
                    clean = (
                        pos in {"QB", "RB", "TE"}
                        and cuff_before >= MIN_CUFF_BEFORE
                        and delta_peak >= -25
                    )
                    events.append(
                        {
                            "season": season,
                            "team": team,
                            "pos": pos,
                            "timing": timing,
                            "clean": clean,
                            "start_week": start,
                            "end_week": end,
                            "weeks_out": len(weeks),
                            "weeks": weeks,
                            "injury_confirmed": confirmed,
                            "injury": note,
                            "starter": starter_name,
                            "starter_id": starter_id,
                            "starter_pre": round(starter_val, 1),
                            "starter_before": round(starter_before, 1),
                            "cuff": cuff_name,
                            "cuff_id": cuff_id,
                            "cuff_avg_snaps": round(cuff_avg, 1),
                            "listed_cuff": ranked[1][2] if len(ranked) > 1 else None,
                            "listed_cuff_id": ranked[1][1] if len(ranked) > 1 else None,
                            "before_asof": before_asof,
                            "during_asof": during_asof,
                            "peak_asof": peak_asof,
                            "cuff_before": round(cuff_before, 1),
                            "cuff_during": round(cuff_during, 1),
                            "cuff_peak": round(peak, 1) if peak is not None else None,
                            "delta": round(delta, 1),
                            "delta_peak": round(delta_peak, 1),
                            "pct_cuff": round(100 * delta / cuff_before, 1),
                            "pct_cuff_peak": round(100 * delta_peak / cuff_before, 1),
                            "pct_starter": round(100 * delta / starter_before, 1),
                            "pct_starter_peak": round(100 * delta_peak / starter_before, 1),
                        }
                    )
    return events, dict(skipped)


def summarize(events: list[dict]) -> dict:
    def pack(rows: list[dict]) -> dict:
        if not rows:
            return {"n": 0}
        d = [r["delta"] for r in rows]
        dp = [r["delta_peak"] for r in rows]
        pc = [r["pct_cuff"] for r in rows]
        pp = [r["pct_cuff_peak"] for r in rows]
        ps = [r["pct_starter"] for r in rows]
        psp = [r.get("pct_starter_peak", r["pct_starter"]) for r in rows]
        return {
            "n": len(rows),
            "delta_mean": mean(d),
            "delta_median": median(d),
            "delta_peak_mean": mean(dp),
            "delta_peak_median": median(dp),
            "pct_cuff_mean": mean(pc),
            "pct_cuff_median": median(pc),
            "pct_cuff_peak_mean": mean(pp),
            "pct_cuff_peak_median": median(pp),
            "pct_starter_mean": mean(ps),
            "pct_starter_median": median(ps),
            "pct_starter_peak_mean": mean(psp),
            "pct_starter_peak_median": median(psp),
        }

    def slice_sum(rows):
        by_pos = {}
        by_timing = {}
        by_cell = {}
        for pos in ("QB", "RB", "TE", "WR"):
            by_pos[pos] = pack([e for e in rows if e["pos"] == pos])
            for timing in ("early", "late"):
                by_cell[f"{pos}_{timing}"] = pack(
                    [e for e in rows if e["pos"] == pos and e["timing"] == timing]
                )
        for timing in ("early", "late"):
            by_timing[timing] = pack([e for e in rows if e["timing"] == timing])
        return {
            "all": pack(rows),
            "by_pos": by_pos,
            "by_timing": by_timing,
            "by_pos_timing": by_cell,
        }

    clean = [e for e in events if e.get("clean")]
    return {"all_events": slice_sum(events), "clean": slice_sum(clean)}


def _cell_num(cell: dict, key: str, fallback: float) -> float:
    if cell.get("n", 0) >= 1 and cell.get(key) is not None:
        return max(0.0, float(cell[key]))
    return fallback


def lock_formula(summary: dict) -> dict:
    """
    % of cuff is noisy (Mason +1080%, Charbonnet +6%). % of starter is the
    stable move. pos_w is relative to RB. Tiny cells inherit RB * default.
    """
    clean = summary["clean"]
    # Fallbacks from the two-year RB median when a cell is empty.
    share_default = {"QB": 1.5, "RB": 4.0, "TE": 1.0, "WR": 0.0}
    lift_default = {"QB": 20.0, "RB": 80.0, "TE": 15.0, "WR": 0.0}

    share = {}
    lift = {}
    for pos in ("QB", "RB", "TE", "WR"):
        cell = clean["by_pos"].get(pos) or {}
        if pos == "WR":
            share[pos] = 0.0
            lift[pos] = 0.0
            continue
        if cell.get("n", 0) >= 2:
            share[pos] = _cell_num(cell, "pct_starter_peak_median", share_default[pos])
            lift[pos] = _cell_num(cell, "pct_cuff_peak_median", lift_default[pos])
        elif cell.get("n", 0) == 1:
            share[pos] = _cell_num(cell, "pct_starter_peak_median", share_default[pos])
            lift[pos] = _cell_num(cell, "pct_cuff_peak_median", lift_default[pos])
        else:
            share[pos] = share_default[pos]
            lift[pos] = lift_default[pos]

    # TE cuffs did not reprice in this window (n=2, both down). Keep a small
    # prior so the position is not treated as RB, not as "free."
    if share.get("TE", 0) <= 0:
        share["TE"] = round((share.get("RB") or 4.0) * 0.25, 1)
        lift["TE"] = 15.0

    rb_share = share["RB"] or 4.0
    pos_w = {pos: round(share[pos] / rb_share, 2) if rb_share else 0.0 for pos in share}
    pos_w["WR"] = 0.0

    early_cell = clean["by_pos_timing"].get("RB_early") or clean["by_timing"].get("early") or {}
    late_cell = clean["by_pos_timing"].get("RB_late") or clean["by_timing"].get("late") or {}
    early = _cell_num(early_cell, "pct_starter_peak_median", 4.0) or 4.0
    late = _cell_num(late_cell, "pct_starter_peak_median", early * 0.6)
    late_n = (late_cell or {}).get("n", 0)
    # Remaining-season damp: weeks 9–18 have ~9 games left / 17. Late n is
    # too small to override that with a 2-point median.
    if late_n >= 4:
        season_w = {
            "early": 1.0,
            "late": round(max(0.40, min(1.00, late / early)), 2),
        }
    else:
        season_w = {"early": 1.0, "late": 0.60}

    # ~1/3 of RB1s missed 2+ in this window; QB/TE lower.
    p_out = {"QB": 0.18, "RB": 0.32, "TE": 0.16, "WR": 0.0}

    injury_share = {pos: round(share[pos] / 100.0, 3) for pos in share}
    injury_lift = {pos: round(lift[pos] / 100.0, 3) for pos in lift}

    # Two-regime lock (see cuff-formula.mjs). Medians set the priced path;
    # cheap darts (Mason / Hunt / Vidal, cuff < 5% of starter) use a larger
    # slice of the starter because % of cuff is meaningless at 22–49.
    locked = {
        "pos_w": {"QB": 0.50, "RB": 1.00, "TE": 0.25, "WR": 0.0},
        "season_w": {"early": 1.00, "late": 0.60},
        "weeks_w": {"short_1_3": 0.40, "mid_4_7": 0.75, "long_8_plus": 1.00},
        "cheap_ratio": 0.05,
        "share_cheap": 0.05,
        "share_priced": 0.03,
        "lift_priced": 0.50,
        "cap": 650,
        "p_out": p_out,
        "hold_w": {"already_had_starter": 1.0, "got_both_in_deal": 0.5},
    }
    return {
        "clock": "dynastyprocess_2qb",
        "sample": "nfl_2024_2025_priced_backup_inherits",
        "measured": {
            "pos_share_starter": {k: round(v, 1) for k, v in share.items()},
            "pos_lift_cuff": {k: round(v, 1) for k, v in lift.items()},
            "pos_w_from_share": pos_w,
            "injury_share": injury_share,
            "injury_lift": injury_lift,
        },
        "locked": locked,
        "injury_note": (
            "cheap (cuff/starter < 0.05): starter * 0.05; "
            "else min(starter * 0.03, cuff * 0.50); "
            "then * pos_w * season_w * weeks_w, cap 650"
        ),
        "insurance_note": (
            "healthy pairing: injury move at early/long * p_out[pos] * hold_w, cap 350"
        ),
        "wr": "off — cuffs.json WR rows are WR2s, not fantasy handcuffs",
    }


def print_table(events: list[dict], summary: dict, formula: dict) -> None:
    hdr = (
        f"{'Yr':<5}{'Pos':<4}{'When':<6}{'W':<8}{'Team':<5}"
        f"{'Starter':<22}{'Cuff':<22}{'Bef':>6}{'Dur':>6}{'Pk':>6}"
        f"{'Δpk':>7}{'%c':>6}{'%s':>6}{'ok':>3}"
    )
    print(hdr)
    print("-" * len(hdr))
    for e in sorted(events, key=lambda r: (r["pos"], r["timing"], r["season"], r["start_week"])):
        w = f"{e['start_week']}-{e['end_week']}"
        print(
            f"{e['season']:<5}{e['pos']:<4}{e['timing']:<6}{w:<8}{e['team']:<5}"
            f"{e['starter'][:21]:<22}{e['cuff'][:21]:<22}"
            f"{e['cuff_before']:6.0f}{e['cuff_during']:6.0f}"
            f"{(e['cuff_peak'] or 0):6.0f}{e['delta_peak']:7.0f}"
            f"{e['pct_cuff_peak']:5.0f}%{e.get('pct_starter_peak', e['pct_starter']):5.0f}%"
            f"{' y' if e.get('clean') else '  '}"
        )
    print()
    print("Clean averages (priced backup, peak during the absence)")
    clean = summary["clean"]
    for label, cell in (
        [("all", clean["all"])]
        + [(p, clean["by_pos"][p]) for p in ("QB", "RB", "TE", "WR")]
        + [(t, clean["by_timing"][t]) for t in ("early", "late")]
        + [(k, clean["by_pos_timing"][k]) for k in sorted(clean["by_pos_timing"])]
    ):
        if not cell.get("n"):
            print(f"  {label:<12} n=0")
            continue
        print(
            f"  {label:<12} n={cell['n']:<3}  Δpeak med {cell['delta_peak_median']:>7}  "
            f"%cuff peak med {cell['pct_cuff_peak_median']:>6}  "
            f"%starter peak med {cell['pct_starter_peak_median']}"
        )
    print()
    print("Locked formula")
    print(json.dumps(formula, indent=2))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = ap.parse_args()

    print("loading curve + ids")
    curve_dates, curve = load_curve()
    by_sleeper, gsis_to_sleeper, pfr_to_sleeper = load_ids()
    print(f"  {len(curve_dates)} curve dates, {len(by_sleeper)} sleeper ids")

    print("loading nflverse")
    cache_paths = ensure_cache(args.cache)
    snaps, teams_played = merge_snaps(cache_paths, pfr_to_sleeper)
    injuries = merge_injuries(cache_paths, gsis_to_sleeper)
    print(f"  {len(snaps)} team-week-pos snap groups, {len(injuries)} Out/Doubtful tags")

    events, skipped = collect_events(
        curve_dates, curve, by_sleeper, snaps, teams_played, injuries
    )
    summary = summarize(events)
    formula = lock_formula(summary)
    print_table(events, summary, formula)
    print("skipped", json.dumps(skipped, indent=2))

    payload = {
        "v": 1,
        "seasons": list(SEASONS),
        "clock": "dynastyprocess 2qb monthly",
        "early_weeks": f"1-{EARLY_LAST_WEEK}",
        "late_weeks": f"{EARLY_LAST_WEEK + 1}-18",
        "n": len(events),
        "skipped": skipped,
        "summary": summary,
        "formula": formula,
        "events": events,
    }
    if args.write:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(payload, indent=2) + "\n")
        print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
