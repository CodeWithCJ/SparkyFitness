import { getClient } from '../db/poolManager.js';
import type {
  CreatePenBody,
  UpdatePenBody,
} from '../schemas/medicationSchemas.js';

const PEN_COLS = `id, medication_id, user_id, kind, label, dose_mg, concentration_mg_ml,
  volume_ml, doses_total, doses_used, status, opened_at, expiry_date, bud_date,
  reorder_flag, reorder_threshold, notes, source, custom_fields, created_at, updated_at`;

async function createPen(
  userId: string,
  medicationId: string,
  data: CreatePenBody
) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `INSERT INTO medication_pens (
         medication_id, user_id, kind, label, dose_mg, concentration_mg_ml, volume_ml,
         doses_total, doses_used, status, opened_at, expiry_date, bud_date,
         reorder_flag, reorder_threshold, notes, source, custom_fields)
       VALUES ($1,$2, COALESCE($3,'pen'),$4,$5,$6,$7,$8, COALESCE($9,0),
         COALESCE($10,'sealed'),$11,$12,$13, COALESCE($14, FALSE),$15,$16,
         COALESCE($17,'manual'), COALESCE($18,'{}'::jsonb))
       RETURNING ${PEN_COLS}`,
      [
        medicationId,
        userId,
        data.kind ?? null,
        data.label ?? null,
        data.dose_mg ?? null,
        data.concentration_mg_ml ?? null,
        data.volume_ml ?? null,
        data.doses_total ?? null,
        data.doses_used ?? null,
        data.status ?? null,
        data.opened_at ?? null,
        data.expiry_date ?? null,
        data.bud_date ?? null,
        data.reorder_flag ?? null,
        data.reorder_threshold ?? null,
        data.notes ?? null,
        data.source ?? null,
        data.custom_fields ? JSON.stringify(data.custom_fields) : null,
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function listPens(userId: string, medicationId?: string) {
  const client = await getClient(userId);
  try {
    const params: string[] = [userId];
    let where = 'user_id = $1';
    if (medicationId) {
      params.push(medicationId);
      where += ' AND medication_id = $2';
    }
    const result = await client.query(
      `SELECT ${PEN_COLS} FROM medication_pens
       WHERE ${where}
       ORDER BY (status = 'in_use') DESC, expiry_date NULLS LAST, created_at DESC`,
      params
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function updatePen(userId: string, id: string, data: UpdatePenBody) {
  const client = await getClient(userId);
  try {
    const updates: string[] = [];
    const values: any[] = [id, userId];
    let index = 3;

    const fields: (keyof UpdatePenBody)[] = [
      'kind',
      'label',
      'dose_mg',
      'concentration_mg_ml',
      'volume_ml',
      'doses_total',
      'doses_used',
      'status',
      'opened_at',
      'expiry_date',
      'bud_date',
      'reorder_flag',
      'reorder_threshold',
      'notes',
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
        `SELECT ${PEN_COLS} FROM medication_pens WHERE id = $1 AND user_id = $2`,
        [id, userId]
      );
      return current.rows[0] ?? null;
    }

    const query = `UPDATE medication_pens SET
                     ${updates.join(',\n')},
                     updated_at = NOW()
                   WHERE id = $1 AND user_id = $2
                   RETURNING ${PEN_COLS}`;

    const result = await client.query(query, values);
    return result.rows[0] ?? null;
  } finally {
    client.release();
  }
}

async function deletePen(userId: string, id: string) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      'DELETE FROM medication_pens WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

export { createPen, listPens, updatePen, deletePen };
export default { createPen, listPens, updatePen, deletePen };
