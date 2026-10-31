import { dayToUtcRange } from '@workspace/shared';
import { getClient } from '../db/poolManager.js';
import type {
  CreateCustomSymptomBody,
  SymptomTreatmentInput,
  UpdateCustomSymptomBody,
} from '../schemas/symptomSchemas.js';

type DbClient = Awaited<ReturnType<typeof getClient>>;

// --- Row shapes --------------------------------------------------------------

export interface SymptomDefinitionRow {
  id: string;
  user_id: string;
  name: string;
  display_name: string | null;
  scale_type: string;
  unit: string | null;
  is_glp1_flagged: boolean;
  category: string;
  template: string;
  sections: Record<string, boolean>;
  custom_field_defs: unknown[];
  is_episodic: boolean;
  color: string | null;
  icon: string | null;
  is_pinned: boolean;
  sort_order: number;
  is_archived: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface SymptomTreatmentRow {
  id: string;
  user_id: string;
  symptom_entry_id: string;
  kind: string;
  medication_id: string | null;
  medication_entry_id: string | null;
  name_snapshot: string;
  dose_snapshot: string | null;
  taken_at: Date | null;
  effectiveness: string | null;
  notes: string | null;
  created_at: Date;
}

export interface SymptomEntryRow {
  id: string;
  user_id: string;
  medication_id: string | null;
  symptom_id: string | null;
  symptom_name_snapshot: string;
  severity: number | null;
  severity_label: string | null;
  logged_at: Date;
  entry_date: string;
  started_at: Date | null;
  ended_at: Date | null;
  body_location: string | null;
  body_locations: string[];
  qualities: string[];
  associated_symptoms: string[];
  triggers: string[];
  phases: Record<string, string[]>;
  impact: string | null;
  peak_severity: number | null;
  severity_timeline: Array<{ at: string; severity: number }>;
  impact_timeline: Array<{ at: string; impact: string }>;
  context_text: string | null;
  bristol_type: number | null;
  source: string;
  custom_fields: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface SymptomEntryWithDetails extends SymptomEntryRow {
  treatments: SymptomTreatmentRow[];
  photo_ids: string[];
}

/** Everything the service resolves before an entry is written. */
export interface SymptomEntryWrite {
  medication_id?: string | null;
  symptom_id?: string | null;
  symptom_name_snapshot?: string;
  severity?: number | null;
  severity_label?: string | null;
  logged_at?: string | null;
  entry_date?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  body_location?: string | null;
  body_locations?: string[];
  qualities?: string[];
  associated_symptoms?: string[];
  triggers?: string[];
  phases?: Record<string, string[]>;
  impact?: string | null;
  peak_severity?: number | null;
  severity_timeline?: Array<{ at: string; severity: number }>;
  impact_timeline?: Array<{ at: string; impact: string }>;
  context_text?: string | null;
  bristol_type?: number | null;
  source?: string;
  custom_fields?: Record<string, unknown> | null;
}

export interface ListSymptomEntriesOptions {
  fromDate?: string;
  toDate?: string;
  symptomName?: string;
  symptomId?: string;
  medicationId?: string;
  source?: string;
  episodesOnly?: boolean;
  /**
   * Also return episodes that overlap the date range without being logged in
   * it: one that started before fromDate and was still going on it, or one
   * logged under a later day that started by toDate.
   */
  overlapping?: boolean;
  /** The timezone the range's days are read in when `overlapping` is set. */
  timezone?: string;
}

const DEFINITION_COLS = `id, user_id, name, display_name, scale_type, unit, is_glp1_flagged, category, template,
  sections, custom_field_defs, is_episodic, color, icon, is_pinned, sort_order, is_archived, created_at, updated_at`;

const ENTRY_COLS = `id, user_id, medication_id, symptom_id, symptom_name_snapshot, severity, severity_label,
  logged_at, entry_date, started_at, ended_at, body_location, body_locations, qualities, associated_symptoms,
  triggers, phases, impact, peak_severity, severity_timeline, impact_timeline, context_text, bristol_type, source,
  custom_fields, created_at, updated_at`;

const TREATMENT_COLS = `id, user_id, symptom_entry_id, kind, medication_id, medication_entry_id, name_snapshot,
  dose_snapshot, taken_at, effectiveness, notes, created_at`;

// --- Dynamic UPDATE helper ---------------------------------------------------

/** `[column, value, cast?]`. A value of `undefined` means "leave the column alone". */
type ColumnValue = [column: string, value: unknown, cast?: string];

function buildSetClause(
  fields: ColumnValue[],
  firstParamIndex: number
): { sql: string; params: unknown[] } {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [column, value, cast] of fields) {
    if (value === undefined) continue;
    params.push(
      cast === 'jsonb' && value !== null ? JSON.stringify(value) : value
    );
    sets.push(
      `${column} = $${firstParamIndex + params.length - 1}${cast ? `::${cast}` : ''}`
    );
  }
  return { sql: sets.join(', '), params };
}

// --- Symptom definitions -----------------------------------------------------

function definitionColumns(
  data: UpdateCustomSymptomBody | CreateCustomSymptomBody
): ColumnValue[] {
  return [
    ['display_name', data.display_name],
    ['scale_type', data.scale_type],
    ['unit', data.unit],
    ['is_glp1_flagged', data.is_glp1_flagged],
    ['category', data.category],
    ['template', data.template],
    ['sections', data.sections, 'jsonb'],
    ['custom_field_defs', data.custom_field_defs, 'jsonb'],
    ['is_episodic', data.is_episodic],
    ['color', data.color],
    ['icon', data.icon],
    ['is_pinned', data.is_pinned],
    ['sort_order', data.sort_order],
    ['is_archived', data.is_archived],
  ];
}

/**
 * Creates a definition, or updates the fields that were sent when one with the
 * same name already exists, so picking a built-in twice is harmless.
 */
async function createCustomSymptom(
  userId: string,
  data: CreateCustomSymptomBody
): Promise<SymptomDefinitionRow> {
  const name = data.name.toLowerCase().trim();
  const client = await getClient(userId);
  try {
    const provided = definitionColumns(data).filter(
      ([, value]) => value !== undefined
    );
    const columns = ['user_id', 'name', ...provided.map(([c]) => c)];
    const { params } = buildSetClause(provided, 1);
    const placeholders = provided.map(([, , cast], i) => {
      const p = `$${i + 3}`;
      return cast ? `${p}::${cast}` : p;
    });
    const inserted = await client.query(
      `INSERT INTO user_custom_symptoms (${columns.join(', ')})
       VALUES ($1, $2${placeholders.length ? ', ' + placeholders.join(', ') : ''})
       ON CONFLICT (user_id, name) DO NOTHING
       RETURNING ${DEFINITION_COLS}`,
      [userId, name, ...params]
    );
    if (inserted.rows[0]) return inserted.rows[0];

    const { sql, params: updateParams } = buildSetClause(provided, 3);
    const updated = await client.query(
      `UPDATE user_custom_symptoms
          SET ${sql ? sql + ', ' : ''}updated_at = NOW()
        WHERE user_id = $1 AND name = $2
        RETURNING ${DEFINITION_COLS}`,
      [userId, name, ...updateParams]
    );
    return updated.rows[0];
  } finally {
    client.release();
  }
}

async function updateCustomSymptom(
  userId: string,
  id: string,
  data: UpdateCustomSymptomBody
): Promise<SymptomDefinitionRow | null> {
  const client = await getClient(userId);
  try {
    const { sql, params } = buildSetClause(definitionColumns(data), 3);
    const result = await client.query(
      `UPDATE user_custom_symptoms
          SET ${sql ? sql + ', ' : ''}updated_at = NOW()
        WHERE id = $1 AND user_id = $2
        RETURNING ${DEFINITION_COLS}`,
      [id, userId, ...params]
    );
    return result.rows[0] ?? null;
  } finally {
    client.release();
  }
}

async function listCustomSymptoms(
  userId: string,
  opts: { includeArchived?: boolean } = {}
): Promise<SymptomDefinitionRow[]> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT ${DEFINITION_COLS} FROM user_custom_symptoms
       WHERE user_id = $1 AND ($2::boolean OR NOT is_archived)
       ORDER BY is_pinned DESC, sort_order ASC, name ASC`,
      [userId, opts.includeArchived ?? true]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function getCustomSymptomById(
  userId: string,
  id: string
): Promise<SymptomDefinitionRow | null> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT ${DEFINITION_COLS} FROM user_custom_symptoms
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    return result.rows[0] ?? null;
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

// --- Treatments --------------------------------------------------------------

async function replaceTreatments(
  client: DbClient,
  userId: string,
  entryId: string,
  treatments: SymptomTreatmentInput[]
): Promise<void> {
  await client.query(
    'DELETE FROM symptom_entry_treatments WHERE symptom_entry_id = $1 AND user_id = $2',
    [entryId, userId]
  );
  for (const t of treatments) {
    await client.query(
      `INSERT INTO symptom_entry_treatments
         (user_id, symptom_entry_id, kind, medication_id, medication_entry_id,
          name_snapshot, dose_snapshot, taken_at, effectiveness, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        userId,
        entryId,
        t.kind,
        t.medication_id ?? null,
        t.medication_entry_id ?? null,
        t.name_snapshot,
        t.dose_snapshot ?? null,
        t.taken_at ?? null,
        t.effectiveness ?? null,
        t.notes ?? null,
      ]
    );
  }
}

