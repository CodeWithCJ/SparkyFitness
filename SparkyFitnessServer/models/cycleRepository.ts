import { getClient } from '../db/poolManager.js';
import type {
  CreateTestEntryBody,
  UpsertCycleSettingsBody,
  UpsertDailyLogBody,
} from '../schemas/cycleSchemas.js';
import { localDateToDay, addDays } from '@workspace/shared';
import type { DerivedCycle } from '@workspace/shared';

const SETTINGS_COLS = `id, user_id, enabled, mode, avg_cycle_length_override, avg_period_length_override,
  luteal_phase_length, birth_control_method, conditions, show_fertile_window, preferred_products,
  dismissed_prompts, terminology, discreet_mode, onboarded_at, created_at, updated_at`;

const LOG_COLS = `id, user_id, entry_date, flow_level, product_usage, cervical_mucus,
  unusual_discharge, energy, libido, notes, intercourse, intercourse_protected, cervical_position, custom_fields, created_at, updated_at`;

const CYCLE_COLS = `id, user_id, start_date, end_date, period_length, cycle_length, is_excluded,
  source, birth_control_method, created_at, updated_at`;

// --- Settings ---------------------------------------------------------------

async function getSettings(userId: string) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT ${SETTINGS_COLS} FROM cycle_settings WHERE user_id = $1`,
      [userId]
    );
    return result.rows[0] ?? null;
  } finally {
    client.release();
  }
}

async function upsertSettings(
  userId: string,
  data: UpsertCycleSettingsBody & { mark_onboarded?: boolean }
) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `INSERT INTO cycle_settings (
         user_id, enabled, mode, avg_cycle_length_override, avg_period_length_override,
         luteal_phase_length, birth_control_method, conditions, show_fertile_window,
         preferred_products, dismissed_prompts, terminology, discreet_mode, onboarded_at)
        VALUES ($1,
         COALESCE($2, TRUE), COALESCE($3, 'standard'), $4, $5,
         COALESCE($6, 14), COALESCE($7, 'none'), COALESCE($8::text[], '{}'), COALESCE($9, TRUE),
         COALESCE($10::text[], '{pad,tampon}'), COALESCE($11::text[], '{}'), COALESCE($12, 'default'),
         COALESCE($13, FALSE), CASE WHEN $15 THEN NULL WHEN $14 THEN NOW() ELSE NULL END)
       ON CONFLICT (user_id) DO UPDATE SET
         enabled = COALESCE($2, cycle_settings.enabled),
         mode = COALESCE($3, cycle_settings.mode),
         avg_cycle_length_override = $4,
         avg_period_length_override = $5,
         luteal_phase_length = COALESCE($6, cycle_settings.luteal_phase_length),
         birth_control_method = COALESCE($7, cycle_settings.birth_control_method),
         conditions = COALESCE($8::text[], cycle_settings.conditions),
         show_fertile_window = COALESCE($9, cycle_settings.show_fertile_window),
         preferred_products = COALESCE($10::text[], cycle_settings.preferred_products),
         dismissed_prompts = COALESCE($11::text[], cycle_settings.dismissed_prompts),
         terminology = COALESCE($12, cycle_settings.terminology),
         discreet_mode = COALESCE($13, cycle_settings.discreet_mode),
         onboarded_at = CASE WHEN $15 THEN NULL
                             WHEN $14 THEN COALESCE(cycle_settings.onboarded_at, NOW())
                             ELSE cycle_settings.onboarded_at END,
         updated_at = NOW()
       RETURNING ${SETTINGS_COLS}`,
      [
        userId,
        data.enabled ?? null,
        data.mode ?? null,
        data.avg_cycle_length_override ?? null,
        data.avg_period_length_override ?? null,
        data.luteal_phase_length ?? null,
        data.birth_control_method ?? null,
        data.conditions ?? null,
        data.show_fertile_window ?? null,
        data.preferred_products ?? null,
        data.dismissed_prompts ?? null,
        data.terminology ?? null,
        data.discreet_mode ?? null,
        data.mark_onboarded ?? false,
        data.reset_onboarding ?? false,
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function dismissPrompt(userId: string, key: string) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `UPDATE cycle_settings
       SET dismissed_prompts = (
         SELECT ARRAY(SELECT DISTINCT unnest(dismissed_prompts || ARRAY[$2]))
       ), updated_at = NOW()
       WHERE user_id = $1
       RETURNING ${SETTINGS_COLS}`,
      [userId, key]
    );
    return result.rows[0] ?? null;
  } finally {
    client.release();
  }
}

// --- Daily logs -------------------------------------------------------------

async function getLog(userId: string, date: string) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT ${LOG_COLS} FROM cycle_daily_entries WHERE user_id = $1 AND entry_date = $2`,
      [userId, date]
    );
    return result.rows[0] ?? null;
  } finally {
    client.release();
  }
}

