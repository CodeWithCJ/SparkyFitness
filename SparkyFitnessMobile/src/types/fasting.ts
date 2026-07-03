/**
 * Mobile-facing fasting wire types. Like the other API clients, the mobile app
 * uses string-dated response shapes (ISO-8601) rather than the `Date`-based
 * `@workspace/shared` zod type.
 *
 * Fields are typed defensively: `target_end_time`, `fasting_type`, and `status`
 * are all nullable server-side, and an active fast created by the AI/chatbot
 * path can have `target_end_time = null` (elapsed-only).
 */
export interface FastingLog {
  id: string;
  user_id: string;
  start_time: string;
  end_time: string | null;
  target_end_time: string | null;
  duration_minutes: number | null;
  fasting_type: string | null;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | null;
  created_at: string | null;
  updated_at: string | null;
}

/**
 * `/api/fasting/stats`. Postgres returns the count as a string and the SUM/AVG
 * as `null` when there are no completed fasts (FILTER over an empty set). All
 * downstream formatting must null-coalesce.
 */
export interface FastingStats {
  total_completed_fasts: string | number | null;
  total_minutes_fasted: string | number | null;
  average_duration_minutes: string | number | null;
}