// --- Entries -----------------------------------------------------------------

function entryColumns(data: SymptomEntryWrite): ColumnValue[] {
  return [
    ['medication_id', data.medication_id],
    ['symptom_id', data.symptom_id],
    ['symptom_name_snapshot', data.symptom_name_snapshot],
    ['severity', data.severity],
    ['severity_label', data.severity_label],
    ['logged_at', data.logged_at],
    ['entry_date', data.entry_date],
    ['started_at', data.started_at],
    ['ended_at', data.ended_at],
    ['body_location', data.body_location],
    ['body_locations', data.body_locations, 'text[]'],
    ['qualities', data.qualities, 'text[]'],
    ['associated_symptoms', data.associated_symptoms, 'text[]'],
    ['triggers', data.triggers, 'text[]'],
    ['phases', data.phases, 'jsonb'],
    ['impact', data.impact],
    ['peak_severity', data.peak_severity],
    ['severity_timeline', data.severity_timeline, 'jsonb'],
    ['impact_timeline', data.impact_timeline, 'jsonb'],
    ['context_text', data.context_text],
    ['bristol_type', data.bristol_type],
    ['source', data.source],
    ['custom_fields', data.custom_fields ?? undefined, 'jsonb'],
  ];
}

/** Attaches treatments and photo ids to entry rows with two batched queries. */
async function withDetails(
  client: DbClient,
  rows: SymptomEntryRow[]
): Promise<SymptomEntryWithDetails[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const treatments = await client.query(
    `SELECT ${TREATMENT_COLS} FROM symptom_entry_treatments
      WHERE symptom_entry_id = ANY($1::uuid[])
      ORDER BY created_at ASC`,
    [ids]
  );
  const photos = await client.query(
    `SELECT id, symptom_entry_id FROM symptom_entry_photos
      WHERE symptom_entry_id = ANY($1::uuid[])
      ORDER BY created_at ASC`,
    [ids]
  );
  const treatmentsByEntry = new Map<string, SymptomTreatmentRow[]>();
  for (const t of treatments.rows as SymptomTreatmentRow[]) {
    const list = treatmentsByEntry.get(t.symptom_entry_id) ?? [];
    list.push(t);
    treatmentsByEntry.set(t.symptom_entry_id, list);
  }
  const photosByEntry = new Map<string, string[]>();
  for (const p of photos.rows as Array<{
    id: string;
    symptom_entry_id: string;
  }>) {
    const list = photosByEntry.get(p.symptom_entry_id) ?? [];
    list.push(p.id);
    photosByEntry.set(p.symptom_entry_id, list);
  }
  return rows.map((r) => ({
    ...r,
    treatments: treatmentsByEntry.get(r.id) ?? [],
    photo_ids: photosByEntry.get(r.id) ?? [],
  }));
}

