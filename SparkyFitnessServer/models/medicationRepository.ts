import { getClient } from '../db/poolManager.js';
import type {
  CreateMedicationBody,
  UpdateMedicationBody,
  CreateScheduleBody,
} from '../schemas/medicationSchemas.js';

// Column lists kept in one place so SELECTs stay consistent.
const MED_COLS = `id, user_id, name, display_name, type_id, route_id,
  strength_value, strength_unit, dose_amount, dose_unit, rxnorm_rxcui, ndc,
  prescriber, pharmacy, rx_number, reason_text, effectiveness_rating,
  color, icon, photo_path, is_active, is_quick, is_glp1, notes,
  source, custom_fields, created_at, updated_at`;

const SCHEDULE_COLS = `id, medication_id, user_id, schedule_type_id, time_of_day,
  dose_amount, days_of_week, interval_days, day_of_month, cycle_on_days, cycle_off_days,
  with_meal, prn_reason, prn_max_per_day, start_date, end_date, active,
  source, custom_fields, created_at, updated_at`;

async function createMedication(userId: string, data: CreateMedicationBody) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `INSERT INTO medications (
         user_id, name, display_name, type_id, route_id, strength_value, strength_unit,
         dose_amount, dose_unit, rxnorm_rxcui, ndc, prescriber, pharmacy, rx_number,
         reason_text, effectiveness_rating, color, icon, photo_path, is_active, is_quick,
         is_glp1, notes, source, custom_fields)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
         COALESCE($20, TRUE), COALESCE($21, FALSE), COALESCE($22, FALSE), $23,
         COALESCE($24, 'manual'), COALESCE($25, '{}'::jsonb))
       RETURNING ${MED_COLS}`,
      [
        userId,
        data.name,
        data.display_name ?? null,
        data.type_id ?? null,
        data.route_id ?? null,
        data.strength_value ?? null,
        data.strength_unit ?? null,
        data.dose_amount ?? null,
        data.dose_unit ?? null,
        data.rxnorm_rxcui ?? null,
        data.ndc ?? null,
        data.prescriber ?? null,
        data.pharmacy ?? null,
        data.rx_number ?? null,
        data.reason_text ?? null,
        data.effectiveness_rating ?? null,
        data.color ?? null,
        data.icon ?? null,
        data.photo_path ?? null,
        data.is_active ?? null,
        data.is_quick ?? null,
        data.is_glp1 ?? null,
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

async function listMedications(
  userId: string,
  opts: { glp1Only?: boolean; activeOnly?: boolean } = {}
) {
  const client = await getClient(userId);
  try {
    const where: string[] = ['user_id = $1'];
    if (opts.glp1Only) where.push('is_glp1 = TRUE');
    if (opts.activeOnly) where.push('is_active = TRUE');
    const medsResult = await client.query(
      `SELECT ${MED_COLS} FROM medications
       WHERE ${where.join(' AND ')}
       ORDER BY is_active DESC, name ASC`,
      [userId]
    );

    if (medsResult.rows.length === 0) return [];

    const medIds = medsResult.rows.map((m) => m.id);
    const schedulesResult = await client.query(
      `SELECT ${SCHEDULE_COLS} FROM medication_schedules
       WHERE medication_id = ANY($1) AND user_id = $2
       ORDER BY time_of_day NULLS LAST, created_at ASC`,
      [medIds, userId]
    );

    const schedulesByMedId: Record<string, any[]> = {};
    for (const sched of schedulesResult.rows) {
      if (!schedulesByMedId[sched.medication_id]) {
        schedulesByMedId[sched.medication_id] = [];
      }
      schedulesByMedId[sched.medication_id].push(sched);
    }

    return medsResult.rows.map((med) => ({
      ...med,
      schedules: schedulesByMedId[med.id] || [],
    }));
  } finally {
    client.release();
  }
}

async function getMedicationById(userId: string, id: string) {
  const client = await getClient(userId);
  try {
    const med = await client.query(
      `SELECT ${MED_COLS} FROM medications WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    if (!med.rows[0]) return null;
    const schedules = await client.query(
      `SELECT ${SCHEDULE_COLS} FROM medication_schedules
       WHERE medication_id = $1 AND user_id = $2 ORDER BY time_of_day NULLS LAST, created_at ASC`,
      [id, userId]
    );
    return { ...med.rows[0], schedules: schedules.rows };
  } finally {
    client.release();
  }
}

async function updateMedication(
  userId: string,
  id: string,
  data: UpdateMedicationBody
) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `UPDATE medications SET
         name = COALESCE($3, name),
         display_name = COALESCE($4, display_name),
         type_id = COALESCE($5, type_id),
         route_id = COALESCE($6, route_id),
         strength_value = COALESCE($7, strength_value),
         strength_unit = COALESCE($8, strength_unit),
         dose_amount = COALESCE($9, dose_amount),
         dose_unit = COALESCE($10, dose_unit),
         rxnorm_rxcui = COALESCE($11, rxnorm_rxcui),
         ndc = COALESCE($12, ndc),
         prescriber = COALESCE($13, prescriber),
         pharmacy = COALESCE($14, pharmacy),
         rx_number = COALESCE($15, rx_number),
         reason_text = COALESCE($16, reason_text),
         effectiveness_rating = COALESCE($17, effectiveness_rating),
         color = COALESCE($18, color),
         icon = COALESCE($19, icon),
         photo_path = COALESCE($20, photo_path),
         is_active = COALESCE($21, is_active),
         is_quick = COALESCE($22, is_quick),
         is_glp1 = COALESCE($23, is_glp1),
         notes = COALESCE($24, notes),
         custom_fields = COALESCE($25, custom_fields),
         updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING ${MED_COLS}`,
      [
        id,
        userId,
        data.name ?? null,
        data.display_name ?? null,
        data.type_id ?? null,
        data.route_id ?? null,
        data.strength_value ?? null,
        data.strength_unit ?? null,
        data.dose_amount ?? null,
        data.dose_unit ?? null,
        data.rxnorm_rxcui ?? null,
        data.ndc ?? null,
        data.prescriber ?? null,
        data.pharmacy ?? null,
        data.rx_number ?? null,
        data.reason_text ?? null,
        data.effectiveness_rating ?? null,
        data.color ?? null,
        data.icon ?? null,
        data.photo_path ?? null,
        data.is_active ?? null,
        data.is_quick ?? null,
        data.is_glp1 ?? null,
        data.notes ?? null,
        data.custom_fields ? JSON.stringify(data.custom_fields) : null,
      ]
    );
    return result.rows[0] ?? null;
  } finally {
    client.release();
  }
}

async function deleteMedication(userId: string, id: string) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      'DELETE FROM medications WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

// --- Schedules ------------------------------------------------------------

async function addSchedule(
  userId: string,
  medicationId: string,
  data: CreateScheduleBody
) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `INSERT INTO medication_schedules (
         medication_id, user_id, schedule_type_id, time_of_day, dose_amount, days_of_week,
         interval_days, day_of_month, cycle_on_days, cycle_off_days, with_meal,
         prn_reason, prn_max_per_day, start_date, end_date, active, source, custom_fields)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
         COALESCE($16, TRUE), COALESCE($17,'manual'), COALESCE($18,'{}'::jsonb))
       RETURNING ${SCHEDULE_COLS}`,
      [
        medicationId,
        userId,
        data.schedule_type_id,
        data.time_of_day ?? null,
        data.dose_amount ?? null,
        data.days_of_week ?? null,
        data.interval_days ?? null,
        data.day_of_month ?? null,
        data.cycle_on_days ?? null,
        data.cycle_off_days ?? null,
        data.with_meal ?? null,
        data.prn_reason ?? null,
        data.prn_max_per_day ?? null,
        data.start_date ?? null,
        data.end_date ?? null,
        data.active ?? null,
        data.source ?? null,
        data.custom_fields ? JSON.stringify(data.custom_fields) : null,
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function deleteSchedule(userId: string, scheduleId: string) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      'DELETE FROM medication_schedules WHERE id = $1 AND user_id = $2 RETURNING id',
      [scheduleId, userId]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

export {
  createMedication,
  listMedications,
  getMedicationById,
  updateMedication,
  deleteMedication,
  addSchedule,
  deleteSchedule,
};
export default {
  createMedication,
  listMedications,
  getMedicationById,
  updateMedication,
  deleteMedication,
  addSchedule,
  deleteSchedule,
};
