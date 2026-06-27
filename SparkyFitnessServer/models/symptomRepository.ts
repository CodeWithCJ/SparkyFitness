import { getClient } from '../db/poolManager.js';
import type {
  CreateCustomSymptomBody,
  CreateCustomLocationBody,
  CreateSymptomEntryBody,
} from '../schemas/symptomSchemas.js';

const CUSTOM_SYMPTOM_COLS =
  'id, user_id, name, display_name, scale_type, unit, is_glp1_flagged, created_at, updated_at';

const ENTRY_COLS = `id, user_id, medication_id, symptom_id, symptom_name_snapshot, severity, severity_label,
  logged_at, entry_date, body_location, context_text, bristol_type, source, custom_fields, created_at, updated_at`;

// --- Custom Symptoms CRUD --------------------------------------------------

async function createCustomSymptom(
  userId: string,
  data: CreateCustomSymptomBody
) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `INSERT INTO user_custom_symptoms (
         user_id, name, display_name, scale_type, unit, is_glp1_flagged)
       VALUES ($1, $2, $3, COALESCE($4, '1-10'), $5, COALESCE($6, FALSE))
       ON CONFLICT (user_id, name) DO UPDATE
       SET display_name = EXCLUDED.display_name,
           scale_type = EXCLUDED.scale_type,
           unit = EXCLUDED.unit,
           is_glp1_flagged = EXCLUDED.is_glp1_flagged,
           updated_at = NOW()
       RETURNING ${CUSTOM_SYMPTOM_COLS}`,
      [
        userId,
        data.name.toLowerCase().trim(),
        data.display_name ?? null,
        data.scale_type ?? null,
        data.unit ?? null,
        data.is_glp1_flagged ?? null,
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function listCustomSymptoms(userId: string) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT ${CUSTOM_SYMPTOM_COLS} FROM user_custom_symptoms
       WHERE user_id = $1
       ORDER BY name ASC`,
      [userId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function deleteCustomSymptom(
  userId: string,
  id: string
): Promise<boolean> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      'DELETE FROM user_custom_symptoms WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

// --- Custom Symptom Locations CRUD -----------------------------------------

const CUSTOM_LOCATION_COLS = 'id, user_id, name, created_at, updated_at';

async function createCustomLocation(
  userId: string,
  data: CreateCustomLocationBody
) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `INSERT INTO user_custom_symptom_locations (user_id, name)
       VALUES ($1, $2)
       ON CONFLICT (user_id, name) DO UPDATE SET updated_at = NOW()
       RETURNING ${CUSTOM_LOCATION_COLS}`,
      [userId, data.name.trim()]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function listCustomLocations(userId: string) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT ${CUSTOM_LOCATION_COLS} FROM user_custom_symptom_locations
       WHERE user_id = $1
       ORDER BY name ASC`,
      [userId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function deleteCustomLocation(
  userId: string,
  id: string
): Promise<boolean> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      'DELETE FROM user_custom_symptom_locations WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

// --- Symptom Entries CRUD --------------------------------------------------

async function createSymptomEntry(
  userId: string,
  data: CreateSymptomEntryBody
) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `INSERT INTO symptom_entries (
         user_id, medication_id, symptom_id, symptom_name_snapshot, severity, severity_label,
         logged_at, entry_date, body_location, context_text, bristol_type, source, custom_fields)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, NOW()), COALESCE($8, CURRENT_DATE),
         $9, $10, $11, COALESCE($12, 'manual'), COALESCE($13, '{}'::jsonb))
       RETURNING ${ENTRY_COLS}`,
      [
        userId,
        data.medication_id ?? null,
        data.symptom_id ?? null,
        data.symptom_name_snapshot,
        data.severity ?? null,
        data.severity_label ?? null,
        data.logged_at ?? null,
        data.entry_date ?? null,
        data.body_location ?? null,
        data.context_text ?? null,
        data.bristol_type ?? null,
        data.source ?? null,
        data.custom_fields ? JSON.stringify(data.custom_fields) : null,
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function listSymptomEntries(
  userId: string,
  opts: { fromDate?: string; toDate?: string; symptomName?: string } = {}
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
    if (opts.symptomName) {
      params.push(opts.symptomName.toLowerCase().trim());
      where.push(`LOWER(symptom_name_snapshot) = $${params.length}`);
    }

    const result = await client.query(
      `SELECT ${ENTRY_COLS} FROM symptom_entries
       WHERE ${where.join(' AND ')}
       ORDER BY logged_at DESC, created_at DESC`,
      params
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function deleteSymptomEntry(
  userId: string,
  id: string
): Promise<boolean> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      'DELETE FROM symptom_entries WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

export {
  createCustomSymptom,
  listCustomSymptoms,
  deleteCustomSymptom,
  createCustomLocation,
  listCustomLocations,
  deleteCustomLocation,
  createSymptomEntry,
  listSymptomEntries,
  deleteSymptomEntry,
};

export default {
  createCustomSymptom,
  listCustomSymptoms,
  deleteCustomSymptom,
  createCustomLocation,
  listCustomLocations,
  deleteCustomLocation,
  createSymptomEntry,
  listSymptomEntries,
  deleteSymptomEntry,
};