async function getSymptomEntryRow(
  client: DbClient,
  userId: string,
  id: string
): Promise<SymptomEntryRow | null> {
  const result = await client.query(
    `SELECT ${ENTRY_COLS} FROM symptom_entries WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return result.rows[0] ?? null;
}

async function getSymptomEntry(
  userId: string,
  id: string
): Promise<SymptomEntryWithDetails | null> {
  const client = await getClient(userId);
  try {
    const row = await getSymptomEntryRow(client, userId, id);
    if (!row) return null;
    return (await withDetails(client, [row]))[0] ?? null;
  } finally {
    client.release();
  }
}

async function createSymptomEntry(
  userId: string,
  data: SymptomEntryWrite,
  treatments: SymptomTreatmentInput[] = []
): Promise<SymptomEntryWithDetails> {
  const client = await getClient(userId);
  try {
    await client.query('BEGIN');
    try {
      const provided = entryColumns(data).filter(
        ([, value]) => value !== undefined
      );
      const columns = ['user_id', ...provided.map(([c]) => c)];
      const { params } = buildSetClause(provided, 1);
      const placeholders = provided.map(([, , cast], i) => {
        const p = `$${i + 2}`;
        return cast ? `${p}::${cast}` : p;
      });
      const inserted = await client.query(
        `INSERT INTO symptom_entries (${columns.join(', ')})
         VALUES ($1${placeholders.length ? ', ' + placeholders.join(', ') : ''})
         RETURNING ${ENTRY_COLS}`,
        [userId, ...params]
      );
      const row = inserted.rows[0] as SymptomEntryRow;
      await replaceTreatments(client, userId, row.id, treatments);
      await client.query('COMMIT');
      return (await withDetails(client, [row]))[0]!;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    }
  } finally {
    client.release();
  }
}

/**
 * Applies the given fields to an entry. `treatments`, when provided, replaces the
 * entry's whole treatment list (an empty array clears it). `fromCurrent`, when
 * provided, adds the fields worked out from the entry as stored, read under a
 * row lock, so two overlapping updates both build on the other's result.
 */
async function updateSymptomEntry(
  userId: string,
  id: string,
  data: SymptomEntryWrite,
  treatments?: SymptomTreatmentInput[],
  fromCurrent?: (current: SymptomEntryRow) => SymptomEntryWrite
): Promise<SymptomEntryWithDetails | null> {
  const client = await getClient(userId);
  try {
    await client.query('BEGIN');
    try {
      let write = data;
      if (fromCurrent) {
        const locked = await client.query(
          `SELECT ${ENTRY_COLS} FROM symptom_entries
            WHERE id = $1 AND user_id = $2
            FOR UPDATE`,
          [id, userId]
        );
        const current = locked.rows[0] as SymptomEntryRow | undefined;
        if (!current) {
          await client.query('ROLLBACK');
          return null;
        }
        write = { ...data, ...fromCurrent(current) };
      }
      const { sql, params } = buildSetClause(entryColumns(write), 3);
      const result = await client.query(
        `UPDATE symptom_entries
            SET ${sql ? sql + ', ' : ''}updated_at = NOW()
          WHERE id = $1 AND user_id = $2
          RETURNING ${ENTRY_COLS}`,
        [id, userId, ...params]
      );
      const row = result.rows[0] as SymptomEntryRow | undefined;
      if (!row) {
        await client.query('ROLLBACK');
        return null;
      }
      if (treatments) {
        await replaceTreatments(client, userId, id, treatments);
      }
      await client.query('COMMIT');
      return (await withDetails(client, [row]))[0]!;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    }
  } finally {
    client.release();
  }
}

/**
 * The instant a day starts or ends in `tz`, or null when the date helpers
 * cannot place it (such as the end of 9999-12-31, a common "no limit" value);
 * that side of an overlapping range is then left open instead of failing.
 */
function dayEdge(day: string, tz: string, edge: 'start' | 'end'): Date | null {
  try {
    return dayToUtcRange(day, tz)[edge];
  } catch {
    return null;
  }
}

async function listSymptomEntries(
  userId: string,
  opts: ListSymptomEntriesOptions = {}
): Promise<SymptomEntryWithDetails[]> {
  const client = await getClient(userId);
  try {
    const params: unknown[] = [userId];
    const where: string[] = ['user_id = $1'];

    const dayRange: string[] = [];
    if (opts.fromDate) {
      params.push(opts.fromDate);
      dayRange.push(`entry_date >= $${params.length}`);
    }
    if (opts.toDate) {
      params.push(opts.toDate);
      dayRange.push(`entry_date <= $${params.length}`);
    }
    if (opts.overlapping && dayRange.length > 0) {
      // An episode overlaps the range when it started before the range ends
      // and had not ended before it began; one still going has no end.
      const tz = opts.timezone ?? 'UTC';
      const span: string[] = ['started_at IS NOT NULL'];
      const rangeEnd = opts.toDate ? dayEdge(opts.toDate, tz, 'end') : null;
      if (rangeEnd) {
        params.push(rangeEnd);
        span.push(`started_at < $${params.length}`);
      }
      const rangeStart = opts.fromDate
        ? dayEdge(opts.fromDate, tz, 'start')
        : null;
      if (rangeStart) {
        params.push(rangeStart);
        span.push(`(ended_at IS NULL OR ended_at >= $${params.length})`);
      }
      where.push(`((${dayRange.join(' AND ')}) OR (${span.join(' AND ')}))`);
    } else {
      where.push(...dayRange);
    }
    if (opts.symptomName) {
      params.push(opts.symptomName.toLowerCase().trim());
      where.push(`LOWER(symptom_name_snapshot) = $${params.length}`);
    }
    if (opts.symptomId) {
      params.push(opts.symptomId);
      where.push(`symptom_id = $${params.length}`);
    }
    if (opts.medicationId) {
      params.push(opts.medicationId);
      where.push(`medication_id = $${params.length}`);
    }
    if (opts.source) {
      params.push(opts.source);
      where.push(`source = $${params.length}`);
    }
    if (opts.episodesOnly) {
      where.push('started_at IS NOT NULL');
    }

    const result = await client.query(
      `SELECT ${ENTRY_COLS} FROM symptom_entries
       WHERE ${where.join(' AND ')}
       ORDER BY COALESCE(started_at, logged_at) DESC, created_at DESC`,
      params
    );
    return withDetails(client, result.rows);
  } finally {
    client.release();
  }
}

/** Episodes that have been started and not ended, newest first. */
async function listOngoingEpisodes(
  userId: string
): Promise<SymptomEntryWithDetails[]> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT ${ENTRY_COLS} FROM symptom_entries
       WHERE user_id = $1 AND started_at IS NOT NULL AND ended_at IS NULL
       ORDER BY started_at DESC`,
      [userId]
    );
    return withDetails(client, result.rows);
  } finally {
    client.release();
  }
}

