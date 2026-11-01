/**
 * A change to a calorie setting records the rules in force from that day on
 * (#1795), so past days keep the target they were logged against. The record
 * is written by a trigger on user_preferences; these tests drive it through
 * the repository as the app role, so grants and row-level security apply.
 *
 * Skipped unless a test database is reachable.
 */

import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { CALORIE_RULE_FIELDS, todayInZone } from '@workspace/shared';
import type { CalorieRuleField, CalorieRules } from '@workspace/shared';
import { endPool } from '../db/poolManager.js';
import preferenceRepository from '../models/preferenceRepository.js';
import calorieRuleHistoryRepository from '../models/calorieRuleHistoryRepository.js';

function ownerClient() {
  return new pg.Client({
    host: process.env.SPARKY_FITNESS_DB_HOST,
    port: Number(process.env.SPARKY_FITNESS_DB_PORT) || 5432,
    database: process.env.SPARKY_FITNESS_DB_NAME,
    user: process.env.SPARKY_FITNESS_DB_USER,
    password: process.env.SPARKY_FITNESS_DB_PASSWORD,
    connectionTimeoutMillis: 2000,
  });
}

async function isDbReachable(): Promise<boolean> {
  if (process.env.SKIP_RLS_MATRIX === '1') return false;
  if (!process.env.SPARKY_FITNESS_DB_HOST) return false;
  if (!/(^|[_-])test([_-]|$)/i.test(process.env.SPARKY_FITNESS_DB_NAME ?? ''))
    return false;
  const probe = ownerClient();
  try {
    await probe.connect();
    await probe.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => {});
  }
}

const RUN = await isDbReachable();

const before: CalorieRules = {
  goal_mode: 'maintain',
  goal_mode_calculation_method: 'manual',
  goal_mode_custom_percentage: 0,
  goal_mode_weekly_change_kg: 0,
  calorie_goal_adjustment_mode: 'dynamic',
  exercise_calorie_percentage: 100,
  tdee_allow_negative_adjustment: false,
  calorie_safety_floor_mode: 'standard',
  calorie_safety_floor_value: 1200,
  adaptive_activity_separate: false,
  bmr_algorithm: 'Mifflin-St Jeor',
  activity_level: 'not_much',
  use_external_bmr: false,
  include_bmr_in_net_calories: false,
  adjust_macros_with_exercise: false,
};

// Typed by field, so a new calorie rule cannot be added without a value here.
const changed: Record<CalorieRuleField, CalorieRules[CalorieRuleField]> = {
  goal_mode: 'cut',
  goal_mode_calculation_method: 'adaptive',
  goal_mode_custom_percentage: 10,
  goal_mode_weekly_change_kg: -0.5,
  calorie_goal_adjustment_mode: 'adaptive',
  exercise_calorie_percentage: 50,
  tdee_allow_negative_adjustment: true,
  calorie_safety_floor_mode: 'custom',
  calorie_safety_floor_value: 1500,
  adaptive_activity_separate: true,
  bmr_algorithm: 'Katch-McArdle',
  activity_level: 'active',
  use_external_bmr: true,
  include_bmr_in_net_calories: true,
  adjust_macros_with_exercise: true,
};

