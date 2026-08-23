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