/** Ends an ongoing episode. Returns null when it does not exist or already ended. */
async function endSymptomEpisode(
  userId: string,
  id: string,
  endedAt: string | null,
  treatments?: SymptomTreatmentInput[]
): Promise<SymptomEntryWithDetails | null> {
  const client = await getClient(userId);
  try {
    await client.query('BEGIN');
    try {
      const result = await client.query(
        `UPDATE symptom_entries
            SET started_at = COALESCE(started_at, logged_at),
                ended_at = GREATEST(COALESCE($3::timestamptz, NOW()), COALESCE(started_at, logged_at)),
                updated_at = NOW()
          WHERE id = $1 AND user_id = $2 AND ended_at IS NULL
          RETURNING ${ENTRY_COLS}`,
        [id, userId, endedAt]
      );
      const row = result.rows[0] as SymptomEntryRow | undefined;
      if (!row) {
        await client.query('ROLLBACK');
        return null;
      }
      if (treatments) {
        await replaceTreatments(client, userId, id, treatments);
      }
      await client.query('COMMIT');
      return (await withDetails(client, [row]))[0]!;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    }
  } finally {
    client.release();
  }
}

/** SQL for `timeline || [point]` with its points ordered by `at`. */
function sortedTimelineSql(column: string, point: string): string {
  return `(SELECT jsonb_agg(p ORDER BY (p->>'at')::timestamptz, n)
             FROM jsonb_array_elements(${column} || jsonb_build_array(${point}))
                  WITH ORDINALITY AS t(p, n))`;
}