async function upsertLog(
  userId: string,
  date: string,
  data: UpsertDailyLogBody
) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `INSERT INTO cycle_daily_entries (
         user_id, entry_date, flow_level, product_usage, cervical_mucus,
         unusual_discharge, energy, libido, notes, intercourse, intercourse_protected, cervical_position, custom_fields)
       VALUES ($1, $2, $3, COALESCE($4, '{}'::jsonb), $5,
         COALESCE($6::text[], '{}'), $7, $8, $9, $10, $11, $12, COALESCE($13, '{}'::jsonb))
       ON CONFLICT (user_id, entry_date) DO UPDATE SET
         flow_level = COALESCE($3, cycle_daily_entries.flow_level),
         product_usage = COALESCE($4, cycle_daily_entries.product_usage),
         cervical_mucus = COALESCE($5, cycle_daily_entries.cervical_mucus),
         unusual_discharge = COALESCE($6::text[], cycle_daily_entries.unusual_discharge),
         energy = COALESCE($7, cycle_daily_entries.energy),
         libido = COALESCE($8, cycle_daily_entries.libido),
         notes = COALESCE($9, cycle_daily_entries.notes),
         intercourse = COALESCE($10, cycle_daily_entries.intercourse),
         intercourse_protected = COALESCE($11, cycle_daily_entries.intercourse_protected),
         cervical_position = COALESCE($12, cycle_daily_entries.cervical_position),
         custom_fields = COALESCE($13, cycle_daily_entries.custom_fields),
         updated_at = NOW()
       RETURNING ${LOG_COLS}`,
      [
        userId,
        date,
        data.flow_level ?? null,
        data.product_usage ? JSON.stringify(data.product_usage) : null,
        data.cervical_mucus ?? null,
        data.unusual_discharge ?? null,
        data.energy ?? null,
        data.libido ?? null,
        data.notes ?? null,
        data.intercourse ?? null,
        data.intercourse_protected ?? null,
        data.cervical_position ?? null,
        data.custom_fields ? JSON.stringify(data.custom_fields) : null,
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function deleteLog(userId: string, date: string): Promise<boolean> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      'DELETE FROM cycle_daily_entries WHERE user_id = $1 AND entry_date = $2 RETURNING id',
      [userId, date]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

async function listLogs(userId: string, startDate: string, endDate: string) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT ${LOG_COLS} FROM cycle_daily_entries
       WHERE user_id = $1 AND entry_date >= $2 AND entry_date <= $3
       ORDER BY entry_date ASC`,
      [userId, startDate, endDate]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

/** All period-evidence days (flow or products) for cycle derivation. */
async function listEvidence(userId: string) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT entry_date, flow_level, product_usage FROM cycle_daily_entries
       WHERE user_id = $1
       ORDER BY entry_date ASC`,
      [userId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

// --- Cycles -----------------------------------------------------------------

async function listCycles(userId: string, limit?: number) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT ${CYCLE_COLS} FROM cycles WHERE user_id = $1
       ORDER BY start_date DESC ${limit ? 'LIMIT ' + Number(limit) : ''}`,
      [userId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Replaces the derived cycle history. Manually-corrected cycles (source='manual')
 * are preserved; only derived rows are rebuilt. Runs in a single transaction.
 */
async function replaceDerivedCycles(
  userId: string,
  cycles: (DerivedCycle & { birth_control_method?: string | null })[]
) {
  const client = await getClient(userId);
  try {
    await client.query('BEGIN');
    await client.query(
      "DELETE FROM cycles WHERE user_id = $1 AND source = 'derived'",
      [userId]
    );
    for (const c of cycles) {
      await client.query(
        `INSERT INTO cycles (user_id, start_date, end_date, period_length, cycle_length,
           source, birth_control_method)
         VALUES ($1, $2, $3, $4, $5, 'derived', $6)
         ON CONFLICT (user_id, start_date) DO UPDATE SET
           end_date = EXCLUDED.end_date,
           period_length = EXCLUDED.period_length,
           cycle_length = EXCLUDED.cycle_length,
           birth_control_method = EXCLUDED.birth_control_method,
           updated_at = NOW()
         WHERE cycles.source = 'derived'`,
        [
          userId,
          c.start_date,
          c.end_date,
          c.period_length,
          c.cycle_length,
          c.birth_control_method ?? null,
        ]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function bulkUpsertFlowLogs(
  userId: string,
  entries: Array<{ date: string; flow_level: any }>
) {
  const client = await getClient(userId);
  try {
    await client.query('BEGIN');
    for (const entry of entries) {
      await client.query(
        `INSERT INTO cycle_daily_entries (user_id, entry_date, flow_level, product_usage, unusual_discharge)
         VALUES ($1, $2, $3, '{}'::jsonb, '{}'::text[])
         ON CONFLICT (user_id, entry_date) DO UPDATE SET
           flow_level = EXCLUDED.flow_level,
           updated_at = NOW()`,
        [userId, entry.date, entry.flow_level]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function createManualCycle(
  userId: string,
  data: {
    start_date: string;
    end_date?: string | null;
    period_length?: number | null;
    cycle_length?: number | null;
    is_excluded?: boolean;
  }
) {
  const client = await getClient(userId);
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO cycles (user_id, start_date, end_date, period_length, cycle_length, is_excluded, source)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, FALSE), 'manual')
       ON CONFLICT (user_id, start_date) DO UPDATE SET
         end_date = EXCLUDED.end_date,
         period_length = EXCLUDED.period_length,
         cycle_length = EXCLUDED.cycle_length,
         is_excluded = EXCLUDED.is_excluded,
         source = 'manual',
         updated_at = NOW()
       RETURNING id, start_date, end_date, period_length, cycle_length, is_excluded, source`,
      [
        userId,
        data.start_date,
        data.end_date ?? null,
        data.period_length ?? null,
        data.cycle_length ?? null,
        data.is_excluded ?? false,
      ]
    );

    const saved = result.rows[0];

    if (saved && data.period_length && data.period_length > 0) {
      for (let i = 0; i < data.period_length; i++) {
        const dateStr = addDays(data.start_date, i);
        await client.query(
          `INSERT INTO cycle_daily_entries (user_id, entry_date, flow_level, product_usage, unusual_discharge)
           VALUES ($1, $2, 'medium', '{}'::jsonb, '{}'::text[])
           ON CONFLICT (user_id, entry_date) DO UPDATE SET
             flow_level = EXCLUDED.flow_level,
             updated_at = NOW()`,
          [userId, dateStr]
        );
      }
    }

    await client.query('COMMIT');
    return saved;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function updateCycle(
  userId: string,
  cycleId: string,
  data: {
    start_date?: string;
    end_date?: string | null;
    period_length?: number | null;
    cycle_length?: number | null;
    is_excluded?: boolean;
  }
) {
  const client = await getClient(userId);
  try {
    await client.query('BEGIN');

    // 1. Fetch the old cycle details first (especially for manual cycles)
    const oldRes = await client.query(
      `SELECT start_date, end_date, period_length, source FROM cycles
       WHERE id = $1 AND user_id = $2`,
      [cycleId, userId]
    );
    if (oldRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return null;
    }
    const oldCycle = oldRes.rows[0];

    // 2. Perform the update
    const result = await client.query(
      `UPDATE cycles
       SET start_date = COALESCE($3, start_date),
           end_date = $4,
           period_length = COALESCE($5, period_length),
           cycle_length = $6,
           is_excluded = COALESCE($7, is_excluded),
           source = 'manual',
           updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING id, start_date, end_date, period_length, cycle_length, is_excluded, source`,
      [
        cycleId,
        userId,
        data.start_date ?? null,
        data.end_date ?? null,
        data.period_length ?? null,
        data.cycle_length ?? null,
        data.is_excluded ?? null,
      ]
    );

    const updatedCycle = result.rows[0];

    // 3. For manual cycles, if the start date or period length changed, sync the daily entries
    if (oldCycle.source === 'manual' && updatedCycle) {
      const oldStart = oldCycle.start_date;
      const oldLen = oldCycle.period_length;
      const newStart = updatedCycle.start_date;
      const newLen = updatedCycle.period_length;

      if (oldStart !== newStart || oldLen !== newLen) {
        // Clear old manual period entries
        if (oldStart && oldLen > 0) {
          const oldEnd = addDays(oldStart, oldLen - 1);
          await client.query(
            `UPDATE cycle_daily_entries
             SET flow_level = NULL, product_usage = '{}'::jsonb, updated_at = NOW()
             WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3`,
            [userId, oldStart, oldEnd]
          );
        }

        // Insert/upsert new manual period entries
        if (newStart && newLen > 0) {
          for (let i = 0; i < newLen; i++) {
            const dateStr = addDays(newStart, i);
            await client.query(
              `INSERT INTO cycle_daily_entries (user_id, entry_date, flow_level, product_usage, unusual_discharge)
               VALUES ($1, $2, 'medium', '{}'::jsonb, '{}'::text[])
               ON CONFLICT (user_id, entry_date) DO UPDATE SET
                 flow_level = EXCLUDED.flow_level,
                 updated_at = NOW()`,
              [userId, dateStr]
            );
          }
        }
      }
    }

    await client.query('COMMIT');
    return updatedCycle ?? null;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function deleteCycle(userId: string, cycleId: string): Promise<boolean> {
  const client = await getClient(userId);
  try {
    await client.query('BEGIN');
    // Look up the cycle first: derived cycles are rebuilt from daily-log flow
    // evidence, so deleting the row alone would let recompute recreate it.
    const found = await client.query(
      `SELECT start_date, end_date, source FROM cycles
       WHERE id = $1 AND user_id = $2`,
      [cycleId, userId]
    );
    if (found.rowCount === 0) {
      await client.query('ROLLBACK');
      return false;
    }
    const { start_date, end_date } = found.rows[0];

    // Clear the underlying period evidence (flow + products) in this cycle's date range
    // so the recompute does not resurrect it. Other fields on those days (BBT, symptoms,
    // mood, notes) are preserved.
    if (end_date) {
      await client.query(
        `UPDATE cycle_daily_entries
         SET flow_level = NULL, product_usage = '{}'::jsonb, updated_at = NOW()
         WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3`,
        [userId, start_date, end_date]
      );
    } else {
      // Open (current) cycle: no next cycle, clear from its start onward.
      await client.query(
        `UPDATE cycle_daily_entries
         SET flow_level = NULL, product_usage = '{}'::jsonb, updated_at = NOW()
         WHERE user_id = $1 AND entry_date >= $2`,
        [userId, start_date]
      );
    }

    const result = await client.query(
      'DELETE FROM cycles WHERE id = $1 AND user_id = $2 RETURNING id',
      [cycleId, userId]
    );
    await client.query('COMMIT');
    return (result.rowCount ?? 0) > 0;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function listAllCycleSymptoms(userId: string) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT entry_date, symptom_name_snapshot, severity
       FROM symptom_entries
       WHERE user_id = $1 AND source = 'cycle'
       ORDER BY entry_date ASC`,
      [userId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function createTestEntry(userId: string, data: CreateTestEntryBody) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `INSERT INTO cycle_test_entries (user_id, entry_date, tested_at, test_type, result, notes)
       VALUES ($1, $2, COALESCE($3::timestamptz, NOW()), $4, $5, $6)
       RETURNING id, user_id, entry_date, tested_at, test_type, result, notes, created_at, updated_at`,
      [
        userId,
        data.entry_date,
        data.tested_at ?? null,
        data.test_type,
        data.result,
        data.notes ?? null,
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function listTestEntries(
  userId: string,
  startDate: string,
  endDate: string
) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT id, user_id, entry_date, tested_at, test_type, result, notes, created_at, updated_at
       FROM cycle_test_entries
       WHERE user_id = $1 AND entry_date >= $2 AND entry_date <= $3
       ORDER BY tested_at ASC`,
      [userId, startDate, endDate]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function listAllTestEntries(userId: string) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT id, user_id, entry_date, tested_at, test_type, result, notes, created_at, updated_at
       FROM cycle_test_entries
       WHERE user_id = $1
       ORDER BY tested_at ASC`,
      [userId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function deleteTestEntry(userId: string, id: string): Promise<boolean> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      'DELETE FROM cycle_test_entries WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

// --- Correlation sources & export -------------------------------------------

interface MetricRow {
  entry_date: string;
  value: number;
}

/**
 * Fetches dated metric values for cycle-phase correlation: body weight
 * (check-in), mood score, sleep hours, and cycle-log energy — all owner-scoped.
 */
async function getCorrelationSources(userId: string) {
  const client = await getClient(userId);
  try {
    const [weights, moods, sleep, energy] = await Promise.all([
      client.query(
        `SELECT entry_date, weight AS value FROM check_in_measurements
         WHERE user_id = $1 AND weight IS NOT NULL ORDER BY entry_date ASC`,
        [userId]
      ),
      client.query(
        `SELECT entry_date, mood_value AS value FROM mood_entries
         WHERE user_id = $1 ORDER BY entry_date ASC`,
        [userId]
      ),
      client.query(
        `SELECT entry_date, ROUND(duration_in_seconds / 3600.0, 2) AS value
         FROM sleep_entries WHERE user_id = $1 ORDER BY entry_date ASC`,
        [userId]
      ),
      client.query(
        `SELECT entry_date, energy AS value FROM cycle_daily_entries
         WHERE user_id = $1 AND energy IS NOT NULL ORDER BY entry_date ASC`,
        [userId]
      ),
    ]);
    const map = (rows: MetricRow[]) =>
      rows.map((r) => ({
        date: normalizeDay(r.entry_date),
        value: Number(r.value),
      }));
    return {
      weight: map(weights.rows),
      mood: map(moods.rows),
      sleep: map(sleep.rows),
      energy: map(energy.rows),
    };
  } finally {
    client.release();
  }
}

/**
 * BBT is stored in the shared `basal_body_temperature` custom measurement
 * (same category the mobile app syncs into), not in cycle_daily_entries. Returns a
 * { 'YYYY-MM-DD': °C } map for the prediction engine.
 */
async function getBbtMap(userId: string): Promise<Record<string, number>> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT cm.entry_date, cm.value
       FROM custom_measurements cm
       JOIN custom_categories cc ON cc.id = cm.category_id
       WHERE cm.user_id = $1 AND cc.name = 'basal_body_temperature'
       ORDER BY cm.entry_date ASC`,
      [userId]
    );
    const map: Record<string, number> = {};
    for (const row of result.rows) {
      const v = Number(row.value);
      if (Number.isFinite(v)) map[normalizeDay(row.entry_date)] = v;
    }
    return map;
  } finally {
    client.release();
  }
}

/** Whether the user has the basal_body_temperature custom category set up. */
async function hasBbtCategory(userId: string): Promise<boolean> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT 1 FROM custom_categories
       WHERE user_id = $1 AND name = 'basal_body_temperature' LIMIT 1`,
      [userId]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

/** Full owner-scoped dump for data export (Phase 5). */
async function exportAll(userId: string) {
  const client = await getClient(userId);
  try {
    const [settings, logs, cycles, tests] = await Promise.all([
      client.query(
        `SELECT ${SETTINGS_COLS} FROM cycle_settings WHERE user_id = $1`,
        [userId]
      ),
      client.query(
        `SELECT ${LOG_COLS} FROM cycle_daily_entries WHERE user_id = $1 ORDER BY entry_date ASC`,
        [userId]
      ),
      client.query(
        `SELECT ${CYCLE_COLS} FROM cycles WHERE user_id = $1 ORDER BY start_date ASC`,
        [userId]
      ),
      client.query(
        `SELECT id, user_id, entry_date, tested_at, test_type, result, notes
         FROM cycle_test_entries WHERE user_id = $1 ORDER BY entry_date ASC`,
        [userId]
      ),
    ]);
    return {
      settings: settings.rows[0] ?? null,
      daily_logs: logs.rows,
      cycles: cycles.rows,
      test_entries: tests.rows,
    };
  } finally {
    client.release();
  }
}

async function getDisplayPreferences(
  userId: string,
  viewGroup: string,
  platform = 'web'
) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT visible_items FROM user_cycle_display_preferences
       WHERE user_id = $1 AND view_group = $2 AND platform = $3`,
      [userId, viewGroup, platform]
    );
    if (result.rows.length === 0) {
      return null;
    }
    return result.rows[0].visible_items;
  } finally {
    client.release();
  }
}

