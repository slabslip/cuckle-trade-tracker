// Supabase Edge Function: iPhone Shortcut → ledger_bets ingest (capture-first).
// Phone sends raw_text + two seat IDs. Money / title are finished on the Ledger tab.
// Secrets: LEDGER_INGEST_SECRET, SUPABASE_SERVICE_ROLE_KEY (auto), SUPABASE_URL (auto).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ledger-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Canonical + common aliases for this league (emoji team_name norms to empty). */
const SEAT_ALIASES: Record<string, string> = {
  arae: "458004578168729600",
  themorningchubbs: "458004578168729600",
  bigjberg: "458315051980288000",
  theiceberg: "458315051980288000",
  bubbacuckshremp: "458723431387492352",
  chiefgumby: "457945712932417536",
  darkwingducks2023: "458766127967760384",
  evilducks: "458766127967760384",
  kinghenryxxvi: "458715702119886848",
  sf69erss: "457779824002330624",
  tedcumberbatch: "470311990468800512",
  tipsup: "457784547094818816",
  thetips: "457784547094818816",
  trumancooper: "458342725222133760",
  ducktipsyumm: "458342725222133760",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function normName(s: string) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { ok: false, error: "POST only" });

  const secret = Deno.env.get("LEDGER_INGEST_SECRET");
  if (!secret) return json(500, { ok: false, error: "LEDGER_INGEST_SECRET missing" });

  const got = req.headers.get("x-ledger-secret") || "";
  if (got !== secret) return json(401, { ok: false, error: "unauthorized" });

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json(500, { ok: false, error: "supabase env missing" });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "invalid json" });
  }

  const leagueId = String(body.sleeper_league_id || "").trim();
  const rawText = String(body.raw_text || "").trim();
  if (!leagueId) return json(400, { ok: false, error: "sleeper_league_id required" });
  if (!rawText && !body.title) return json(400, { ok: false, error: "raw_text or title required" });

  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: mems, error: memErr } = await sb
    .from("league_memberships")
    .select("sleeper_user_id, team_name")
    .eq("sleeper_league_id", leagueId);
  if (memErr) return json(500, { ok: false, error: memErr.message });

  const seats = (mems || []) as { sleeper_user_id: string; team_name: string }[];

  function resolveSeat(label: string | undefined | null): string | null {
    if (!label) return null;
    const raw = String(label).trim();
    if (!raw) return null;
    if (/^\d{6,}$/.test(raw)) {
      const hit = seats.find((s) => s.sleeper_user_id === raw);
      return hit ? hit.sleeper_user_id : raw;
    }
    const n = normName(raw);
    if (!n) return null;
    if (SEAT_ALIASES[n]) return SEAT_ALIASES[n];
    const exact = seats.filter((s) => {
      const tn = normName(s.team_name);
      return tn && tn === n;
    });
    if (exact.length === 1) return exact[0].sleeper_user_id;
    const fuzzy = seats.filter((s) => {
      const tn = normName(s.team_name);
      if (!tn || tn.length < 2) return false;
      if (n.length < 3 && tn !== n) return false;
      return tn.includes(n) || n.includes(tn);
    });
    if (fuzzy.length === 1) return fuzzy[0].sleeper_user_id;
    return null;
  }

  const sideAName = String(body.side_a_name || body.side_a || "").trim();
  const sideBName = String(body.side_b_name || body.side_b || "").trim();
  const submittedBy = String(body.submitted_by || "").trim();

  let sideA = resolveSeat(sideAName);
  let sideB = resolveSeat(sideBName);
  let proposer = resolveSeat(submittedBy) || sideA;

  if ((!sideA || !sideB) && rawText) {
    const vs = rawText.match(/^(.+?)\s+vs\.?\s+(.+?)(?:\s+[—\-:|]|\s*$)/i);
    if (vs) {
      sideA = sideA || resolveSeat(vs[1]);
      sideB = sideB || resolveSeat(vs[2]);
    }
  }

  if (!sideA || !sideB) {
    return json(422, {
      ok: false,
      error: "could not resolve both parties — send side_a_name / side_b_name as seat ids",
      needs_review: true,
    });
  }
  if (sideA === sideB) {
    return json(422, { ok: false, error: "sides must be two different seats" });
  }
  if (!proposer) proposer = sideA;

  let amountCents = 0;
  if (body.amount_cents != null && body.amount_cents !== "") {
    amountCents = Math.round(Number(body.amount_cents));
  } else if (body.amount != null && body.amount !== "") {
    amountCents = Math.round(Number(body.amount) * 100);
  }
  if (!Number.isFinite(amountCents) || amountCents < 0) amountCents = 0;

  const firstLine = rawText.split(/\r?\n/)[0] || "";
  const title = String(body.title || firstLine || "Bet").trim().slice(0, 160);
  const terms = String(body.terms || rawText || title).trim();
  const odds = body.odds != null && String(body.odds).trim() !== "" ? String(body.odds).trim() : null;
  const deadline = body.deadline ? new Date(String(body.deadline)).toISOString() : null;

  const hashBase = [leagueId, sideA, sideB, rawText.toLowerCase()].join("|");
  const raw_hash = await sha256Hex(hashBase);

  const { data: existing } = await sb
    .from("ledger_bets")
    .select("id, status")
    .eq("sleeper_league_id", leagueId)
    .eq("raw_hash", raw_hash)
    .maybeSingle();
  if (existing && existing.id) {
    return json(200, { ok: true, bet_id: existing.id, status: existing.status, deduped: true });
  }

  const visRaw = String(body.visibility || "public").trim().toLowerCase();
  const visibility = visRaw === "private" ? "private" : "public";

  const row = {
    sleeper_league_id: leagueId,
    title,
    terms,
    odds,
    amount_cents: amountCents,
    currency: "USD",
    side_a: sideA,
    side_b: sideB,
    side_a_claim: body.side_a_claim ? String(body.side_a_claim) : null,
    side_b_claim: body.side_b_claim ? String(body.side_b_claim) : null,
    proposer,
    status: "proposed",
    side_a_lock: proposer === sideA,
    side_b_lock: proposer === sideB,
    deadline_at: deadline,
    visibility,
    source: "shortcut",
    source_text: rawText || null,
    raw_hash,
  };

  const { data: inserted, error: insErr } = await sb.from("ledger_bets").insert(row).select("id, status").single();
  if (insErr) return json(500, { ok: false, error: insErr.message });

  await sb.from("ledger_bet_events").insert({
    bet_id: inserted.id,
    actor: proposer,
    kind: "created",
    payload: { source: "shortcut", raw_text: rawText || null },
  });

  return json(200, { ok: true, bet_id: inserted.id, status: inserted.status, deduped: false });
});
