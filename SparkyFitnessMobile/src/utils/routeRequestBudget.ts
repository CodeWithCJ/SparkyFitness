/**
 * The generate endpoint allows 10 requests per person per 10 minutes. The
 * editor keeps its own count of what it has sent in that window and holds a
 * couple of requests back for the Generate screen, so a long edit session
 * pauses with a message rather than running into the server's 429.
 */
export const ROUTE_REQUEST_WINDOW_MS = 10 * 60 * 1000;
export const ROUTE_REQUEST_BUDGET = 8;

export interface RequestBudget {
  /** Uses one request if the window has room; false when it is full. */
  take(now?: number): boolean;
  /** Milliseconds until a request frees up; 0 when there is room now. */
  msUntilFree(now?: number): number;
  reset(): void;
}

/** A sliding window: a request counts until `windowMs` after it was sent. */
export function createRequestBudget(
  limit: number,
  windowMs: number
): RequestBudget {
  let sent: number[] = [];
  const prune = (now: number) => {
    sent = sent.filter((at) => now - at < windowMs);
  };
  return {
    take(now = Date.now()) {
      prune(now);
      if (sent.length >= limit) return false;
      sent.push(now);
      return true;
    },
    msUntilFree(now = Date.now()) {
      prune(now);
      const oldest = sent[0];
      return sent.length < limit || oldest === undefined
        ? 0
        : Math.max(1, oldest + windowMs - now);
    },
    reset() {
      sent = [];
    },
  };
}

/** Shared by every editor session, so leaving and reopening it does not reset the count. */
export const routeRequestBudget = createRequestBudget(
  ROUTE_REQUEST_BUDGET,
  ROUTE_REQUEST_WINDOW_MS
);
