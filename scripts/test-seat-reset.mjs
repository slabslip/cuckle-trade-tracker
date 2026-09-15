#!/usr/bin/env node
import fs from "node:fs";

const ROOT = new URL("..", import.meta.url).pathname;
const page = fs.readFileSync(`${ROOT}generate-page.mjs`, "utf8");
const fn = fs.readFileSync(`${ROOT}supabase/functions/join-league/index.ts`, "utf8");
const sql = fs.readFileSync(`${ROOT}db/wave22-seat-reset.sql`, "utf8");

function fail(msg) {
  console.error("RESET FAIL: " + msg);
  process.exit(1);
}

if (!page.includes('data-gate-mode="forgot"')) fail("gate missing Forgot mode");
if (!page.includes("function onForgotSubmit(")) fail("Forgot submit missing");
if (!page.includes("reclaim_seat")) fail("page must call reclaim_seat");
if (!page.includes("request_reset")) fail("page must call request_reset");
if (!page.includes("Reset login")) fail("commissioner Reset login missing");
if (!page.includes("Forgot username or password")) fail("sign-in Forgot link missing");
if (!page.includes("saveProfileLogin")) fail("profile Save login missing");
if (!fn.includes('action === "reclaim_seat"')) fail("join-league reclaim_seat missing");
if (!fn.includes('action === "request_reset"')) fail("join-league request_reset missing");
if (!fn.includes("prior_auth_user_id")) fail("reissue must store prior account");
if (!sql.includes("recover_email")) fail("wave22 must add recover_email");
if (!sql.includes("prior_username")) fail("wave22 must add prior_username");
console.log("PASS seat reset: Forgot gate, reclaim ticket, Reset login, recover email");
