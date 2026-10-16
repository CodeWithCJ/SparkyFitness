import type { FastingLog } from '../types/fasting';

export interface WatchFastPayload {
  /** Epoch ms. */
  startedAt: number;
  /** Epoch ms, or null for an open-ended fast. */
  targetEndAt: number | null;
  label: string | null;
}

/**
 * The fast as the watch's Fasting page wants it. `undefined` stays undefined
 * (the server has not answered, so the watch keeps what it had); `null` means
 * "not fasting".
 */
export function toWatchFast(
  fast: FastingLog | null | undefined
): WatchFastPayload | null | undefined {
  if (fast === undefined) return undefined;
  if (fast === null) return null;
  // Auto-calculated fasting reports the eating window as an "active" fast too.
  // It is the opposite of fasting, so the watch is told there is no fast.
  if (fast.is_eating_window) return null;
  const startedAt = new Date(fast.start_time).getTime();
  if (!Number.isFinite(startedAt)) return null;
  const target = fast.target_end_time
    ? new Date(fast.target_end_time).getTime()
    : null;
  return {
    startedAt,
    targetEndAt: target != null && Number.isFinite(target) ? target : null,
    label: fast.fasting_type ?? null,
  };
}
