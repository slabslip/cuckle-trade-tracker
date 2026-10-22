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
  "Continue with Apple",
  'data-apple-go="1"',
  "function authSignInWithApple(",
  "function authCaptureOAuthSession(",
  "function routeAfterAuth(",
  "function renderAppJoin(",
  'provider=apple',
  'appScreen === "join"',
  'data-join-invite-go="1"',
  'data-join-league-go="1"',
  "Find teams",
  "Use username and password",
  "Join a league",
  "authEnsureProfile(",
];

for (const s of need) {
  if (!page.includes(s) || !gen.includes(s)) {
    throw new Error("missing Sign in with Apple / join piece: " + s);
  }
}

if (!ents.includes("com.apple.developer.applesignin")) {
  throw new Error("ios entitlements must enable Sign in with Apple");
}
if (!sw.includes("sign-in-apple-join")) {
  throw new Error("sw.js must bump cache for Apple join ship");
}
if (!page.includes("signInAppleJoin")) {
  throw new Error("DATA_V must bump for Apple join ship");
}

console.log("sign-in apple join ok");
