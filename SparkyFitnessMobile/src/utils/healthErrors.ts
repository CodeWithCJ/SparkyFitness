/**
 * True when a HealthKit read failed only because the person has not been asked
 * for that permission yet. That is "no data", not a failure.
 */
export function isAuthorizationNotDeterminedError(error: unknown): boolean {
  if (!error) return false;
  const msg = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase();
  return (
    msg.includes('authorization status is not determined') ||
    msg.includes('authorization not determined') ||
    msg.includes('errorauthorizationnotdetermined') ||
    /healthkit[^]*\bcode=5\b/.test(msg)
  );
}
