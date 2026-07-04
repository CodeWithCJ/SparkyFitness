import { getClient } from '../db/poolManager.js';
import type {
  CreatePregnancyBody,
  UpdatePregnancyBody,
  UpdateKickSessionBody,
  UpsertChecklistItemBody,
} from '../schemas/pregnancySchemas.js';

const PREG_COLS = `id, user_id, due_date, due_date_basis, lmp_date, conception_date, fetus_count,
  status, ended_on, outcome, prenatal_medication_id, supplement_medication_id, notes,
  created_at, updated_at`;

const KICK_COLS = `id, user_id, pregnancy_id, started_at, ended_at, kick_count, kick_times,
  created_at, updated_at`;

const CONTRACTION_COLS = `id, user_id, pregnancy_id, started_at, ended_at, intensity,
  created_at, updated_at`;

const PHOTO_COLS =
  'id, user_id, pregnancy_id, week, entry_date, file_path, notes, created_at, updated_at';

const CHECKLIST_COLS = `id, user_id, pregnancy_id, template_key, custom_title, week, completed_at,
  dismissed, created_at, updated_at`;

const APPT_COLS = `id, user_id, pregnancy_id, scheduled_at, appointment_type, title, location,
  notes, outcome, created_at, updated_at`;

// --- Pregnancies ------------------------------------------------------------

async function getActivePregnancy(userId: string) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT ${PREG_COLS} FROM pregnancies WHERE user_id = $1 AND status = 'active'
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    return result.rows[0] ?? null;
  } finally {
    client.release();
  }
}

async function getPregnancy(userId: string, id: string) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT ${PREG_COLS} FROM pregnancies WHERE user_id = $1 AND id = $2`,
      [userId, id]
    );
    return result.rows[0] ?? null;
  } finally {
    client.release();
  }
}

async function createPregnancy(
  userId: string,
  data: CreatePregnancyBody & { due_date: string }
) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `INSERT INTO pregnancies (
         user_id, due_date, due_date_basis, lmp_date, conception_date, fetus_count,
         prenatal_medication_id, supplement_medication_id, notes)
       VALUES ($1, $2, COALESCE($3, 'lmp'), $4, $5, COALESCE($6, 1), $7, $8, $9)
       RETURNING ${PREG_COLS}`,
      [
        userId,
        data.due_date,
        data.due_date_basis ?? null,
        data.lmp_date ?? null,
        data.conception_date ?? null,
        data.fetus_count ?? null,
        data.prenatal_medication_id ?? null,
        data.supplement_medication_id ?? null,
        data.notes ?? null,
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function updatePregnancy(
  userId: string,
  id: string,
  data: UpdatePregnancyBody
) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `UPDATE pregnancies SET
         due_date = COALESCE($3, due_date),
         due_date_basis = COALESCE($4, due_date_basis),
         lmp_date = COALESCE($5, lmp_date),
         conception_date = COALESCE($6, conception_date),
         fetus_count = COALESCE($7, fetus_count),
         status = COALESCE($8, status),
         ended_on = COALESCE($9, ended_on),
         outcome = COALESCE($10, outcome),
         prenatal_medication_id = COALESCE($11, prenatal_medication_id),
         supplement_medication_id = COALESCE($12, supplement_medication_id),
         notes = COALESCE($13, notes),
         updated_at = NOW()
       WHERE user_id = $1 AND id = $2
       RETURNING ${PREG_COLS}`,
      [
        userId,
        id,
        data.due_date ?? null,
        data.due_date_basis ?? null,
        data.lmp_date ?? null,
        data.conception_date ?? null,
        data.fetus_count ?? null,
        data.status ?? null,
        data.ended_on ?? null,
        data.outcome ?? null,
        data.prenatal_medication_id ?? null,
        data.supplement_medication_id ?? null,
        data.notes ?? null,
      ]
    );
    return result.rows[0] ?? null;
  } finally {
    client.release();
  }
}

async function deletePregnancy(userId: string, id: string): Promise<boolean> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      'DELETE FROM pregnancies WHERE user_id = $1 AND id = $2 RETURNING id',
      [userId, id]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

// --- Kick sessions ----------------------------------------------------------

async function startKickSession(userId: string, pregnancyId: string) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `INSERT INTO pregnancy_kick_sessions (user_id, pregnancy_id, started_at, kick_count, kick_times)
       VALUES ($1, $2, NOW(), 0, '{}')
       RETURNING ${KICK_COLS}`,
      [userId, pregnancyId]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function updateKickSession(
  userId: string,
  id: string,
  data: UpdateKickSessionBody
) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `UPDATE pregnancy_kick_sessions SET
         kick_count = COALESCE($3, kick_count),
         kick_times = COALESCE($4, kick_times),
         ended_at = CASE WHEN $5 THEN NOW() ELSE ended_at END,
         updated_at = NOW()
       WHERE user_id = $1 AND id = $2
       RETURNING ${KICK_COLS}`,
      [
        userId,
        id,
        data.kick_count ?? null,
        data.kick_times ?? null,
        data.ended ?? false,
      ]
    );
    return result.rows[0] ?? null;
  } finally {
    client.release();
  }
}

async function listKickSessions(userId: string, limit = 30) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT ${KICK_COLS} FROM pregnancy_kick_sessions WHERE user_id = $1
       ORDER BY started_at DESC LIMIT $2`,
      [userId, limit]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

