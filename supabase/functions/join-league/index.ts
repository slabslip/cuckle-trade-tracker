// Chuckle Fantasy — league commissioner + seat invites
//
// POST /functions/v1/join-league
// Authorization: Bearer <user JWT>
//
// Actions:
//   preview         { sleeper_league_id }
//   create          { sleeper_league_id, espn_league_id? }
//                   → first time: mint codes; revisit by same commissioner: status only (no remint)
//   list_invites    { sleeper_league_id }  → claimed/unclaimed (no plaintext)
//   rotate_invites  { sleeper_league_id }  → new codes for unclaimed seats
//   redeem          { code }               → atomic membership + claim
//   claim_seat      { sleeper_league_id, sleeper_user_id }  → commissioner claims own seat
//
// Deploy: supabase functions deploy join-league

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const SLEEPER = "https://api.sleeper.app/v1";
const CUCKLE = "1315431339301806080";
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

function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let out = "CF-";
  for (let i = 0; i < 8; i++) {
    out += alphabet[bytes[i] % alphabet.length];
    if (i === 3) out += "-";
  }
  return out;
}

async function sha256Hex(text: string) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function mintUnclaimed(
  admin: ReturnType<typeof createClient>,
  preview: Awaited<ReturnType<typeof loadTeams>>,
  userId: string,
) {
  const invitesOut: Array<{
    team_name: string;
    sleeper_user_id: string;
    code: string;
    claimed: boolean;
  }> = [];

  for (const team of preview!.teams) {
    const { data: existing } = await admin.from("seat_invites")
      .select("id, claimed_by, team_name")
      .eq("sleeper_league_id", preview!.sleeper_league_id)
      .eq("sleeper_user_id", team.sleeper_user_id)
      .maybeSingle();

    if (existing && existing.claimed_by) {
      invitesOut.push({
        team_name: team.team_name,
        sleeper_user_id: team.sleeper_user_id,
        code: "(already claimed — not rotated)",
        claimed: true,
      });
      continue;
    }

    const code = makeCode();
    const code_hash = await sha256Hex(code);
    const { error: invErr } = await admin.from("seat_invites").upsert({
      sleeper_league_id: preview!.sleeper_league_id,
      sleeper_user_id: team.sleeper_user_id,
      team_name: team.team_name,
      code_hash,
      created_by: userId,
      claimed_by: null,
      claimed_at: null,
    }, { onConflict: "sleeper_league_id,sleeper_user_id" });
    if (invErr) throw new Error("Invite write failed: " + invErr.message);
    invitesOut.push({
      team_name: team.team_name,
      sleeper_user_id: team.sleeper_user_id,
      code,
      claimed: false,
    });
  }
  return invitesOut;
}

