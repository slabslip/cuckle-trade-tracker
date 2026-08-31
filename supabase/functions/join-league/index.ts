// Supabase Edge Function: preview + join a Sleeper league.
//
// POST /functions/v1/join-league
// Authorization: Bearer <user access token>
// Body:
//   { "action": "preview", "sleeper_league_id": "..." }
//   { "action": "join", "sleeper_league_id": "...", "sleeper_user_id": "..." }
//
// Deploy: supabase functions deploy join-league

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const SLEEPER = "https://api.sleeper.app/v1";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function sleeperGet(path: string) {
  const res = await fetch(SLEEPER + path);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Sleeper ${path} → ${res.status}`);
  return await res.json();
}

async function loadTeams(leagueId: string) {
  const league = await sleeperGet(`/league/${leagueId}`);
  if (!league) return null;
  const users = (await sleeperGet(`/league/${leagueId}/users`)) || [];
  const rosters = (await sleeperGet(`/league/${leagueId}/rosters`)) || [];
  const ownerIds = new Set(
    rosters.map((r: { owner_id?: string }) => r.owner_id).filter(Boolean),
  );
  const teams = users
    .filter((u: { user_id: string }) => ownerIds.has(u.user_id))
    .map((u: { user_id: string; display_name?: string; metadata?: { team_name?: string } }) => ({
      sleeper_user_id: u.user_id,
      team_name: (u.metadata && u.metadata.team_name) || u.display_name || u.user_id,
      display_name: u.display_name || null,
    }))
    .sort((a: { team_name: string }, b: { team_name: string }) =>
      a.team_name.localeCompare(b.team_name),
    );
  return {
    sleeper_league_id: String(league.league_id),
    name: league.name || "Sleeper league",
    season: league.season != null ? String(league.season) : null,
    sport: league.sport || "nfl",
    total_rosters: league.total_rosters || teams.length,
    teams,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json(405, { ok: false, error: "POST only" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !anon || !service) {
    return json(500, { ok: false, error: "Supabase env missing" });
  }

  const authHeader = req.headers.get("Authorization") || "";
  const userClient = createClient(supabaseUrl, anon, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) {
    return json(401, { ok: false, error: "Sign in required" });
  }
  const user = userData.user;
  const admin = createClient(supabaseUrl, service);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "Invalid JSON" });
  }

  const action = String(body.action || "preview");
  const leagueId = String(body.sleeper_league_id || "").trim();
  if (!/^\d{6,64}$/.test(leagueId)) {
    return json(400, { ok: false, error: "Enter a valid Sleeper league ID (digits only)" });
  }

  let preview;
  try {
    preview = await loadTeams(leagueId);
  } catch (err) {
    return json(502, { ok: false, error: String(err && (err as Error).message || err) });
  }
  if (!preview) return json(404, { ok: false, error: "No Sleeper league with that ID" });

  if (action === "preview") {
    return json(200, { ok: true, league: preview });
  }

  if (action !== "join") {
    return json(400, { ok: false, error: "action must be preview or join" });
  }

  const seatId = String(body.sleeper_user_id || "").trim();
  const team = preview.teams.find((t: { sleeper_user_id: string }) => t.sleeper_user_id === seatId);
  if (!team) {
    return json(400, { ok: false, error: "That team is not in this league" });
  }

  const { data: prior } = await admin.from("leagues")
    .select("sleeper_league_id, status")
    .eq("sleeper_league_id", preview.sleeper_league_id)
    .maybeSingle();

  const status = prior && prior.status === "ready" ? "ready" : (prior ? prior.status : "pending_sync");

  const { error: leagueErr } = await admin.from("leagues").upsert({
    sleeper_league_id: preview.sleeper_league_id,
    name: preview.name,
    season: preview.season,
    sport: preview.sport,
    total_rosters: preview.total_rosters,
    status: status === "error" ? "pending_sync" : status,
  }, { onConflict: "sleeper_league_id" });

  if (leagueErr) {
    return json(500, { ok: false, error: "Could not register league: " + leagueErr.message });
  }

  const { data: membership, error: memErr } = await admin.from("league_memberships").insert({
    auth_user_id: user.id,
    sleeper_league_id: preview.sleeper_league_id,
    sleeper_user_id: team.sleeper_user_id,
    team_name: team.team_name,
  }).select("*").maybeSingle();

  if (memErr) {
    const msg = String(memErr.message || "");
    if (msg.includes("league_memberships_seat_key")) {
      return json(409, { ok: false, error: "That team is already claimed in this league" });
    }
    if (msg.includes("league_memberships_auth_league_key")) {
      return json(409, { ok: false, error: "You already joined this league" });
    }
    return json(500, { ok: false, error: memErr.message });
  }

  return json(200, {
    ok: true,
    league: { ...preview, status: prior && prior.status === "ready" ? "ready" : "pending_sync" },
    membership,
  });
});
