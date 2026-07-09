import { getClient } from '../db/poolManager.js';
import type {
  CreateTitrationStepBody,
  UpdateTitrationStepBody,
} from '../schemas/medicationSchemas.js';

const STEP_COLS = `id, medication_id, user_id, dose_mg, dose_unit, start_date, planned_weeks,
  step_order, status, is_taper, note, source, custom_fields, created_at, updated_at`;

async function createStep(
  userId: string,
  medicationId: string,
  data: CreateTitrationStepBody
) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `INSERT INTO medication_titration_steps (
         medication_id, user_id, dose_mg, dose_unit, start_date, planned_weeks,
         step_order, status, is_taper, note, source, custom_fields)
       VALUES ($1,$2,$3, COALESCE($4,'mg'),$5,$6, COALESCE($7,0),
         COALESCE($8,'planned'), COALESCE($9, FALSE),$10, COALESCE($11,'manual'),
         COALESCE($12,'{}'::jsonb))
       RETURNING ${STEP_COLS}`,
      [
        medicationId,
        userId,
        data.dose_mg,
        data.dose_unit ?? null,
        data.start_date ?? null,
        data.planned_weeks ?? null,
        data.step_order ?? null,
        data.status ?? null,
        data.is_taper ?? null,
        data.note ?? null,
        data.source ?? null,
        data.custom_fields ? JSON.stringify(data.custom_fields) : null,
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function listSteps(userId: string, medicationId: string) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT ${STEP_COLS} FROM medication_titration_steps
       WHERE user_id = $1 AND medication_id = $2
       ORDER BY step_order ASC, start_date ASC NULLS LAST, created_at ASC`,
      [userId, medicationId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function updateStep(
  userId: string,
  id: string,
  data: UpdateTitrationStepBody
) {
  const client = await getClient(userId);
  try {
    const updates: string[] = [];
    const values: unknown[] = [id, userId];
    let index = 3;

    const fields: (keyof UpdateTitrationStepBody)[] = [
      'dose_mg',
      'dose_unit',
      'start_date',
      'planned_weeks',
      'step_order',
      'status',
      'is_taper',
      'note',
      'custom_fields',
    ];

    for (const key of fields) {
      if (data[key] !== undefined) {
        updates.push(`${key} = $${index}`);
        if (key === 'custom_fields') {
          values.push(
            data.custom_fields ? JSON.stringify(data.custom_fields) : '{}'
          );
        } else {
          values.push(data[key]);
        }
        index++;
      }
    }

    if (updates.length === 0) {
      const current = await client.query(
        `SELECT ${STEP_COLS} FROM medication_titration_steps WHERE id = $1 AND user_id = $2`,
        [id, userId]
      );
      return current.rows[0] ?? null;
    }

    const result = await client.query(
      `UPDATE medication_titration_steps SET
         ${updates.join(',\n')},
         updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING ${STEP_COLS}`,
      values
    );
    return result.rows[0] ?? null;
  } finally {
    client.release();
  }
}

async function deleteStep(userId: string, id: string) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      'DELETE FROM medication_titration_steps WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

async function listStepsForUser(userId: string) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT ${STEP_COLS} FROM medication_titration_steps
       WHERE user_id = $1
       ORDER BY medication_id, step_order ASC, start_date ASC NULLS LAST, created_at ASC`,
      [userId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

export { createStep, listSteps, listStepsForUser, updateStep, deleteStep };
export default {
  createStep,
  listSteps,
  listStepsForUser,
  updateStep,
  deleteStep,
};
