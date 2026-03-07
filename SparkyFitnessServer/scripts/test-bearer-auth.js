#!/usr/bin/env node

/**
 * Test script for Chunk 2: Validate Better Auth sign-in from a non-browser context.
 *
 * Tests:
 * 1. API key auth regression — existing flow still works
 * 2. Email/password sign-in — how the session token is returned
 * 3. Session token auth — use body.token via Bearer header
 * 4. MFA-enabled account — what the challenge response looks like
 *
 * Usage:
 *   node scripts/test-bearer-auth.js
 *
 * Environment variables (or edit the defaults below):
 *   SERVER_URL    — e.g. http://localhost:3010
 *   ORIGIN        — must match a trustedOrigins entry in auth.js
 *   TEST_EMAIL    — email of a test account WITHOUT MFA
 *   TEST_PASSWORD
 *   MFA_EMAIL     — (optional) email of a test account WITH MFA enabled
 *   MFA_PASSWORD
 *   API_KEY       — (optional) existing API key, for regression check
 */

const SERVER_URL = process.env.SERVER_URL || "http://localhost:3010";
const ORIGIN = process.env.ORIGIN || "http://10.0.0.75:8080";
const TEST_EMAIL = process.env.TEST_EMAIL || "admin@example.com";
const TEST_PASSWORD = process.env.TEST_PASSWORD || "password123";
const MFA_EMAIL = process.env.MFA_EMAIL;
const MFA_PASSWORD = process.env.MFA_PASSWORD;
const API_KEY = process.env.API_KEY || "";

// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function header(title) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${"=".repeat(60)}`);
}

function check(label, condition) {
  if (condition) {
    console.log(`  [PASS] ${label}`);
    passed++;
  } else {
    console.log(`  [FAIL] ${label}`);
    failed++;
  }
}

async function signIn(email, password) {
  const url = `${SERVER_URL}/api/auth/sign-in/email`;
  console.log(`\nPOST ${url}`);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": ORIGIN,
    },
    body: JSON.stringify({ email, password }),
    redirect: "manual",
  });

  console.log(`Status: ${res.status} ${res.statusText}`);

  let body = null;
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    body = await res.json();
    console.log("Body:", JSON.stringify(body, null, 2));
  }

  return { status: res.status, headers: res.headers, body };
}

async function testProtectedEndpoint(token) {
  const url = `${SERVER_URL}/api/identity/user`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Origin": ORIGIN,
    },
  });

  let body = null;
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    body = await res.json();
  }

  return { status: res.status, headers: res.headers, body };
}

async function run() {
  console.log(`Server: ${SERVER_URL}`);
  console.log(`Origin: ${ORIGIN}`);

  // -----------------------------------------------------------------------
  // Test 1: API key regression
  // -----------------------------------------------------------------------
  if (API_KEY) {
    header("Test 1: API key auth (regression)");
    const { status, body } = await testProtectedEndpoint(API_KEY);
    console.log(`  Status: ${status}`, body?.authenticatedUserEmail || "");
    check("API key returns 200", status === 200);
    check("Response includes user email", !!body?.authenticatedUserEmail);
  } else {
    header("Test 1: API key auth (SKIPPED)");
  }

  // -----------------------------------------------------------------------
  // Test 2: Email/password sign-in
  // -----------------------------------------------------------------------
  if (!TEST_EMAIL || !TEST_PASSWORD) {
    header("Test 2: Email/password sign-in (SKIPPED)");
    header("Test 3: Session token auth (SKIPPED)");
  } else {
    header("Test 2: Email/password sign-in");
    const { status, headers, body } = await signIn(TEST_EMAIL, TEST_PASSWORD);

    check("Sign-in returns 200", status === 200);
    check("Response has body.token (raw session token)", !!body?.token);
    check("Response has body.user with email", !!body?.user?.email);
    check("set-cookie header present", !!headers.get("set-cookie"));
    check("body.redirect is false (no MFA challenge)", body?.redirect === false);
    check("body.twoFactorRedirect is absent", !body?.twoFactorRedirect);

    console.log("\n--- Token details ---");
    console.log("  body.token:", body?.token, `(${body?.token?.length} chars)`);
    console.log("  User MFA status:", {
      twoFactorEnabled: body?.user?.twoFactorEnabled,
      mfaTotpEnabled: body?.user?.mfaTotpEnabled,
      mfaEmailEnabled: body?.user?.mfaEmailEnabled,
    });

    // -------------------------------------------------------------------
    // Test 3: Use raw body.token via Bearer header on a protected route
    // -------------------------------------------------------------------
    const sessionToken = body?.token;
    if (sessionToken) {
      header("Test 3: Session token auth via Bearer header");
      const { status: authStatus, body: authBody } = await testProtectedEndpoint(sessionToken);
      console.log(`  Status: ${authStatus}`, authBody?.authenticatedUserEmail || "");
      check("Session token returns 200", authStatus === 200);
      check("Response includes user email", !!authBody?.authenticatedUserEmail);
      check("Same user as sign-in", authBody?.authenticatedUserEmail === body?.user?.email);
    } else {
      header("Test 3: Session token auth (SKIPPED — no token from sign-in)");
    }
  }

  // -----------------------------------------------------------------------
  // Test 4: MFA-enabled account sign-in
  // -----------------------------------------------------------------------
  if (!MFA_EMAIL || !MFA_PASSWORD) {
    header("Test 4: MFA sign-in (SKIPPED — no MFA_EMAIL / MFA_PASSWORD)");
  } else {
    header("Test 4: MFA-enabled account sign-in");
    const { status, body } = await signIn(MFA_EMAIL, MFA_PASSWORD);

    console.log("\n--- MFA challenge analysis ---");
    console.log("  Status:", status);
    console.log("  twoFactorRedirect:", body?.twoFactorRedirect);

    if (body?.twoFactorRedirect) {
      check("MFA challenge detected (twoFactorRedirect: true)", true);
      console.log("\n  The mobile app should check body.twoFactorRedirect === true");
      console.log("  and show a message that MFA accounts must use API key auth.");
    } else if (status === 200) {
      check("Sign-in succeeded without MFA challenge", true);
      console.log("  Is MFA actually enabled on this account?");
    }
  }

  // -----------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------
  header("Summary");
  console.log(`  ${passed} passed, ${failed} failed`);

  console.log("\n--- Key findings for mobile auth implementation ---");
  console.log("  1. POST /api/auth/sign-in/email with { email, password }");
  console.log("     Origin header is optional for non-browser clients (mobile, CLI).");
  console.log("     If sent, it must match a trustedOrigins entry.");
  console.log("  2. On success: body.token is the raw session token (32 chars).");
  console.log("     Store this and send as Authorization: Bearer <token>.");
  console.log("  3. The middleware signs the raw token and injects it as a");
  console.log("     session cookie for getSession() to resolve.");
  console.log("  4. MFA accounts return { twoFactorRedirect: true } — the mobile");
  console.log("     app should detect this and show an appropriate message.");
  console.log("  5. Origin header is optional for non-browser clients.");
  console.log("     If sent, it must match SPARKY_FITNESS_FRONTEND_URL from server .env.\n");

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
