import crypto from "node:crypto";

/**
 * Generates a cryptographically random code verifier (43-128 chars, URL-safe).
 */
export function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * Generates a S256 code challenge from a code verifier.
 */
export function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

/**
 * Verifies a code verifier against a stored code challenge (S256 method).
 * Returns true if the verifier hashes to the stored challenge.
 */
export function verifyCodeChallenge(verifier: string, storedChallenge: string): boolean {
  const computed = generateCodeChallenge(verifier);
  // Use timing-safe comparison to prevent timing attacks
  if (computed.length !== storedChallenge.length) return false;
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(storedChallenge));
}
