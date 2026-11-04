import { getClient } from '../db/poolManager.js';
import {
  placeWeeklyGoalPlan,
  type PlacedWeeklyGoalPlan,
} from '../utils/weeklyGoalPlanTimeline.js';

const DAY_PRESET_COLUMNS = [
  'monday_preset_id',
  'tuesday_preset_id',
  'wednesday_preset_id',
  'thursday_preset_id',
  'friday_preset_id',
  'saturday_preset_id',
  'sunday_preset_id',
] as const;

type DayPresetColumn = (typeof DAY_PRESET_COLUMNS)[number];

export type WeeklyGoalPlanInput = {
  plan_name: string;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
} & Partial<Record<DayPresetColumn, string | null>>;

export type WeeklyGoalPlanRow = WeeklyGoalPlanInput & {
  id: string;
  user_id: string;
};

/** Saving would make two switched-on plans cover the same day. */
export class WeeklyGoalPlanOverlapError extends Error {
  readonly status = 409;
  readonly code = 'WEEKLY_GOAL_PLAN_OVERLAP';
  constructor(plan: PlacedWeeklyGoalPlan) {
    super(
      `These dates overlap the plan "${plan.plan_name}" (${plan.start_date} to ${plan.end_date ?? 'no end date'}). Change that plan's dates first.`
    );
    this.name = 'WeeklyGoalPlanOverlapError';
  }
}

async function getWeeklyGoalPlansByUserId(userId: string) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      'SELECT * FROM weekly_goal_plans WHERE user_id = $1 ORDER BY start_date DESC',
      [userId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}
async function getActiveWeeklyGoalPlan(userId: string, date: string) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `SELECT * FROM weekly_goal_plans
       WHERE user_id = $1 AND is_active = TRUE
         AND start_date <= $2
         AND (end_date IS NULL OR end_date >= $2)
       ORDER BY start_date DESC
       LIMIT 1`,
      [userId, date]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}
/** Switched-on plans that cover any day from `startDate` to `endDate`. */
async function getActiveWeeklyGoalPlansInRange(
  userId: string,
  startDate: string,
  endDate: string
): Promise<WeeklyGoalPlanRow[]> {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `SELECT * FROM weekly_goal_plans
       WHERE user_id = $1 AND is_active = TRUE
         AND start_date <= $3
         AND (end_date IS NULL OR end_date >= $2)
       ORDER BY start_date DESC`,
      [userId, startDate, endDate]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Creates the plan (no `planId`) or updates it, first ending or replacing the
 * plan it takes over from (`placeWeeklyGoalPlan`). Undefined when `planId` is
 * not one of the user's plans.
 */
async function saveWeeklyGoalPlan(
  userId: string,
  planId: string | null,
  plan: WeeklyGoalPlanInput
): Promise<WeeklyGoalPlanRow | undefined> {
  const client = await getClient(userId); // User-specific operation
  try {
    await client.query('BEGIN');
    // Serialize one person's saves so two at once cannot both pass the overlap
    // check.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `weekly_goal_plans:${userId}`,
    ]);
    let wasActive = false;
    if (planId) {
      const existing = await client.query(
        'SELECT is_active FROM weekly_goal_plans WHERE id = $1 AND user_id = $2',
        [planId, userId]
      );
      if (existing.rows.length === 0) {
        await client.query('ROLLBACK');
        return undefined;
      }
      wasActive = existing.rows[0].is_active;
    }
    if (plan.is_active) {
      const others = await client.query(
        `SELECT id, plan_name, start_date, end_date FROM weekly_goal_plans
         WHERE user_id = $1 AND is_active = TRUE AND id IS DISTINCT FROM $2`,
        [userId, planId]
      );
      const placement = placeWeeklyGoalPlan(others.rows, plan, !wasActive);
      if (!placement.ok) {
        throw new WeeklyGoalPlanOverlapError(placement.overlaps);
      }
      for (const ended of placement.end) {
        await client.query(
          'UPDATE weekly_goal_plans SET end_date = $1, updated_at = now() WHERE id = $2 AND user_id = $3',
          [ended.end_date, ended.id, userId]
        );
      }
      if (placement.deactivate.length > 0) {
        await client.query(
          'UPDATE weekly_goal_plans SET is_active = FALSE, updated_at = now() WHERE id = ANY($1) AND user_id = $2',
          [placement.deactivate, userId]
        );
      }
    }
    const values = [
      plan.plan_name,
      plan.start_date,
      plan.end_date,
      plan.is_active,
      ...DAY_PRESET_COLUMNS.map((column) => plan[column] ?? null),
    ];
    const result = planId
      ? await client.query(
          `UPDATE weekly_goal_plans SET
            plan_name = $1, start_date = $2, end_date = $3, is_active = $4,
            monday_preset_id = $5, tuesday_preset_id = $6, wednesday_preset_id = $7,
            thursday_preset_id = $8, friday_preset_id = $9, saturday_preset_id = $10, sunday_preset_id = $11,
            updated_at = now()
          WHERE id = $12 AND user_id = $13
          RETURNING *`,
          [...values, planId, userId]
        )
      : await client.query(
          `INSERT INTO weekly_goal_plans (
            plan_name, start_date, end_date, is_active,
            monday_preset_id, tuesday_preset_id, wednesday_preset_id,
            thursday_preset_id, friday_preset_id, saturday_preset_id, sunday_preset_id,
            user_id
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          RETURNING *`,
          [...values, userId]
        );
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
async function deleteWeeklyGoalPlan(planId: string, userId: string) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      'DELETE FROM weekly_goal_plans WHERE id = $1 AND user_id = $2 RETURNING *',
      [planId, userId]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}
export { getWeeklyGoalPlansByUserId };
export { getActiveWeeklyGoalPlan };
export { getActiveWeeklyGoalPlansInRange };
export { saveWeeklyGoalPlan };
export { deleteWeeklyGoalPlan };
export default {
  getWeeklyGoalPlansByUserId,
  getActiveWeeklyGoalPlan,
  getActiveWeeklyGoalPlansInRange,
  saveWeeklyGoalPlan,
  deleteWeeklyGoalPlan,
};