/** SQL for the `key` of the latest point of `timeline || [point]`. */
function latestPointSql(column: string, point: string, key: string): string {
  return `(SELECT p->>'${key}'
             FROM jsonb_array_elements(${column} || jsonb_build_array(${point}))
                  WITH ORDINALITY AS t(p, n)
            ORDER BY (p->>'at')::timestamptz DESC, n DESC
            LIMIT 1)`;
}

const SEVERITY_POINT_SQL =
  "jsonb_build_object('at', COALESCE($4::timestamptz, NOW()), 'severity', $3::numeric)";
const IMPACT_POINT_SQL =
  "jsonb_build_object('at', COALESCE($4::timestamptz, NOW()), 'impact', $5::text)";

/**
 * Records a reading on an entry: a point is added to the severity timeline and,
 * when `impact` is given, to the impact timeline at the same time. Points are
 * kept in time order, so a backdated reading lands where it belongs, and the
 * current severity and impact are those of the latest point. The peak only ever
 * rises. Done in one statement so concurrent updates cannot lose a point.
 */
async function appendSymptomSeverity(
  userId: string,
  id: string,
  severity: number,
  at: string | null,
  impact: string | null = null
): Promise<SymptomEntryWithDetails | null> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `UPDATE symptom_entries
          SET severity = ${latestPointSql('severity_timeline', SEVERITY_POINT_SQL, 'severity')}::numeric,
              peak_severity = GREATEST(COALESCE(peak_severity, $3), $3),
              severity_timeline = ${sortedTimelineSql('severity_timeline', SEVERITY_POINT_SQL)},
              impact = CASE WHEN $5::text IS NULL THEN impact
                            ELSE ${latestPointSql('impact_timeline', IMPACT_POINT_SQL, 'impact')} END,
              impact_timeline = CASE WHEN $5::text IS NULL THEN impact_timeline
                                     ELSE ${sortedTimelineSql('impact_timeline', IMPACT_POINT_SQL)} END,
              updated_at = NOW()
        WHERE id = $1 AND user_id = $2
        RETURNING ${ENTRY_COLS}`,
      [id, userId, severity, at, impact]
    );
    const row = result.rows[0] as SymptomEntryRow | undefined;
    if (!row) return null;
    return (await withDetails(client, [row]))[0]!;
  } finally {
    client.release();
  }
}

