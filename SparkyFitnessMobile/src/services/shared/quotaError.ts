// Health Connect enforces a foreground API call quota; once exceeded, every
// subsequent call fails with "API call quota exceeded". Splitting the failed
// range into more sub-windows (the normal fallback path) just multiplies the
// call rate and prolongs the outage, so callers short-circuit on quota errors.
const QUOTA_ERROR_PATTERNS = [/quota exceeded/i, /api call quota/i];

export const isQuotaExceededError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return QUOTA_ERROR_PATTERNS.some((pattern) => pattern.test(message));
};

// Health Connect rejects every call with "client is not initialized" once its
// client has gone away (the app was backgrounded, the provider updated, the
// device is locked). Unlike a transient per-window read failure, this is fatal
// for the whole run — splitting the range into sub-windows just repeats the
// same failure once per window, producing hundreds of identical errors and the
// AsyncStorage log churn that goes with them (#2191). Callers short-circuit on
// it exactly as they do on quota errors.
const CLIENT_UNAVAILABLE_PATTERNS = [/client is not initialized/i];

export const isClientUnavailableError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return CLIENT_UNAVAILABLE_PATTERNS.some((pattern) => pattern.test(message));
};

// A read that failed for a reason that will not change between syncs: the
// record type does not exist on this device's Health Connect / HealthKit
// version, or the user did not grant it. Re-reading cannot produce more data,
// so a session whose only failures are these is safe to record as collected.
//
// Everything NOT matched here is treated as retryable. That asymmetry is
// deliberate: caching a transient failure loses the session's telemetry
// permanently (the reuse cache has no expiry), while failing to cache a stable
// one only costs a re-read. The patterns are matched against native error text
// and may need widening as platform versions change — if a genuinely
// unsupported type stops matching, the cost is re-reads, never lost data.
const PERMANENT_UNAVAILABILITY_PATTERNS = [
  /securityexception/i,
  /not authorized/i,
  /unauthorized/i,
  /permission/i,
  /unsupported/i,
  /not supported/i,
  /authorization not determined/i,
];

export const isPermanentlyUnavailableError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return PERMANENT_UNAVAILABILITY_PATTERNS.some((pattern) => pattern.test(message));
};
