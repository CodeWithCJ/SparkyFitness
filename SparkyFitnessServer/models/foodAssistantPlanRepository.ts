import { z } from 'zod';
import type { PoolClient } from 'pg';
import { getClient } from '../db/poolManager.js';
import { FoodAssistantConflict } from './foodAssistantRepository.js';
import * as diary from './foodAssistantDiaryRepository.js';
import type { DiarySnapshot } from './foodAssistantDiaryRepository.js';

const snapshot = z.record(z.string(), z.json());
export const planSnapshotSchema = z.object({
  plan: snapshot,
  assignments: z.array(snapshot),
});
export type PlanSnapshot = z.infer<typeof planSnapshotSchema>;

export async function readPlan(
  userId: string,
  planId: string,
  externalClient?: PoolClient,
  lock = false
): Promise<PlanSnapshot | null> {
  const client: PoolClient =
    externalClient ?? (await getClient(userId, userId));
  try {
    const result = await client.query<{ snapshot: unknown }>(
      `SELECT to_jsonb(t) || jsonb_build_object('start_date', to_char(t.start_date, 'YYYY-MM-DD'), 'end_date', to_char(t.end_date, 'YYYY-MM-DD')) AS snapshot
       FROM meal_plan_templates t WHERE t.id = $1 AND t.user_id = $2 ${lock ? 'FOR UPDATE' : ''}`,
      [planId, userId]
    );
    if (!result.rows.length) return null;
    const assignments = await client.query<{ snapshot: unknown }>(
      'SELECT to_jsonb(a) AS snapshot FROM meal_plan_template_assignments a WHERE a.template_id = $1 ORDER BY a.id',
      [planId]
    );
    return {
      plan: snapshot.parse(result.rows[0].snapshot),
      assignments: assignments.rows.map((row) => snapshot.parse(row.snapshot)),
    };
  } finally {
    if (!externalClient) client.release();
  }
}

export async function readPlanDiary(
  userId: string,
  planId: string,
  client: PoolClient,
  lock = false
) {
  const rows = await client.query<{ id: string }>(
    'SELECT id FROM food_entries WHERE user_id = $1 AND meal_plan_template_id = $2 ORDER BY id',
    [userId, planId]
  );
  if (!rows.rows.length) return { entries: [], meals: [], water: [] };
  return diary.readSelection(
    userId,
    { type: 'entries', ids: rows.rows.map((row) => row.id) },
    client,
    lock
  );
}

export async function writePlan(
  client: PoolClient,
  userId: string,
  value: PlanSnapshot,
  create: boolean
) {
  const plan = value.plan;
  if (plan.user_id !== userId)
    throw new FoodAssistantConflict('Invalid plan owner.');
  const values = [
    plan.id,
    userId,
    plan.plan_name,
    plan.description ?? null,
    plan.start_date,
    plan.end_date,
    plan.is_active,
  ];
  const query = create
    ? 'INSERT INTO meal_plan_templates(id,user_id,plan_name,description,start_date,end_date,is_active) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id'
    : 'UPDATE meal_plan_templates SET plan_name=$3,description=$4,start_date=$5,end_date=$6,is_active=$7,updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING id';
  const result = await client.query(query, values);
  if (result.rowCount !== 1)
    throw new FoodAssistantConflict('The plan changed or is inaccessible.');
  if (!create)
    await client.query(
      'DELETE FROM meal_plan_template_assignments WHERE template_id=$1',
      [plan.id]
    );
  for (const row of value.assignments) {
    await client.query(
      'INSERT INTO meal_plan_template_assignments(id,template_id,day_of_week,meal_type_id,item_type,meal_id,food_id,variant_id,quantity,unit) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [
        row.id,
        plan.id,
        row.day_of_week,
        row.meal_type_id,
        row.item_type,
        row.meal_id ?? null,
        row.food_id ?? null,
        row.variant_id ?? null,
        row.quantity,
        row.unit,
      ]
    );
  }
}

export async function deletePlan(
  client: PoolClient,
  userId: string,
  planId: string
) {
  const used = await client.query<{ used: boolean }>(
    'SELECT public.assistant_plan_has_external_dependants($1) AS used',
    [planId]
  );
  if (used.rows[0]?.used !== false)
    throw new FoodAssistantConflict(
      'The plan has newer or external dependants. Undo cannot remove it.'
    );
  const result = await client.query(
    'DELETE FROM meal_plan_templates WHERE id=$1 AND user_id=$2 RETURNING id',
    [planId, userId]
  );
  if (result.rowCount !== 1)
    throw new FoodAssistantConflict('The plan could not be removed.');
}

/** Full diary snapshot helpers stay centralized so plan undo has the same
 * metadata, parent-lock ordering and linked-water guarantees as diary undo. */
export async function removePlanDiary(
  client: PoolClient,
  userId: string,
  selection: {
    entries: DiarySnapshot[];
    meals: DiarySnapshot[];
    water: DiarySnapshot[];
  }
) {
  await diary.deleteSnapshots(
    client,
    'food_entries',
    userId,
    selection.entries.map(diary.snapshotId)
  );
  const retained: DiarySnapshot[] = [];
  for (const parent of selection.meals) {
    if (
      await diary.hasOtherMealEntries(
        client,
        userId,
        diary.snapshotId(parent),
        []
      )
    )
      retained.push(parent);
    else
      await diary.deleteSnapshots(client, 'food_entry_meals', userId, [
        diary.snapshotId(parent),
      ]);
  }
  return retained;
}