describe.runIf(RUN)('calorie rule history', () => {
  let db: pg.Client;
  const userId = randomUUID();

  const history = async () =>
    (
      await db.query(
        `SELECT ${CALORIE_RULE_FIELDS.join(', ')}, effective_date::text AS effective_date
         FROM public.user_calorie_rule_history
         WHERE user_id = $1
         ORDER BY user_calorie_rule_history.effective_date`,
        [userId]
      )
    ).rows;

  // Run as the owner, so it fires the trigger too; clear history afterwards.
  const resetPreferences = async (timezone = 'UTC') => {
    const fields = Object.keys(before);
    await db.query(
      `UPDATE public.user_preferences
       SET ${fields.map((field, i) => `${field} = $${i + 2}`).join(', ')},
           timezone = $${fields.length + 2}
       WHERE user_id = $1`,
      [userId, ...Object.values(before), timezone]
    );
    await db.query(
      'DELETE FROM public.user_calorie_rule_history WHERE user_id = $1',
      [userId]
    );
  };

  beforeAll(async () => {
    db = ownerClient();
    await db.connect();
    await db.query(
      'INSERT INTO public."user" (id, email, email_verified) VALUES ($1, $2, true)',
      [userId, `calorie-rules-${userId}@example.test`]
    );
    await db.query(
      'INSERT INTO public.user_preferences (user_id) VALUES ($1)',
      [userId]
    );
  });

  beforeEach(() => resetPreferences());

  afterAll(async () => {
    await db.query('DELETE FROM public."user" WHERE id = $1', [userId]);
    await db.end();
    await endPool();
  });

  it('stores every calorie rule, with the type user_preferences gives it', async () => {
    const columns = await db.query(
      `SELECT table_name, column_name, data_type, character_maximum_length
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name IN ('user_calorie_rule_history', 'user_preferences')`
    );
    const shape = (table: string) =>
      Object.fromEntries(
        columns.rows
          .filter((column) => column.table_name === table)
          .map((column) => [
            column.column_name,
            `${column.data_type}(${column.character_maximum_length})`,
          ])
      );
    const stored = shape('user_calorie_rule_history');
    const preferences = shape('user_preferences');

    expect(
      Object.keys(stored)
        .filter(
          (column) =>
            ![
              'id',
              'user_id',
              'effective_date',
              'created_at',
              'updated_at',
            ].includes(column)
        )
        .sort()
    ).toEqual([...CALORIE_RULE_FIELDS].sort());
    for (const field of CALORIE_RULE_FIELDS) {
      expect(stored[field], field).toBe(preferences[field]);
    }
  });

  it.each(CALORIE_RULE_FIELDS)(
    'a change of %s keeps the old rules for earlier days',
    async (field) => {
      await preferenceRepository.updateUserPreferences(userId, {
        [field]: changed[field],
      });

      expect(await history()).toEqual([
        { ...before, effective_date: '-infinity' },
        {
          ...before,
          [field]: changed[field],
          effective_date: todayInZone('UTC'),
        },
      ]);
    }
  );

  it('a second change the same day replaces the first', async () => {
    await preferenceRepository.updateUserPreferences(userId, {
      goal_mode: 'cut',
    });
    await preferenceRepository.updateUserPreferences(userId, {
      goal_mode: 'bulk',
      activity_level: 'active',
    });

    expect(await history()).toEqual([
      { ...before, effective_date: '-infinity' },
      {
        ...before,
        goal_mode: 'bulk',
        activity_level: 'active',
        effective_date: todayInZone('UTC'),
      },
    ]);
  });

  it.each([true, false])(
    'reapplies the macro migration with existing history %s without changing past opt-ins',
    async (hasHistory) => {
      await preferenceRepository.updateUserPreferences(userId, {
        adjust_macros_with_exercise: true,
      });
      // A preview had the preference before history gained the matching column.
      await db.query(
        hasHistory
          ? 'UPDATE public.user_calorie_rule_history SET adjust_macros_with_exercise = false WHERE user_id = $1'
          : 'DELETE FROM public.user_calorie_rule_history WHERE user_id = $1',
        [userId]
      );
      const migration = await readFile(
        new URL(
          '../db/migrations/20261024170000_add_exercise_macro_adjustment.sql',
          import.meta.url
        ),
        'utf8'
      );
      const enabledHistory = [
        { ...before, effective_date: '-infinity' },
        {
          ...before,
          adjust_macros_with_exercise: true,
          effective_date: todayInZone('UTC'),
        },
      ];

      await db.query(migration);
      expect(await history()).toEqual(enabledHistory);
      await db.query(migration);
      expect(await history()).toEqual(enabledHistory);

      await preferenceRepository.updateUserPreferences(userId, {
        adjust_macros_with_exercise: false,
      });
      await db.query(migration);
      expect(await history()).toEqual([
        { ...before, effective_date: '-infinity' },
        { ...before, effective_date: todayInZone('UTC') },
      ]);
    }
  );

  it('an initially enabled macro preference starts today and leaves earlier days disabled', async () => {
    await db.query('DELETE FROM public.user_preferences WHERE user_id = $1', [
      userId,
    ]);
    await db.query(
      'DELETE FROM public.user_calorie_rule_history WHERE user_id = $1',
      [userId]
    );
    await preferenceRepository.upsertUserPreferences({
      user_id: userId,
      ...before,
      adjust_macros_with_exercise: true,
      timezone: 'UTC',
    });
    expect(await history()).toEqual([
      { ...before, effective_date: '-infinity' },
      {
        ...before,
        adjust_macros_with_exercise: true,
        effective_date: todayInZone('UTC'),
      },
    ]);
  });

  it('records nothing when no calorie rule changes', async () => {
    await preferenceRepository.updateUserPreferences(userId, {
      date_format: 'dd/MM/yyyy',
      goal_mode: 'maintain',
    });

    expect(await history()).toEqual([]);
  });

  // 25 hours apart, so at any time of day one of them is not on UTC's date.
  const farZones = ['Pacific/Kiritimati', 'Pacific/Pago_Pago'];

  it.each(farZones.flatMap((zone) => [zone, zone.toLowerCase()]))(
    "dates the change by the user's timezone (%s)",
    async (zone) => {
      await resetPreferences(zone);
      await preferenceRepository.updateUserPreferences(userId, {
        goal_mode: 'cut',
      });

      expect((await history()).map((row) => row.effective_date)).toEqual([
        '-infinity',
        todayInZone(
          farZones.find((far) => far.toLowerCase() === zone.toLowerCase())!
        ),
      ]);
    }
  );

  it('records the settings of a preferences row created again', async () => {
    await preferenceRepository.updateUserPreferences(userId, {
      goal_mode: 'cut',
    });
    await preferenceRepository.deleteUserPreferences(userId);
    await preferenceRepository.upsertUserPreferences({
      user_id: userId,
      goal_mode: 'bulk',
    });

    expect(
      (await history()).map((row) => [row.effective_date, row.goal_mode])
    ).toEqual([
      ['-infinity', 'maintain'],
      [todayInZone('UTC'), 'bulk'],
    ]);
  });

  it('records nothing for a first preferences row', async () => {
    await db.query('DELETE FROM public.user_preferences WHERE user_id = $1', [
      userId,
    ]);
    await db.query(
      'INSERT INTO public.user_preferences (user_id, goal_mode) VALUES ($1, $2)',
      [userId, 'cut']
    );

    expect(await history()).toEqual([]);
  });

  it('falls back to UTC for an unknown timezone instead of failing the save', async () => {
    await resetPreferences('Not/A_Zone');
    await preferenceRepository.updateUserPreferences(userId, {
      goal_mode: 'cut',
    });

    expect((await history()).map((row) => row.effective_date)).toEqual([
      '-infinity',
      todayInZone('UTC'),
    ]);
  });

  it('is read back for a range as the rules in force on each day', async () => {
    await preferenceRepository.updateUserPreferences(userId, {
      goal_mode: 'cut',
    });
    const today = todayInZone('UTC');

    const rows = await calorieRuleHistoryRepository.getCalorieRuleHistory(
      userId,
      '2020-01-01',
      today
    );

    expect(rows.map((row) => [row.effective_date, row.goal_mode])).toEqual([
      ['-infinity', 'maintain'],
      [today, 'cut'],
    ]);
  });
});
