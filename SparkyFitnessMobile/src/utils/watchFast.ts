import type { FastingLog } from '../types/fasting';

export interface WatchFastPayload {
  /** Server fast row id for manual fasts; omitted for calculated fasts. */
  id?: string | null;
  /** Epoch ms. */
  startedAt: number;
  /** Epoch ms, or null for an open-ended fast. */
  targetEndAt: number | null;
  label: string | null;
}

/**
 * True when a server fasting row represents a terminal (non-active) fast.
 * Matches server `getCurrentFast` (`status = 'ACTIVE'`) so an `ACTIVE` row that
 * also carries an `end_time` is still treated as active, while `COMPLETED` and
 * `CANCELLED` rows are terminal even without an `end_time`.
 */
export function isTerminalFast(
  fast: Pick<FastingLog, 'status' | 'end_time'> | null | undefined
): boolean {
  if (!fast) return false;
  const status =
    typeof fast.status === 'string' ? fast.status.trim().toUpperCase() : '';
  if (status === 'COMPLETED' || status === 'CANCELLED') return true;
  if (status === 'ACTIVE') return false;
  return typeof fast.end_time === 'string' && fast.end_time.trim() !== '';
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
  if (isTerminalFast(fast)) return null;
  const startedAt = new Date(fast.start_time).getTime();
  if (!Number.isFinite(startedAt)) return null;
  const target = fast.target_end_time
    ? new Date(fast.target_end_time).getTime()
    : null;
  const manualId =
    !fast.is_auto_calculated &&
    typeof fast.id === 'string' &&
    fast.id.trim() !== ''
      ? fast.id.trim()
      : undefined;
  return {
    ...(manualId ? { id: manualId } : {}),
    startedAt,
    targetEndAt: target != null && Number.isFinite(target) ? target : null,
    label: fast.fasting_type ?? null,
  };
}
