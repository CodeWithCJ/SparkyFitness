// Health Connect enforces a foreground API call quota; once exceeded, every
// subsequent call fails with "API call quota exceeded". Splitting the failed
// range into more sub-windows (the normal fallback path) just multiplies the
// call rate and prolongs the outage, so callers short-circuit on quota errors.
const QUOTA_ERROR_PATTERNS = [/quota exceeded/i, /api call quota/i];

export const isQuotaExceededError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return QUOTA_ERROR_PATTERNS.some((pattern) => pattern.test(message));
};