/** Deletes an entry and reports the stored file paths of its photos for cleanup. */
async function deleteSymptomEntry(
  userId: string,
  id: string
): Promise<{ deleted: boolean; photoPaths: string[] }> {
  const client = await getClient(userId);
  try {
    const photos = await client.query(
      `SELECT file_path FROM symptom_entry_photos
        WHERE symptom_entry_id = $1 AND user_id = $2`,
      [id, userId]
    );
    const result = await client.query(
      'DELETE FROM symptom_entries WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    const deleted = (result.rowCount ?? 0) > 0;
    return {
      deleted,
      photoPaths: deleted
        ? photos.rows.map((r: { file_path: string }) => r.file_path)
        : [],
    };
  } finally {
    client.release();
  }
}

// --- Photos ------------------------------------------------------------------

export interface SymptomPhotoRow {
  id: string;
  symptom_entry_id: string;
  file_path: string;
  caption: string | null;
  created_at: Date;
}

async function insertSymptomPhoto(
  userId: string,
  entryId: string,
  filePath: string,
  caption: string | null
): Promise<SymptomPhotoRow | null> {
  const client = await getClient(userId);
  try {
    // The FK alone would accept another user's entry id, so confirm ownership.
    const owned = await client.query(
      'SELECT 1 FROM symptom_entries WHERE id = $1 AND user_id = $2',
      [entryId, userId]
    );
    if (owned.rowCount === 0) return null;
    const result = await client.query(
      `INSERT INTO symptom_entry_photos (user_id, symptom_entry_id, file_path, caption)
       VALUES ($1, $2, $3, $4)
       RETURNING id, symptom_entry_id, file_path, caption, created_at`,
      [userId, entryId, filePath, caption]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function getSymptomPhoto(
  userId: string,
  photoId: string
): Promise<SymptomPhotoRow | null> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT id, symptom_entry_id, file_path, caption, created_at
         FROM symptom_entry_photos
        WHERE id = $1 AND user_id = $2`,
      [photoId, userId]
    );
    return result.rows[0] ?? null;
  } finally {
    client.release();
  }
}

/** Deletes the photo row and returns its stored path, or null when not found. */
async function deleteSymptomPhoto(
  userId: string,
  photoId: string
): Promise<string | null> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `DELETE FROM symptom_entry_photos WHERE id = $1 AND user_id = $2
       RETURNING file_path`,
      [photoId, userId]
    );
    return result.rows[0]?.file_path ?? null;
  } finally {
    client.release();
  }
}

// --- Symptom-free days -------------------------------------------------------

async function markSymptomFreeDay(
  userId: string,
  entryDate: string
): Promise<{ id: string; entry_date: string }> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `INSERT INTO symptom_free_days (user_id, entry_date)
       VALUES ($1, $2)
       ON CONFLICT (user_id, entry_date) DO UPDATE SET updated_at = NOW()
       RETURNING id, entry_date`,
      [userId, entryDate]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function unmarkSymptomFreeDay(
  userId: string,
  entryDate: string
): Promise<boolean> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      'DELETE FROM symptom_free_days WHERE user_id = $1 AND entry_date = $2',
      [userId, entryDate]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

async function listSymptomFreeDays(
  userId: string,
  opts: { fromDate?: string; toDate?: string } = {}
): Promise<Array<{ id: string; entry_date: string }>> {
  const client = await getClient(userId);
  try {
    const params: unknown[] = [userId];
    const where = ['user_id = $1'];
    if (opts.fromDate) {
      params.push(opts.fromDate);
      where.push(`entry_date >= $${params.length}`);
    }
    if (opts.toDate) {
      params.push(opts.toDate);
      where.push(`entry_date <= $${params.length}`);
    }
    const result = await client.query(
      `SELECT id, entry_date FROM symptom_free_days
        WHERE ${where.join(' AND ')}
        ORDER BY entry_date DESC`,
      params
    );
    return result.rows;
  } finally {
    client.release();
  }
}

const symptomRepository = {
  createCustomSymptom,
  updateCustomSymptom,
  listCustomSymptoms,
  getCustomSymptomById,
  deleteCustomSymptom,
  getSymptomEntry,
  createSymptomEntry,
  updateSymptomEntry,
  listSymptomEntries,
  listOngoingEpisodes,
  endSymptomEpisode,
  appendSymptomSeverity,
  deleteSymptomEntry,
  insertSymptomPhoto,
  getSymptomPhoto,
  deleteSymptomPhoto,
  markSymptomFreeDay,
  unmarkSymptomFreeDay,
  listSymptomFreeDays,
};

export {
  createCustomSymptom,
  updateCustomSymptom,
  listCustomSymptoms,
  getCustomSymptomById,
  deleteCustomSymptom,
  getSymptomEntry,
  createSymptomEntry,
  updateSymptomEntry,
  listSymptomEntries,
  listOngoingEpisodes,
  endSymptomEpisode,
  appendSymptomSeverity,
  deleteSymptomEntry,
  insertSymptomPhoto,
  getSymptomPhoto,
  deleteSymptomPhoto,
  markSymptomFreeDay,
  unmarkSymptomFreeDay,
  listSymptomFreeDays,
};

export default symptomRepository;