// --- Contractions -----------------------------------------------------------

async function createContraction(
  userId: string,
  data: {
    pregnancy_id: string;
    started_at?: string;
    ended_at?: string | null;
    intensity?: number | null;
  }
) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `INSERT INTO pregnancy_contractions (user_id, pregnancy_id, started_at, ended_at, intensity)
       VALUES ($1, $2, COALESCE($3::timestamptz, NOW()), $4, $5)
       RETURNING ${CONTRACTION_COLS}`,
      [
        userId,
        data.pregnancy_id,
        data.started_at ?? null,
        data.ended_at ?? null,
        data.intensity ?? null,
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function updateContraction(
  userId: string,
  id: string,
  data: { ended_at?: string | null; intensity?: number | null }
) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `UPDATE pregnancy_contractions SET
         ended_at = COALESCE($3::timestamptz, ended_at),
         intensity = COALESCE($4, intensity),
         updated_at = NOW()
       WHERE user_id = $1 AND id = $2
       RETURNING ${CONTRACTION_COLS}`,
      [userId, id, data.ended_at ?? null, data.intensity ?? null]
    );
    return result.rows[0] ?? null;
  } finally {
    client.release();
  }
}

async function listContractions(userId: string, sinceIso?: string) {
  const client = await getClient(userId);
  try {
    const params: Array<string> = [userId];
    let where = 'user_id = $1';
    if (sinceIso) {
      params.push(sinceIso);
      where += ' AND started_at >= $2';
    }
    const result = await client.query(
      `SELECT ${CONTRACTION_COLS} FROM pregnancy_contractions WHERE ${where}
       ORDER BY started_at ASC`,
      params
    );
    return result.rows;
  } finally {
    client.release();
  }
}

// --- Photos -----------------------------------------------------------------

