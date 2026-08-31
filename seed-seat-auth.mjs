#!/usr/bin/env node
/**
 * Phase 1 — seed one Supabase Auth user per Sleeper seat and print invite codes.
 *
 * NEVER commit a service_role key. Pass it in the environment:
 *
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... node seed-seat-auth.mjs
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... node seed-seat-auth.mjs --rotate
 *
 * --rotate regenerates passwords for seats that already exist and reprints codes.
 *
 * Output: codes printed to stdout, and written to data/seat-invites.local.txt
 * (gitignored). DM each manager their own line. Do not paste codes into Slack
 * channels the whole league can read if you care about seat impersonation.
 *
 * Prerequisites (docs/SUPABASE_SETUP.md §7):
 *   1. db/phase1-seat-auth.sql has been run
 *   2. Auth → Providers → Email → Confirm email is OFF (synthetic emails)
 *   3. Site URL includes your GitHub Pages URL and, later, the custom domain
 */
import fs from "node:fs";
import { ROOT } from "./lib.mjs";

const PROJECT = "https://gtqyvnkkjiksmmtmzubw.supabase.co";
const AUTH = PROJECT + "/auth/v1";
const REST = PROJECT + "/rest/v1";
const EMAIL_DOMAIN = "seats.cuckle.invalid";
const OUT = ROOT + "data/seat-invites.local.txt";

const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!key || key.length < 40) {
  console.error("Set SUPABASE_SERVICE_ROLE_KEY to the project's service_role secret (Dashboard → API).");
  console.error("It must never be committed. Rotate it if it ever lands in git or a chat log.");
  process.exit(1);
}

const rotate = process.argv.includes("--rotate");

const members = JSON.parse(fs.readFileSync(ROOT + "data/ui/members.json", "utf8"));
if (!Array.isArray(members) || members.length < 1) {
  console.error("data/ui/members.json is empty or missing");
  process.exit(1);
}

function seatEmail(userId) {
  return "seat-" + userId + "@" + EMAIL_DOMAIN;
}

function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let out = "CUCK-";
  for (let i = 0; i < 8; i++) {
    out += alphabet[bytes[i] % alphabet.length];
    if (i === 3) out += "-";
  }
  return out;
}

async function admin(path, { method = "GET", body } = {}) {
  const res = await fetch(AUTH + path, {
    method,
    headers: {
      apikey: key,
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* raw */ }
  if (!res.ok) {
    const msg = (json && (json.msg || json.error_description || json.message)) || text || res.status;
    throw new Error(method + " " + path + " → " + res.status + " " + msg);
  }
  return json;
}

async function restUpsertProfile(authUserId, seat) {
  const res = await fetch(REST + "/seat_profiles?on_conflict=auth_user_id", {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify({
      auth_user_id: authUserId,
      seat_user_id: seat.user_id,
      seat_name: seat.name,
    }),
  });
  if (!res.ok) {
    throw new Error("seat_profiles upsert " + res.status + " " + (await res.text()));
  }
}

async function findUserByEmail(email) {
  // Admin list is paginated; for ten seats a single page is enough. Filter client-side.
  const page = await admin("/admin/users?page=1&per_page=200");
  const users = (page && page.users) || [];
  return users.find((u) => (u.email || "").toLowerCase() === email.toLowerCase()) || null;
}

const lines = [];
lines.push("# CuckleChunckle seat invite codes — PRIVATE");
lines.push("# Generated " + new Date().toISOString() + (rotate ? " (--rotate)" : ""));
lines.push("# Each manager gets ONE line. Team name = who they claim; code = password.");
lines.push("# Sign-in email is synthetic and never emailed: seat-<user_id>@" + EMAIL_DOMAIN);
lines.push("");

for (const seat of members) {
  const email = seatEmail(seat.user_id);
  const code = makeCode();
  let user = await findUserByEmail(email);

  if (!user) {
    user = await admin("/admin/users", {
      method: "POST",
      body: {
        email,
        password: code,
        email_confirm: true,
        user_metadata: {
          seat_user_id: seat.user_id,
          seat_name: seat.name,
        },
      },
    });
    // createUser returns the user object at the top level
    if (!user.id && user.user) user = user.user;
  } else if (rotate) {
    await admin("/admin/users/" + user.id, {
      method: "PUT",
      body: {
        password: code,
        email_confirm: true,
        user_metadata: {
          seat_user_id: seat.user_id,
          seat_name: seat.name,
        },
      },
    });
  } else {
    // Keep existing password; do not print a fake new code.
    lines.push(
      seat.name.padEnd(22) + "  (already seeded — re-run with --rotate to issue a new code)  "
      + seat.user_id,
    );
    await restUpsertProfile(user.id, seat);
    continue;
  }

  await restUpsertProfile(user.id, seat);
  lines.push(
    seat.name.padEnd(22) + "  " + code + "  " + seat.user_id,
  );
  console.log(seat.name + " → " + code);
}

fs.writeFileSync(OUT, lines.join("\n") + "\n", "utf8");
console.log("\nWrote " + OUT);
console.log("DM each manager their code. Then open the site and claim a seat to verify.");