async function upsertDisplayPreferences(
  userId: string,
  viewGroup: string,
  visibleItems: any,
  platform = 'web'
) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `INSERT INTO user_cycle_display_preferences (user_id, view_group, platform, visible_items)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (user_id, view_group, platform) DO UPDATE SET
         visible_items = $4::jsonb,
         updated_at = NOW()
       RETURNING visible_items`,
      [userId, viewGroup, platform, JSON.stringify(visibleItems)]
    );
    return result.rows[0].visible_items;
  } finally {
    client.release();
  }
}

function normalizeDay(value: string | Date): string {
  // pg returns DATE columns as local-midnight Date objects; use local getters
  // (not toISOString, which shifts the day for servers ahead of UTC).
  if (value instanceof Date) return localDateToDay(value);
  return String(value).slice(0, 10);
}

export default {
  getSettings,
  upsertSettings,
  dismissPrompt,
  getCorrelationSources,
  getBbtMap,
  hasBbtCategory,
  exportAll,
  getLog,
  upsertLog,
  deleteLog,
  listLogs,
  listEvidence,
  listCycles,
  replaceDerivedCycles,
  bulkUpsertFlowLogs,
  createManualCycle,
  updateCycle,
  deleteCycle,
  listAllCycleSymptoms,
  createTestEntry,
  listTestEntries,
  listAllTestEntries,
  deleteTestEntry,
  getDisplayPreferences,
  upsertDisplayPreferences,
};
