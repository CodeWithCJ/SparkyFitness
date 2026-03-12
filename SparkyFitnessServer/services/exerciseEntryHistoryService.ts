import type {
  ActivityDetailResponse,
  ExerciseEntryResponse,
  ExerciseEntrySetResponse,
  ExerciseHistoryResponse,
  ExerciseSessionResponse,
} from "@workspace/shared";

const { getClient } = require("../db/poolManager");
const { log } = require("../config/logging");

/** Convert a pg date/timestamp value to a string, or return null. */
function _dateToString(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/** Parse detail_data recursively like activityDetailsRepository does. */
function _parseDetailData(detailData: unknown): unknown {
  let data = detailData;
  while (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      break;
    }
  }
  return data;
}

interface ActivityDetailRow {
  id: string;
  exercise_entry_id: string | null;
  exercise_preset_entry_id: string | null;
  provider_name: string;
  detail_type: string;
  detail_data: unknown;
}

/**
 * Transform a raw exercise_entries row (with snapshot columns and inline sets)
 * into the shape expected by exerciseEntryResponseSchema.
 */
function _buildExerciseEntryWithSnapshot(
  row: Record<string, unknown>,
): ExerciseEntryResponse {
  const {
    exercise_name,
    category,
    source,
    // Strip columns that aren't part of the API response
    user_id,
    created_by_user_id,
    updated_by_user_id,
    created_at,
    updated_at,
    workout_plan_assignment_id,
    image_url,
    ...entryData
  } = row;

  return {
    id: entryData.id as string,
    exercise_id: entryData.exercise_id as string,
    duration_minutes: (entryData.duration_minutes as number) ?? 0,
    calories_burned: (entryData.calories_burned as number) ?? 0,
    entry_date: _dateToString(entryData.entry_date),
    notes: (entryData.notes as string) ?? null,
    distance: (entryData.distance as number) ?? null,
    avg_heart_rate: (entryData.avg_heart_rate as number) ?? null,
    source: (source as string) ?? null,
    sets: ((entryData.sets as unknown[]) ?? []) as ExerciseEntrySetResponse[],
    exercise_snapshot: {
      id: entryData.exercise_id as string,
      name: exercise_name as string,
      category: (category as string) ?? null,
    },
    activity_details: [] as ActivityDetailResponse[],
  } satisfies ExerciseEntryResponse;
}

/** Count the total number of "sessions" (preset entries + standalone exercise entries). */
async function countExerciseEntrySessions(
  client: { query: Function },
  userId: string,
): Promise<number> {
  const result = await client.query(
    `WITH sessions AS (
       SELECT id FROM exercise_preset_entries WHERE user_id = $1
       UNION ALL
       SELECT id FROM exercise_entries WHERE user_id = $1 AND exercise_preset_entry_id IS NULL
     )
     SELECT COUNT(*)::int AS count FROM sessions`,
    [userId],
  );
  return result.rows[0].count;
}

