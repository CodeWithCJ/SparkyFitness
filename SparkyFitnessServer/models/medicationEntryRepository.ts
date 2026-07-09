import { getClient } from '../db/poolManager.js';
import type {
  CreateMedicationEntryBody,
  UpdateMedicationEntryBody,
} from '../schemas/medicationSchemas.js';

const ENTRY_COLS = `id, medication_id, schedule_id, user_id, status, taken_at, scheduled_for, entry_date,
  med_name_snapshot, dose_amount_snapshot, dose_unit_snapshot, notes, source, custom_fields, created_at, updated_at`;

async function createEntry(userId: string, data: CreateMedicationEntryBody) {
  const client = await getClient(userId);
  try {
    // Fetch medication snapshot details if not explicitly provided
    let nameSnapshot = data.med_name_snapshot;
    let doseAmountSnapshot = data.dose_amount_snapshot;
    let doseUnitSnapshot = data.dose_unit_snapshot;

    if (!nameSnapshot) {
      const medResult = await client.query(
        'SELECT name, display_name, dose_amount, dose_unit FROM medications WHERE id = $1 AND user_id = $2',
        [data.medication_id, userId]
      );
      const med = medResult.rows[0];
      if (med) {
        nameSnapshot = med.display_name || med.name;
        if (doseAmountSnapshot === undefined || doseAmountSnapshot === null) {
          doseAmountSnapshot = med.dose_amount;
        }
        if (!doseUnitSnapshot) {
          doseUnitSnapshot = med.dose_unit;
        }
      }
    }

    const result = await client.query(
      `INSERT INTO medication_entries (
         medication_id, schedule_id, user_id, status, taken_at, scheduled_for, entry_date,
         med_name_snapshot, dose_amount_snapshot, dose_unit_snapshot, notes, source, custom_fields)
       VALUES ($1, $2, $3, COALESCE($4, 'taken'), COALESCE($5, NOW()), $6, COALESCE($7, CURRENT_DATE),
         $8, $9, $10, $11, COALESCE($12, 'manual'), COALESCE($13, '{}'::jsonb))
       RETURNING ${ENTRY_COLS}`,
      [
        data.medication_id,
        data.schedule_id ?? null,
        userId,
        data.status ?? null,
        data.taken_at ?? null,
        data.scheduled_for ?? null,
        data.entry_date ?? null,
        nameSnapshot ?? null,
        doseAmountSnapshot ?? null,
        doseUnitSnapshot ?? null,
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

async function listEntries(
  userId: string,
  opts: { fromDate?: string; toDate?: string; medicationId?: string } = {}
) {
  const client = await getClient(userId);
  try {
    const params: Array<string | number> = [userId];
    const where: string[] = ['user_id = $1'];

    if (opts.fromDate) {
      params.push(opts.fromDate);
      where.push(`entry_date >= $${params.length}`);
    }
    if (opts.toDate) {
      params.push(opts.toDate);
      where.push(`entry_date <= $${params.length}`);
    }
    if (opts.medicationId) {
      params.push(opts.medicationId);
      where.push(`medication_id = $${params.length}`);
    }

    const result = await client.query(
      `SELECT ${ENTRY_COLS} FROM medication_entries
       WHERE ${where.join(' AND ')}
       ORDER BY taken_at DESC`,
      params
    );
    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Adherence entries merged with GLP-1 injection logs, so shots logged through the
 * injection endpoint show up in the same feed. Injection rows are mapped to the entry
 * shape and discriminated by entry_type ('entry' | 'injection'); their ids are injection
 * ids, so deletes for them must go through DELETE /injections/:id. Kept separate from
 * listEntries because reportService fetches entries and injections independently and
 * would double-count merged rows.
 */
async function listEntriesWithInjections(
  userId: string,
  opts: { fromDate?: string; toDate?: string; medicationId?: string } = {}
) {
  const client = await getClient(userId);
  try {
    const params: Array<string | number> = [userId];
    const where: string[] = ['user_id = $1'];

    if (opts.fromDate) {
      params.push(opts.fromDate);
      where.push(`entry_date >= $${params.length}`);
    }
    if (opts.toDate) {
      params.push(opts.toDate);
      where.push(`entry_date <= $${params.length}`);
    }
    if (opts.medicationId) {
      params.push(opts.medicationId);
      where.push(`medication_id = $${params.length}`);
    }

    const entryWhere = where.join(' AND ');
    const injectionWhere = where.map((w) => `i.${w}`).join(' AND ');

    const result = await client.query(
      `SELECT ${ENTRY_COLS}, NULL::varchar AS site, 'entry'::text AS entry_type
         FROM medication_entries
        WHERE ${entryWhere}
       UNION ALL
       SELECT i.id, i.medication_id, NULL::uuid AS schedule_id, i.user_id,
              'taken'::text AS status, i.injected_at AS taken_at,
              NULL::timestamptz AS scheduled_for, i.entry_date,
              COALESCE(m.display_name, m.name) AS med_name_snapshot,
              i.dose_mg AS dose_amount_snapshot, 'mg'::text AS dose_unit_snapshot,
              i.notes, i.source, i.custom_fields, i.created_at, i.updated_at,
              i.site, 'injection'::text AS entry_type
         FROM injection_entries i
         LEFT JOIN medications m ON m.id = i.medication_id
        WHERE ${injectionWhere}
       ORDER BY taken_at DESC`,
      params
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function updateEntry(
  userId: string,
  id: string,
  data: UpdateMedicationEntryBody
) {
  const client = await getClient(userId);
  try {
    const updates: string[] = [];
    const values: unknown[] = [id, userId];
    let index = 3;

    const fields: (keyof UpdateMedicationEntryBody)[] = [
      'schedule_id',
      'status',
      'taken_at',
      'scheduled_for',
      'entry_date',
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
        `SELECT ${ENTRY_COLS} FROM medication_entries WHERE id = $1 AND user_id = $2`,
        [id, userId]
      );
      return current.rows[0] ?? null;
    }

    const result = await client.query(
      `UPDATE medication_entries SET
         ${updates.join(',\n')},
         updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING ${ENTRY_COLS}`,
      values
    );
    return result.rows[0] ?? null;
  } finally {
    client.release();
  }
}

async function deleteEntry(userId: string, id: string): Promise<boolean> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      'DELETE FROM medication_entries WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

export {
  createEntry,
  listEntries,
  listEntriesWithInjections,
  updateEntry,
  deleteEntry,
};
export default {
  createEntry,
  listEntries,
  listEntriesWithInjections,
  updateEntry,
  deleteEntry,
};
