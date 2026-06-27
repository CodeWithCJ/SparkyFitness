import { getClient } from '../db/poolManager.js';
import type { CreateInjectionBody } from '../schemas/medicationSchemas.js';

const INJECTION_COLS = `id, medication_id, user_id, pen_id, injected_at, entry_date,
  site, dose_mg, notes, source, custom_fields, created_at, updated_at`;

/**
 * Create an injection entry. When `deduct_pen` is true and a `pen_id` is given, the pen's
 * doses_used is incremented and its status advanced (sealed -> in_use -> finished) inside the
 * same transaction so inventory stays consistent.
 */
async function createInjection(userId: string, data: CreateInjectionBody) {
  const client = await getClient(userId);
  try {
    await client.query('BEGIN');
    const injection = await client.query(
      `INSERT INTO injection_entries (
         medication_id, user_id, pen_id, injected_at, entry_date, site, dose_mg, notes,
         source, custom_fields)
       VALUES ($1,$2,$3, COALESCE($4, NOW()), COALESCE($5, CURRENT_DATE),$6,$7,$8,
         COALESCE($9,'manual'), COALESCE($10,'{}'::jsonb))
       RETURNING ${INJECTION_COLS}`,
      [
        data.medication_id,
        userId,
        data.pen_id ?? null,
        data.injected_at ?? null,
        data.entry_date ?? null,
        data.site ?? null,
        data.dose_mg ?? null,
        data.notes ?? null,
        data.source ?? null,
        data.custom_fields ? JSON.stringify(data.custom_fields) : null,
      ]
    );

    let pen = null;
    if (data.deduct_pen && data.pen_id) {
      const penResult = await client.query(
        `UPDATE medication_pens
           SET doses_used = doses_used + 1,
               status = CASE
                 WHEN doses_total IS NOT NULL AND doses_used + 1 >= doses_total THEN 'finished'
                 ELSE 'in_use'
               END,
               opened_at = COALESCE(opened_at, CURRENT_DATE),
               reorder_flag = CASE
                 WHEN reorder_threshold IS NOT NULL AND doses_total IS NOT NULL
                      AND (doses_total - (doses_used + 1)) <= reorder_threshold THEN TRUE
                 ELSE reorder_flag
               END,
               updated_at = NOW()
         WHERE id = $1 AND user_id = $2
         RETURNING id, doses_total, doses_used, status, reorder_flag`,
        [data.pen_id, userId]
      );
      pen = penResult.rows[0] ?? null;
    }

    await client.query('COMMIT');
    return { ...injection.rows[0], pen };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function listInjections(
  userId: string,
  opts: {
    medicationId?: string;
    fromDate?: string;
    toDate?: string;
    limit?: number;
  } = {}
) {
  const client = await getClient(userId);
  try {
    const params: Array<string | number> = [userId];
    let where = 'user_id = $1';
    if (opts.medicationId) {
      params.push(opts.medicationId);
      where += ` AND medication_id = $${params.length}`;
    }
    if (opts.fromDate) {
      params.push(opts.fromDate);
      where += ` AND entry_date >= $${params.length}`;
    }
    if (opts.toDate) {
      params.push(opts.toDate);
      where += ` AND entry_date <= $${params.length}`;
    }
    let limitClause = '';
    if (opts.limit) {
      params.push(opts.limit);
      limitClause = ` LIMIT $${params.length}`;
    }
    const result = await client.query(
      `SELECT ${INJECTION_COLS} FROM injection_entries
       WHERE ${where}
       ORDER BY injected_at DESC${limitClause}`,
      params
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function deleteInjection(userId: string, id: string) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      'DELETE FROM injection_entries WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

export { createInjection, listInjections, deleteInjection };
export default { createInjection, listInjections, deleteInjection };
