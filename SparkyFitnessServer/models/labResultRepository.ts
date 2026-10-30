import { getClient } from '../db/poolManager.js';
import type {
  CreateLabMarkerBody,
  CreateLabResultBody,
  LabMarkerResponse,
  LabResultListQuery,
  LabResultResponse,
  LabResultSource,
  UpdateLabMarkerBody,
  UpdateLabResultBody,
} from '@workspace/shared';

const toIso = (value: unknown): string =>
  new Date(value as string).toISOString();

const toNumberOrNull = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

const toStringOrNull = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value);

function mapRowToMarker(row: Record<string, unknown>): LabMarkerResponse {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    name: String(row.name),
    unit: String(row.unit),
    ref_range_low: toNumberOrNull(row.ref_range_low),
    ref_range_high: toNumberOrNull(row.ref_range_high),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

function mapRowToResult(row: Record<string, unknown>): LabResultResponse {
  const entryDate = String(row.entry_date);
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    marker_key: toStringOrNull(row.marker_key),
    custom_marker_id: toStringOrNull(row.custom_marker_id),
    entry_date: entryDate.split('T')[0] ?? entryDate,
    value_numeric: toNumberOrNull(row.value_numeric),
    value_text: toStringOrNull(row.value_text),
    unit: String(row.unit),
    ref_range_low: toNumberOrNull(row.ref_range_low),
    ref_range_high: toNumberOrNull(row.ref_range_high),
    lab_name: toStringOrNull(row.lab_name),
    notes: toStringOrNull(row.notes),
    source: String(row.source) as LabResultSource,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

/**
 * `SET` clause for a partial update: only the fields the caller sent, so a
 * missing field is kept and an explicit `null` clears it.
 */
function buildUpdate(
  fields: Record<string, unknown>,
  firstParam: number
): { assignments: string; values: unknown[] } {
  const entries = Object.entries(fields).filter(
    ([, value]) => value !== undefined
  );
  return {
    assignments: entries
      .map(([column], index) => `${column} = $${firstParam + index}`)
      .join(', '),
    values: entries.map(([, value]) => value),
  };
}

export async function listLabMarkers(
  userId: string,
  authenticatedUserId?: string
): Promise<LabMarkerResponse[]> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      'SELECT * FROM lab_markers WHERE user_id = $1 ORDER BY lower(name)',
      [userId]
    );
    return result.rows.map(mapRowToMarker);
  } finally {
    client.release();
  }
}

export async function createLabMarker(
  userId: string,
  data: CreateLabMarkerBody,
  authenticatedUserId?: string
): Promise<LabMarkerResponse> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      `INSERT INTO lab_markers (
        user_id, name, unit, ref_range_low, ref_range_high,
        created_by_user_id, updated_by_user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $6)
      RETURNING *`,
      [
        userId,
        data.name,
        data.unit,
        data.ref_range_low ?? null,
        data.ref_range_high ?? null,
        authenticatedUserId ?? userId,
      ]
    );
    return mapRowToMarker(result.rows[0]);
  } finally {
    client.release();
  }
}