async function createPhoto(
  userId: string,
  data: {
    pregnancy_id: string;
    week: number;
    entry_date?: string;
    file_path: string;
    notes?: string | null;
  }
) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `INSERT INTO pregnancy_photos (user_id, pregnancy_id, week, entry_date, file_path, notes)
       VALUES ($1, $2, $3, COALESCE($4::date, CURRENT_DATE), $5, $6)
       RETURNING ${PHOTO_COLS}`,
      [
        userId,
        data.pregnancy_id,
        data.week,
        data.entry_date ?? null,
        data.file_path,
        data.notes ?? null,
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function listPhotos(userId: string, pregnancyId: string) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT ${PHOTO_COLS} FROM pregnancy_photos WHERE user_id = $1 AND pregnancy_id = $2
       ORDER BY week ASC, entry_date ASC`,
      [userId, pregnancyId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function deletePhoto(userId: string, id: string): Promise<boolean> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      'DELETE FROM pregnancy_photos WHERE user_id = $1 AND id = $2 RETURNING id',
      [userId, id]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

// --- Checklist --------------------------------------------------------------

async function listChecklist(userId: string, pregnancyId: string) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT ${CHECKLIST_COLS} FROM pregnancy_checklist_state
       WHERE user_id = $1 AND pregnancy_id = $2`,
      [userId, pregnancyId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function upsertChecklistItem(
  userId: string,
  pregnancyId: string,
  data: UpsertChecklistItemBody & { id?: string }
) {
  const client = await getClient(userId);
  try {
    if (data.id) {
      const result = await client.query(
        `UPDATE pregnancy_checklist_state SET
           completed_at = CASE WHEN $3 IS NULL THEN completed_at
                               WHEN $3 THEN NOW() ELSE NULL END,
           dismissed = COALESCE($4, dismissed),
           custom_title = COALESCE($5, custom_title),
           updated_at = NOW()
         WHERE user_id = $1 AND id = $2
         RETURNING ${CHECKLIST_COLS}`,
        [
          userId,
          data.id,
          data.completed ?? null,
          data.dismissed ?? null,
          data.custom_title ?? null,
        ]
      );
      return result.rows[0] ?? null;
    }
    const result = await client.query(
      `INSERT INTO pregnancy_checklist_state (
         user_id, pregnancy_id, template_key, custom_title, week, completed_at, dismissed)
       VALUES ($1, $2, $3, $4, COALESCE($5, 0),
         CASE WHEN $6 THEN NOW() ELSE NULL END, COALESCE($7, FALSE))
       RETURNING ${CHECKLIST_COLS}`,
      [
        userId,
        pregnancyId,
        data.template_key ?? null,
        data.custom_title ?? null,
        data.week ?? null,
        data.completed ?? false,
        data.dismissed ?? null,
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

// --- Appointments -----------------------------------------------------------

async function createAppointment(
  userId: string,
  data: {
    pregnancy_id?: string | null;
    scheduled_at: string;
    appointment_type?: string;
    title?: string | null;
    location?: string | null;
    notes?: string | null;
    outcome?: Record<string, unknown>;
  }
) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `INSERT INTO health_appointments (
         user_id, pregnancy_id, scheduled_at, appointment_type, title, location, notes, outcome)
       VALUES ($1, $2, $3::timestamptz, COALESCE($4, 'other'), $5, $6, $7, COALESCE($8::jsonb, '{}'::jsonb))
       RETURNING ${APPT_COLS}`,
      [
        userId,
        data.pregnancy_id ?? null,
        data.scheduled_at,
        data.appointment_type ?? null,
        data.title ?? null,
        data.location ?? null,
        data.notes ?? null,
        data.outcome ? JSON.stringify(data.outcome) : null,
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function updateAppointment(
  userId: string,
  id: string,
  data: {
    scheduled_at?: string;
    appointment_type?: string;
    title?: string | null;
    location?: string | null;
    notes?: string | null;
    outcome?: Record<string, unknown>;
  }
) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `UPDATE health_appointments SET
         scheduled_at = COALESCE($3::timestamptz, scheduled_at),
         appointment_type = COALESCE($4, appointment_type),
         title = COALESCE($5, title),
         location = COALESCE($6, location),
         notes = COALESCE($7, notes),
         outcome = COALESCE($8::jsonb, outcome),
         updated_at = NOW()
       WHERE user_id = $1 AND id = $2
       RETURNING ${APPT_COLS}`,
      [
        userId,
        id,
        data.scheduled_at ?? null,
        data.appointment_type ?? null,
        data.title ?? null,
        data.location ?? null,
        data.notes ?? null,
        data.outcome ? JSON.stringify(data.outcome) : null,
      ]
    );
    return result.rows[0] ?? null;
  } finally {
    client.release();
  }
}

async function listAppointments(userId: string, upcomingOnly = false) {
  const client = await getClient(userId);
  try {
    const where = upcomingOnly
      ? 'user_id = $1 AND scheduled_at >= NOW()'
      : 'user_id = $1';
    const result = await client.query(
      `SELECT ${APPT_COLS} FROM health_appointments WHERE ${where}
       ORDER BY scheduled_at ASC`,
      [userId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function deleteAppointment(userId: string, id: string): Promise<boolean> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      'DELETE FROM health_appointments WHERE user_id = $1 AND id = $2 RETURNING id',
      [userId, id]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

async function getVitalsData(
  userId: string,
  targetDate: string,
  lmpDate: string
) {
  const client = await getClient(userId);
  try {
    const latestResult = await client.query(
      `SELECT weight, height FROM check_in_measurements 
       WHERE user_id = $1 AND entry_date <= $2 AND weight IS NOT NULL 
       ORDER BY entry_date DESC, updated_at DESC LIMIT 1`,
      [userId, targetDate]
    );
    const earliestResult = await client.query(
      `SELECT weight FROM check_in_measurements 
       WHERE user_id = $1 AND entry_date >= $2 AND weight IS NOT NULL 
       ORDER BY entry_date ASC, created_at ASC LIMIT 1`,
      [userId, lmpDate]
    );
    const heightResult = await client.query(
      `SELECT height FROM check_in_measurements 
       WHERE user_id = $1 AND height IS NOT NULL 
       ORDER BY entry_date DESC LIMIT 1`,
      [userId]
    );

    return {
      latestWeight: latestResult.rows[0]?.weight
        ? parseFloat(latestResult.rows[0].weight)
        : null,
      prePregnancyWeight: earliestResult.rows[0]?.weight
        ? parseFloat(earliestResult.rows[0].weight)
        : null,
      height: heightResult.rows[0]?.height
        ? parseFloat(heightResult.rows[0].height)
        : null,
    };
  } finally {
    client.release();
  }
}

async function getMedicationLogStatus(
  userId: string,
  medicationId: string,
  date: string
): Promise<string | null> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT id FROM medication_entries 
       WHERE user_id = $1 AND medication_id = $2 AND entry_date = $3 LIMIT 1`,
      [userId, medicationId, date]
    );
    return result.rows[0]?.id ?? null;
  } finally {
    client.release();
  }
}

async function getMedicationName(
  userId: string,
  medicationId: string
): Promise<string | null> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      'SELECT name, display_name FROM medications WHERE id = $1 AND user_id = $2',
      [medicationId, userId]
    );
    const row = result.rows[0];
    return row ? row.display_name || row.name : null;
  } finally {
    client.release();
  }
}

async function getLatestBpCustomMeasurement(
  userId: string,
  date: string
): Promise<string | null> {
  const client = await getClient(userId);
  try {
    const catResult = await client.query(
      `SELECT id FROM custom_categories 
       WHERE user_id = $1 AND LOWER(name) IN ('blood_pressure', 'blood pressure') LIMIT 1`,
      [userId]
    );
    const categoryId = catResult.rows[0]?.id;
    if (!categoryId) return null;

    const measResult = await client.query(
      `SELECT value FROM custom_measurements 
       WHERE user_id = $1 AND category_id = $2 AND entry_date <= $3 
       ORDER BY entry_date DESC, entry_timestamp DESC LIMIT 1`,
      [userId, categoryId, date]
    );
    return measResult.rows[0]?.value ?? null;
  } finally {
    client.release();
  }
}

export default {
  getActivePregnancy,
  getPregnancy,
  createPregnancy,
  updatePregnancy,
  deletePregnancy,
  startKickSession,
  updateKickSession,
  listKickSessions,
  createContraction,
  updateContraction,
  listContractions,
  createPhoto,
  listPhotos,
  deletePhoto,
  listChecklist,
  upsertChecklistItem,
  createAppointment,
  updateAppointment,
  listAppointments,
  deleteAppointment,
  getVitalsData,
  getMedicationLogStatus,
  getMedicationName,
  getLatestBpCustomMeasurement,
};
