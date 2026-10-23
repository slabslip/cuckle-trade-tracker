#!/usr/bin/env node
/** Smoke: Continue with Apple + post-login join (invite or Sleeper ID). */
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../lib.mjs";

const page = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const gen = fs.readFileSync(path.join(ROOT, "generate-page.mjs"), "utf8");
const ents = fs.readFileSync(path.join(ROOT, "ios/Chuckle/Chuckle.entitlements"), "utf8");
const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");

const need = [
  "Sign in with Apple",
  "Sign in",
  'data-apple-go="1"',
  "function authSignInWithApple(",
  "function authHasNativeApple(",
  "function authExchangeAppleIdToken(",
  "__chuckleAppleCredential",
  "chuckleApple",
  "function authCaptureOAuthSession(",
  "function routeAfterAuth(",
  "function renderAppJoin(",
  'provider=apple',
  'appScreen === "join"',
  'data-join-invite-go="1"',
  'data-join-league-go="1"',
  "Add a league",
  "Join with code",
  "Use username and password",
  "ensure_league",
  "release_seat",
  "match_seat",
  "Find my team",
  "claimSleeperUser",
  "Wrong team — unclaim",
  "Generate invite codes",
  "authEnsureProfile(",
];
if (page.includes(">Create as commissioner</button>")
  || page.includes("Create as commissioner</button>")) {
  throw new Error("peer join must not offer Create as commissioner");
}
const appleSwift = fs.readFileSync(path.join(ROOT, "ios/Chuckle/AppleSignIn.swift"), "utf8");
if (!appleSwift.includes("ASAuthorizationAppleIDProvider")
  || !appleSwift.includes("__chuckleAppleCredential")) {
  throw new Error("ios AppleSignIn.swift must run native SIWA and call __chuckleAppleCredential");
}
const storeWv = fs.readFileSync(path.join(ROOT, "ios/Chuckle/StoreWebView.swift"), "utf8");
if (!storeWv.includes('name: "chuckleApple"') || !storeWv.includes("chuckleNativeApple")) {
  throw new Error("StoreWebView must register chuckleApple and set chuckleNativeApple");
}

for (const s of need) {
  if (!page.includes(s) || !gen.includes(s)) {
    throw new Error("missing Sign in with Apple / join piece: " + s);
  }
}

if (!ents.includes("com.apple.developer.applesignin")) {
  throw new Error("ios entitlements must enable Sign in with Apple");
}
if (!sw.includes("claim-username-only")
  && !sw.includes("join-cleanup")
  && !sw.includes("peer-join-username")
  && !sw.includes("peer-join-claim")) {
  throw new Error("sw.js must bump cache for claim username-only ship");
}
if (!page.includes("claimUsernameOnly")
  && !page.includes("joinCleanup")
  && !page.includes("peerJoinUsernameMatch")
  && !page.includes("peerJoinClaim")) {
  throw new Error("DATA_V must bump for claim username-only ship");
}
if (!page.includes('cuckle.auth.v2') || !page.includes('cuckle.votes.v5')) {
  throw new Error("client keys must bump after account wipe (auth.v2 / votes.v5)");
}
const wipe = fs.readFileSync(path.join(ROOT, "scripts/wipe-accounts-fresh-start.sql"), "utf8");
if (!wipe.includes("delete from auth.users")
  || !wipe.includes("'app_profiles'")
  || !wipe.includes("'league_memberships'")
  || !wipe.includes("'leagues'")) {
  throw new Error("wipe-accounts-fresh-start.sql must clear auth users, profiles, memberships, leagues");
}

console.log("sign-in apple join ok");