async function listInviteRows(
  admin: ReturnType<typeof createClient>,
  leagueId: string,
) {
  const { data: rows, error } = await admin.from("seat_invites")
    .select("sleeper_user_id, team_name, claimed_by, claimed_at, created_at")
    .eq("sleeper_league_id", leagueId)
    .order("team_name");
  if (error) throw new Error(error.message);
  return (rows || []).map((r) => ({
    team_name: r.team_name,
    sleeper_user_id: r.sleeper_user_id,
    claimed: !!r.claimed_by,
    claimed_at: r.claimed_at,
    code: r.claimed_by ? "(already claimed)" : "(hidden — rotate to reissue)",
  }));
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

  // ---- preview ----
  if (action === "preview") {
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
    return json(200, { ok: true, league: preview });
  }

  // ---- create (idempotent) / rotate_invites ----
  if (action === "create" || action === "rotate_invites") {
    const leagueId = String(body.sleeper_league_id || "").trim();
    const espnId = String(body.espn_league_id || "").trim() || null;
    if (!/^\d{6,64}$/.test(leagueId)) {
      return json(400, { ok: false, error: "Enter a valid Sleeper league ID (digits only)" });
    }
    if (espnId && !/^[A-Za-z0-9_-]{3,64}$/.test(espnId)) {
      return json(400, { ok: false, error: "ESPN league ID looks invalid" });
    }

    let preview;
    try {
      preview = await loadTeams(leagueId);
    } catch (err) {
      return json(502, { ok: false, error: String(err && (err as Error).message || err) });
    }
    if (!preview) return json(404, { ok: false, error: "No Sleeper league with that ID" });

    const { data: prior } = await admin.from("leagues")
      .select("sleeper_league_id, status, created_by, name, season, espn_league_id, total_rosters")
      .eq("sleeper_league_id", preview.sleeper_league_id)
      .maybeSingle();

    if (action === "rotate_invites") {
      if (!prior || prior.created_by !== user.id) {
        return json(403, { ok: false, error: "Only the league creator can rotate invites" });
      }
    }

    if (action === "create" && prior && prior.created_by && prior.created_by !== user.id) {
      return json(409, { ok: false, error: "This league already has a commissioner on Chuckle Fantasy" });
    }

    // Idempotent create: same commissioner revisiting — open console, do not remint.
    if (action === "create" && prior && prior.created_by === user.id) {
      let invites;
      try {
        invites = await listInviteRows(admin, preview.sleeper_league_id);
      } catch (err) {
        return json(500, { ok: false, error: String((err as Error).message || err) });
      }
      return json(200, {
        ok: true,
        already_exists: true,
        league: {
          sleeper_league_id: preview.sleeper_league_id,
          name: prior.name || preview.name,
          season: prior.season || preview.season,
          sport: preview.sport,
          total_rosters: prior.total_rosters || preview.total_rosters,
          status: prior.status || "pending_sync",
          espn_league_id: prior.espn_league_id || espnId,
          teams: preview.teams,
        },
        invites,
        note: "League already exists. Codes are hidden after first mint — use Rotate unclaimed to reissue.",
      });
    }

    const status = prior && prior.status === "ready" ? "ready" : "pending_sync";
    const cuckle = preview.sleeper_league_id === CUCKLE;
    const { error: leagueErr } = await admin.from("leagues").upsert({
      sleeper_league_id: preview.sleeper_league_id,
      name: preview.name,
      season: preview.season,
      sport: preview.sport,
      total_rosters: preview.total_rosters,
      status: cuckle ? "ready" : status,
      espn_league_id: espnId,
      created_by: user.id,
    }, { onConflict: "sleeper_league_id" });
    if (leagueErr) {
      return json(500, { ok: false, error: "Could not register league: " + leagueErr.message });
    }

    let invitesOut;
    try {
      invitesOut = await mintUnclaimed(admin, preview, user.id);
    } catch (err) {
      return json(500, { ok: false, error: String((err as Error).message || err) });
    }

    return json(200, {
      ok: true,
      already_exists: false,
      league: {
        ...preview,
        status: cuckle ? "ready" : status,
        espn_league_id: espnId,
      },
      invites: invitesOut,
      note: "DM each manager their code. Codes are shown once — rotate to reissue unclaimed seats.",
    });
  }

  // ---- list invites (no plaintext codes) ----
  if (action === "list_invites") {
    const leagueId = String(body.sleeper_league_id || "").trim();
    const { data: league } = await admin.from("leagues")
      .select("created_by, name, status, season, total_rosters, espn_league_id")
      .eq("sleeper_league_id", leagueId)
      .maybeSingle();
    if (!league || league.created_by !== user.id) {
      return json(403, { ok: false, error: "Only the league creator can list invites" });
    }
    let invites;
    try {
      invites = await listInviteRows(admin, leagueId);
    } catch (err) {
      return json(500, { ok: false, error: String((err as Error).message || err) });
    }
    let teams = [];
    try {
      const preview = await loadTeams(leagueId);
      teams = (preview && preview.teams) || [];
    } catch { /* list still useful without live Sleeper */ }
    return json(200, {
      ok: true,
      league: {
        sleeper_league_id: leagueId,
        name: league.name,
        status: league.status,
        season: league.season,
        total_rosters: league.total_rosters,
        espn_league_id: league.espn_league_id,
        teams,
      },
      invites,
    });
  }

  // ---- redeem invite (atomic RPC) ----
  if (action === "redeem") {
    const code = String(body.code || "").trim().toUpperCase();
    if (!code || code.length < 8) {
      return json(400, { ok: false, error: "Enter the invite code from your commissioner" });
    }
    const code_hash = await sha256Hex(code);
    const { data, error } = await admin.rpc("redeem_seat_invite", {
      p_code_hash: code_hash,
      p_auth_user_id: user.id,
    });
    if (error) {
      const msg = String(error.message || "");
      if (msg.includes("unknown invite") || error.code === "P0002") {
        return json(404, { ok: false, error: "Unknown or expired invite code" });
      }
      if (msg.includes("already used") || msg.includes("seat already claimed")) {
        return json(409, { ok: false, error: "That invite was already used or the seat is taken" });
      }
      // Fallback if Wave 1 SQL not applied yet: non-atomic path
      if (msg.includes("redeem_seat_invite") || msg.includes("Could not find the function")) {
        const { data: invite, error: invErr } = await admin.from("seat_invites")
          .select("*")
          .eq("code_hash", code_hash)
          .maybeSingle();
        if (invErr) return json(500, { ok: false, error: invErr.message });
        if (!invite) return json(404, { ok: false, error: "Unknown or expired invite code" });
        if (invite.claimed_by && invite.claimed_by !== user.id) {
          return json(409, { ok: false, error: "That invite was already used" });
        }
        const { data: membership, error: memErr } = await admin.from("league_memberships").upsert({
          auth_user_id: user.id,
          sleeper_league_id: invite.sleeper_league_id,
          sleeper_user_id: invite.sleeper_user_id,
          team_name: invite.team_name,
        }, { onConflict: "auth_user_id,sleeper_league_id" }).select("*").maybeSingle();
        if (memErr) {
          if (String(memErr.message || "").includes("league_memberships_seat_key")) {
            return json(409, { ok: false, error: "That team is already claimed by another account" });
          }
          return json(500, { ok: false, error: memErr.message });
        }
        await admin.from("seat_invites").update({
          claimed_by: user.id,
          claimed_at: new Date().toISOString(),
        }).eq("id", invite.id);
        const { data: leagueRow } = await admin.from("leagues")
          .select("name, status, season")
          .eq("sleeper_league_id", invite.sleeper_league_id)
          .maybeSingle();
        return json(200, {
          ok: true,
          membership,
          league: {
            sleeper_league_id: invite.sleeper_league_id,
            name: (leagueRow && leagueRow.name) || invite.sleeper_league_id,
            status: (leagueRow && leagueRow.status) || "pending_sync",
            season: leagueRow && leagueRow.season,
            team_name: invite.team_name,
            sleeper_user_id: invite.sleeper_user_id,
          },
        });
      }
      return json(500, { ok: false, error: error.message });
    }
    return json(200, { ok: true, ...(data as Record<string, unknown>) });
  }

  // ---- commissioner claim seat ----
  if (action === "claim_seat") {
    const leagueId = String(body.sleeper_league_id || "").trim();
    const seatId = String(body.sleeper_user_id || "").trim();
    if (!leagueId || !seatId) {
      return json(400, { ok: false, error: "Pick your team to claim" });
    }
    const { data, error } = await admin.rpc("claim_commissioner_seat", {
      p_sleeper_league_id: leagueId,
      p_sleeper_user_id: seatId,
      p_auth_user_id: user.id,
    });
    if (error) {
      const msg = String(error.message || "");
      if (msg.includes("not commissioner")) {
        return json(403, { ok: false, error: "Only the league creator can claim a seat this way" });
      }
      if (msg.includes("already claimed") || msg.includes("seat already")) {
        return json(409, { ok: false, error: "That seat is already claimed" });
      }
      if (msg.includes("unknown")) {
        return json(404, { ok: false, error: "Unknown league or seat" });
      }
      // Fallback without RPC: redeem-equivalent via service role
      if (msg.includes("claim_commissioner_seat") || msg.includes("Could not find the function")) {
        const { data: league } = await admin.from("leagues")
          .select("created_by")
          .eq("sleeper_league_id", leagueId)
          .maybeSingle();
        if (!league || league.created_by !== user.id) {
          return json(403, { ok: false, error: "Only the league creator can claim a seat this way" });
        }
        const { data: invite } = await admin.from("seat_invites")
          .select("*")
          .eq("sleeper_league_id", leagueId)
          .eq("sleeper_user_id", seatId)
          .maybeSingle();
        if (!invite) return json(404, { ok: false, error: "Unknown seat" });
        if (invite.claimed_by && invite.claimed_by !== user.id) {
          return json(409, { ok: false, error: "That seat is already claimed" });
        }
        const { data: membership, error: memErr } = await admin.from("league_memberships").upsert({
          auth_user_id: user.id,
          sleeper_league_id: invite.sleeper_league_id,
          sleeper_user_id: invite.sleeper_user_id,
          team_name: invite.team_name,
        }, { onConflict: "auth_user_id,sleeper_league_id" }).select("*").maybeSingle();
        if (memErr) {
          return json(409, { ok: false, error: "That seat is already claimed" });
        }
        await admin.from("seat_invites").update({
          claimed_by: user.id,
          claimed_at: new Date().toISOString(),
        }).eq("id", invite.id);
        const { data: leagueRow } = await admin.from("leagues")
          .select("name, status, season")
          .eq("sleeper_league_id", leagueId)
          .maybeSingle();
        return json(200, {
          ok: true,
          membership,
          league: {
            sleeper_league_id: leagueId,
            name: (leagueRow && leagueRow.name) || leagueId,
            status: (leagueRow && leagueRow.status) || "pending_sync",
            season: leagueRow && leagueRow.season,
            team_name: invite.team_name,
            sleeper_user_id: invite.sleeper_user_id,
          },
        });
      }
      return json(500, { ok: false, error: error.message });
    }
    return json(200, { ok: true, ...(data as Record<string, unknown>) });
  }

  if (action === "join") {
    return json(400, {
      ok: false,
      error: "Use an invite code from your commissioner (action: redeem), or create the league if you are the commissioner.",
    });
  }

  return json(400, { ok: false, error: "Unknown action" });
});