export async function updateLabMarker(
  userId: string,
  markerId: string,
  data: UpdateLabMarkerBody,
  authenticatedUserId?: string
): Promise<LabMarkerResponse | null> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const { assignments, values } = buildUpdate(
      {
        name: data.name,
        unit: data.unit,
        ref_range_low: data.ref_range_low,
        ref_range_high: data.ref_range_high,
      },
      4
    );
    const result = await client.query(
      `UPDATE lab_markers
       SET ${assignments ? `${assignments}, ` : ''}updated_by_user_id = $3, updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [markerId, userId, authenticatedUserId ?? userId, ...values]
    );
    return result.rows[0] ? mapRowToMarker(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

/** Deleting a marker also deletes its results (ON DELETE CASCADE). */
export async function deleteLabMarker(
  userId: string,
  markerId: string,
  authenticatedUserId?: string
): Promise<boolean> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      'DELETE FROM lab_markers WHERE id = $1 AND user_id = $2',
      [markerId, userId]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

export async function listLabResults(
  userId: string,
  query: LabResultListQuery,
  authenticatedUserId?: string
): Promise<LabResultResponse[]> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const conditions = ['user_id = $1'];
    const params: unknown[] = [userId];
    const add = (condition: string, value: unknown) => {
      params.push(value);
      conditions.push(condition.replace('?', `$${params.length}`));
    };
    if (query.markerKey) add('marker_key = ?', query.markerKey);
    if (query.markerId) add('custom_marker_id = ?', query.markerId);
    if (query.startDate) add('entry_date >= ?', query.startDate);
    if (query.endDate) add('entry_date <= ?', query.endDate);
    params.push(query.limit);
    const result = await client.query(
      `SELECT * FROM lab_results
       WHERE ${conditions.join(' AND ')}
       ORDER BY entry_date DESC, created_at DESC
       LIMIT $${params.length}`,
      params
    );
    return result.rows.map(mapRowToResult);
  } finally {
    client.release();
  }
}

/** The most recent result of every marker the user has results for. */
export async function listLatestLabResults(
  userId: string,
  authenticatedUserId?: string
): Promise<LabResultResponse[]> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      `SELECT DISTINCT ON (COALESCE(marker_key, custom_marker_id::text)) *
       FROM lab_results
       WHERE user_id = $1
       ORDER BY COALESCE(marker_key, custom_marker_id::text),
                entry_date DESC, created_at DESC`,
      [userId]
    );
    return result.rows.map(mapRowToResult);
  } finally {
    client.release();
  }
}

export async function getLabResultById(
  userId: string,
  resultId: string,
  authenticatedUserId?: string
): Promise<LabResultResponse | null> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      'SELECT * FROM lab_results WHERE id = $1 AND user_id = $2',
      [resultId, userId]
    );
    return result.rows[0] ? mapRowToResult(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

/**
 * Null when `custom_marker_id` is not one of this user's markers, so a result
 * can never point at another person's marker.
 */
export async function createLabResult(
  userId: string,
  data: CreateLabResultBody,
  authenticatedUserId?: string
): Promise<LabResultResponse | null> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    if (data.custom_marker_id) {
      const owned = await client.query(
        'SELECT 1 FROM lab_markers WHERE id = $1 AND user_id = $2',
        [data.custom_marker_id, userId]
      );
      if (owned.rowCount === 0) return null;
    }
    const result = await client.query(
      `INSERT INTO lab_results (
        user_id, marker_key, custom_marker_id, entry_date, value_numeric,
        value_text, unit, ref_range_low, ref_range_high, lab_name, notes,
        source, created_by_user_id, updated_by_user_id
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10, $11,
        $12, $13, $13
      )
      RETURNING *`,
      [
        userId,
        data.marker_key ?? null,
        data.custom_marker_id ?? null,
        data.entry_date,
        data.value_numeric ?? null,
        data.value_text ?? null,
        data.unit,
        data.ref_range_low ?? null,
        data.ref_range_high ?? null,
        data.lab_name ?? null,
        data.notes ?? null,
        data.source,
        authenticatedUserId ?? userId,
      ]
    );
    return mapRowToResult(result.rows[0]);
  } finally {
    client.release();
  }
}

export async function updateLabResult(
  userId: string,
  resultId: string,
  data: UpdateLabResultBody,
  authenticatedUserId?: string
): Promise<LabResultResponse | null> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const { assignments, values } = buildUpdate(
      {
        entry_date: data.entry_date,
        value_numeric: data.value_numeric,
        value_text: data.value_text,
        unit: data.unit,
        ref_range_low: data.ref_range_low,
        ref_range_high: data.ref_range_high,
        lab_name: data.lab_name,
        notes: data.notes,
      },
      4
    );
    const result = await client.query(
      `UPDATE lab_results
       SET ${assignments ? `${assignments}, ` : ''}updated_by_user_id = $3, updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [resultId, userId, authenticatedUserId ?? userId, ...values]
    );
    return result.rows[0] ? mapRowToResult(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

export async function deleteLabResult(
  userId: string,
  resultId: string,
  authenticatedUserId?: string
): Promise<boolean> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      'DELETE FROM lab_results WHERE id = $1 AND user_id = $2',
      [resultId, userId]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}
