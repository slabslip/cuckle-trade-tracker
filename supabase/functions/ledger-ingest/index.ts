// Supabase Edge Function: iPhone Shortcut → ledger_bets ingest.
// Secrets: LEDGER_INGEST_SECRET (shared with Shortcut), SUPABASE_SERVICE_ROLE_KEY (auto),
//          SUPABASE_URL (auto).
// Accept rule: proposer auto-locks; counterparty must Accept in-app.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ledger-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

  // Load memberships for name resolution in this league.
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
    // Already a snowflake id?
    if (/^\d{6,}$/.test(raw)) {
      const hit = seats.find((s) => s.sleeper_user_id === raw);
      return hit ? hit.sleeper_user_id : raw;
    }
    const n = normName(raw);
    const exact = seats.filter((s) => normName(s.team_name) === n);
    if (exact.length === 1) return exact[0].sleeper_user_id;
    const fuzzy = seats.filter((s) => {
      const tn = normName(s.team_name);
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

  // Lightweight parse from raw_text when structured fields missing:
  // "Name vs Name — title — $100 even"
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
      error: "could not resolve both parties — check side_a_name / side_b_name",
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
  } else if (rawText) {
    const m = rawText.match(/\$\s*([0-9]+(?:\.[0-9]+)?)/);
    if (m) amountCents = Math.round(parseFloat(m[1]) * 100);
  }
  if (!Number.isFinite(amountCents) || amountCents < 0) amountCents = 0;

  const title = String(body.title || rawText.split(/[—\n]/)[0] || "Bet").trim().slice(0, 160);
  const terms = String(body.terms || rawText || title).trim();
  const odds = body.odds != null ? String(body.odds).trim() : null;
  const deadline = body.deadline ? new Date(String(body.deadline)).toISOString() : null;

  const hashBase = [leagueId, sideA, sideB, String(amountCents), title.toLowerCase(), (odds || "").toLowerCase()].join("|");
  const raw_hash = await sha256Hex(hashBase);

  // Idempotent: same hash within league returns existing row.
  const { data: existing } = await sb
    .from("ledger_bets")
    .select("id, status")
    .eq("sleeper_league_id", leagueId)
    .eq("raw_hash", raw_hash)
    .maybeSingle();
  if (existing && existing.id) {
    return json(200, { ok: true, bet_id: existing.id, status: existing.status, deduped: true });
  }

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
