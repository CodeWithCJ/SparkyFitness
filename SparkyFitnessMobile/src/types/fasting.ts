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
  is_auto_calculated?: boolean;
  start_meal_name?: string;
  is_eating_window?: boolean;
  eating_window_remaining_minutes?: number;
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

/**
 * `/api/fasting/preferences`. Mirrors the shared `UserFastingPreferences`
 * schema with string-free primitives (the mobile client never sees `Date`s).
 */
export interface FastingPreferences {
  id?: string;
  user_id: string;
  auto_calculate: boolean;
  default_protocol: string;
  target_fasting_hours: number;
  target_eating_hours: number;
  calorie_threshold: number;
  pre_end_alert_minutes: number;
  eating_window_alert: boolean;
}

export type FastingPreferencesUpdate = Partial<
  Omit<FastingPreferences, 'id' | 'user_id'>
>;