/** Fetch paginated session stubs and their full details. */
async function getExerciseEntryHistorySessions(
  client: { query: Function },
  userId: string,
  limit: number,
  offset: number,
): Promise<ExerciseSessionResponse[]> {
  // Phase 1: Get paginated session stubs
  const stubsResult = await client.query(
    `WITH sessions AS (
       SELECT id, entry_date, created_at, 'preset' AS session_type
       FROM exercise_preset_entries WHERE user_id = $1
       UNION ALL
       SELECT id, entry_date, created_at, 'individual' AS session_type
       FROM exercise_entries WHERE user_id = $1 AND exercise_preset_entry_id IS NULL
     )
     SELECT id, entry_date, created_at, session_type
     FROM sessions ORDER BY entry_date DESC, created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  );
  const stubs = stubsResult.rows as Array<{
    id: string;
    entry_date: string;
    created_at: string;
    session_type: "preset" | "individual";
  }>;

  if (stubs.length === 0) return [];

  // Partition stubs
  const presetIds: string[] = [];
  const individualIds: string[] = [];
  for (const stub of stubs) {
    if (stub.session_type === "preset") {
      presetIds.push(stub.id);
    } else {
      individualIds.push(stub.id);
    }
  }

  // Phase 2: Batch fetch details
  const presetMetaMap = new Map<string, Record<string, unknown>>();
  const presetChildrenMap = new Map<string, ExerciseEntryResponse[]>();
  const presetActivityMap = new Map<string, ActivityDetailRow[]>();
  const individualMap = new Map<string, ExerciseEntryResponse>();
  const allExerciseEntryIds: string[] = [];

  // Inline sets subquery used for exercise entries
  const SETS_SUBQUERY = `COALESCE(
    (SELECT json_agg(set_data ORDER BY set_data.set_number)
     FROM (
       SELECT ees.id, ees.set_number, ees.set_type, ees.reps, ees.weight,
              ees.duration, ees.rest_time, ees.notes, ees.rpe
       FROM exercise_entry_sets ees
       WHERE ees.exercise_entry_id = ee.id
     ) AS set_data
    ), '[]'::json
  ) AS sets`;

  const batchQueries: Promise<void>[] = [];

  if (presetIds.length > 0) {
    // Preset metadata
    batchQueries.push(
      client
        .query(
          `SELECT id, workout_preset_id, name, description, notes, source
           FROM exercise_preset_entries WHERE id = ANY($1::uuid[])`,
          [presetIds],
        )
        .then((r: { rows: Record<string, unknown>[] }) => {
          for (const row of r.rows) {
            presetMetaMap.set(row.id as string, row);
            presetChildrenMap.set(row.id as string, []);
          }
        }),
    );

    // Child exercise entries for presets
    batchQueries.push(
      client
        .query(
          `SELECT ee.*, ${SETS_SUBQUERY}
           FROM exercise_entries ee
           WHERE ee.exercise_preset_entry_id = ANY($1::uuid[])
           ORDER BY ee.sort_order ASC, ee.created_at ASC`,
          [presetIds],
        )
        .then((r: { rows: Record<string, unknown>[] }) => {
          for (const row of r.rows) {
            const entry = _buildExerciseEntryWithSnapshot(row);
            allExerciseEntryIds.push(entry.id);
            const presetId = row.exercise_preset_entry_id as string;
            const children = presetChildrenMap.get(presetId);
            if (children) {
              children.push(entry);
            }
          }
        }),
    );

    // Preset-level activity details
    batchQueries.push(
      client
        .query(
          `SELECT * FROM exercise_entry_activity_details
           WHERE exercise_preset_entry_id = ANY($1::uuid[])`,
          [presetIds],
        )
        .then((r: { rows: ActivityDetailRow[] }) => {
          for (const row of r.rows) {
            const presetId = row.exercise_preset_entry_id as string;
            if (!presetActivityMap.has(presetId)) {
              presetActivityMap.set(presetId, []);
            }
            presetActivityMap.get(presetId)!.push(row);
          }
        }),
    );
  }

  if (individualIds.length > 0) {
    // Individual exercise entries
    batchQueries.push(
      client
        .query(
          `SELECT ee.*, ${SETS_SUBQUERY}
           FROM exercise_entries ee
           WHERE ee.id = ANY($1::uuid[])`,
          [individualIds],
        )
        .then((r: { rows: Record<string, unknown>[] }) => {
          for (const row of r.rows) {
            const entry = _buildExerciseEntryWithSnapshot(row);
            allExerciseEntryIds.push(entry.id);
            individualMap.set(entry.id, entry);
          }
        }),
    );
  }

  await Promise.all(batchQueries);

  // Entry-level activity details (for both preset children and individuals)
  if (allExerciseEntryIds.length > 0) {
    const adResult = await client.query(
      `SELECT * FROM exercise_entry_activity_details
       WHERE exercise_entry_id = ANY($1::uuid[])`,
      [allExerciseEntryIds],
    );
    const entryActivityMap = new Map<string, ActivityDetailRow[]>();
    for (const row of adResult.rows as ActivityDetailRow[]) {
      const eid = row.exercise_entry_id as string;
      if (!entryActivityMap.has(eid)) {
        entryActivityMap.set(eid, []);
      }
      entryActivityMap.get(eid)!.push(row);
    }

    // Attach entry-level activity details to preset children
    for (const children of presetChildrenMap.values()) {
      for (const child of children) {
        const details = entryActivityMap.get(child.id) ?? [];
        child.activity_details = details.map((d) => ({
          id: d.id,
          provider_name: d.provider_name,
          detail_type: d.detail_type,
          detail_data: _parseDetailData(d.detail_data),
        }));
      }
    }

    // Attach entry-level activity details to individuals
    for (const [id, entry] of individualMap) {
      const details = entryActivityMap.get(id) ?? [];
      entry.activity_details = details.map((d) => ({
        id: d.id,
        provider_name: d.provider_name,
        detail_type: d.detail_type,
        detail_data: _parseDetailData(d.detail_data),
      }));
    }
  }

  // Phase 3: Assemble sessions in stub order
  const sessions: ExerciseSessionResponse[] = [];
  for (const stub of stubs) {
    if (stub.session_type === "preset") {
      const meta = presetMetaMap.get(stub.id);
      if (!meta) continue;
      const children = presetChildrenMap.get(stub.id) ?? [];
      const presetDetails = (presetActivityMap.get(stub.id) ?? []).map((d) => ({
        id: d.id,
        provider_name: d.provider_name,
        detail_type: d.detail_type,
        detail_data: _parseDetailData(d.detail_data),
      }));
      const totalDuration = children.reduce(
        (sum, c) => sum + (c.duration_minutes ?? 0),
        0,
      );
      sessions.push({
        type: "preset" as const,
        id: meta.id as string,
        entry_date: _dateToString(stub.entry_date),
        workout_preset_id: (meta.workout_preset_id as string) ?? null,
        name: meta.name as string,
        description: (meta.description as string) ?? null,
        notes: (meta.notes as string) ?? null,
        source: meta.source as string,
        total_duration_minutes: totalDuration,
        exercises: children,
        activity_details: presetDetails,
      });
    } else {
      const entry = individualMap.get(stub.id);
      if (!entry) continue;
      sessions.push({
        type: "individual" as const,
        ...entry,
      });
    }
  }

  return sessions;
}

/**
 * Get paginated exercise entry history for a user.
 * Returns sessions (preset groups and standalone entries) sorted by date DESC.
 */
export async function getExerciseEntryHistory(
  targetUserId: string,
  page: number,
  pageSize: number,
): Promise<ExerciseHistoryResponse> {
  const offset = (page - 1) * pageSize;
  const client = await getClient(targetUserId);
  try {
    const [sessions, totalCount] = await Promise.all([
      getExerciseEntryHistorySessions(client, targetUserId, pageSize, offset),
      countExerciseEntrySessions(client, targetUserId),
    ]);

    return {
      sessions,
      pagination: {
        page,
        pageSize,
        totalCount,
        hasMore: offset + sessions.length < totalCount,
      },
    };
  } catch (error) {
    log("error", "Error fetching exercise entry history:", error);
    throw error;
  } finally {
    client.release();
  }
}
