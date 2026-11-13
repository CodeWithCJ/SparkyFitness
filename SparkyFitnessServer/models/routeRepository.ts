import { getClient } from '../db/poolManager.js';
import {
  ROUTE_MAX_PER_USER,
  routeCueSchema,
  routePointSchema,
  type CreateRouteBody,
  type Route,
  type RouteSummary,
  type RoutePoint,
  type UpdateRouteBody,
} from '@workspace/shared';
import { z } from 'zod';
import { InvalidRouteError, prepareRoute } from '../utils/routePrep.js';

export class RouteLimitError extends Error {}
export class ActivityHasNoRouteError extends Error {}
export { InvalidRouteError };

type RouteSource = Route['source'];

interface RouteRow {
  id: string;
  name: string;
  activity: Route['activity'];
  source: RouteSource;
  distance_m: number;
  elevation_gain_m: number | null;
  points: unknown;
  cues: unknown;
  source_exercise_entry_id: string | null;
  created_at: Date;
  updated_at: Date;
}

const pointsSchema = z.array(routePointSchema);
const cuesSchema = z.array(routeCueSchema);

const SUMMARY_COLUMNS = `id, name, activity, source, distance_m, elevation_gain_m,
  source_exercise_entry_id, created_at, updated_at,
  points -> 0 AS start, jsonb_array_length(points) AS point_count`;

interface RouteSummaryRow extends Omit<RouteRow, 'points' | 'cues'> {
  start: unknown;
  point_count: number;
}

function mapRoute(row: RouteRow): Route {
  return {
    id: row.id,
    name: row.name,
    activity: row.activity,
    source: row.source,
    distanceM: row.distance_m,
    elevationGainM: row.elevation_gain_m,
    points: pointsSchema.catch([]).parse(row.points),
    cues: cuesSchema.catch([]).parse(row.cues),
    sourceExerciseEntryId: row.source_exercise_entry_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapSummary(row: RouteSummaryRow): RouteSummary {
  const start = routePointSchema.safeParse(row.start);
  return {
    id: row.id,
    name: row.name,
    activity: row.activity,
    source: row.source,
    distanceM: row.distance_m,
    elevationGainM: row.elevation_gain_m,
    sourceExerciseEntryId: row.source_exercise_entry_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    start: start.success ? start.data : null,
    pointCount: row.point_count,
  };
}

export async function listRoutes(
  userId: string,
  authenticatedUserId?: string
): Promise<RouteSummary[]> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = (await client.query(
      `SELECT ${SUMMARY_COLUMNS} FROM routes WHERE user_id = $1 ORDER BY updated_at DESC`,
      [userId]
    )) as { rows: RouteSummaryRow[] };
    return result.rows.map(mapSummary);
  } finally {
    client.release();
  }
}

export async function getRoute(
  userId: string,
  routeId: string,
  authenticatedUserId?: string
): Promise<Route | null> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = (await client.query(
      'SELECT * FROM routes WHERE id = $1 AND user_id = $2',
      [routeId, userId]
    )) as { rows: RouteRow[] };
    return result.rows[0] ? mapRoute(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

export interface NewRoute extends Omit<CreateRouteBody, 'cues' | 'source'> {
  cues?: CreateRouteBody['cues'];
  source: RouteSource;
  sourceExerciseEntryId?: string | null;
}

export async function createRoute(
  userId: string,
  input: NewRoute,
  authenticatedUserId?: string
): Promise<Route> {
  const prepared = prepareRoute(input.points, input.cues);
  const client = await getClient(userId, authenticatedUserId);
  try {
    await client.query('BEGIN');
    // Serialize one person's creates so two at once cannot both pass the
    // limit check.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `routes:${userId}`,
    ]);
    const count = (await client.query(
      'SELECT COUNT(*)::int AS n FROM routes WHERE user_id = $1',
      [userId]
    )) as { rows: Array<{ n: number }> };
    if (count.rows[0].n >= ROUTE_MAX_PER_USER) throw new RouteLimitError();
    const result = (await client.query(
      `INSERT INTO routes
         (user_id, name, activity, source, distance_m, elevation_gain_m,
          points, cues, source_exercise_entry_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)
       RETURNING *`,
      [
        userId,
        input.name,
        input.activity,
        input.source,
        prepared.distanceM,
        prepared.elevationGainM,
        JSON.stringify(prepared.points),
        JSON.stringify(prepared.cues),
        input.sourceExerciseEntryId ?? null,
      ]
    )) as { rows: RouteRow[] };
    await client.query('COMMIT');
    return mapRoute(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function updateRoute(
  userId: string,
  routeId: string,
  patch: UpdateRouteBody,
  authenticatedUserId?: string
): Promise<Route | null> {
  // Validate and measure the new line before touching the row.
  const prepared = patch.points ? prepareRoute(patch.points, patch.cues) : null;
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = (await client.query(
      `UPDATE routes
          SET name = COALESCE($3, name),
              activity = COALESCE($4, activity),
              points = COALESCE($5::jsonb, points),
              cues = COALESCE($6::jsonb, cues),
              distance_m = COALESCE($7, distance_m),
              elevation_gain_m = CASE WHEN $5::jsonb IS NULL
                                      THEN elevation_gain_m ELSE $8 END,
              updated_at = NOW()
        WHERE id = $1 AND user_id = $2
        RETURNING *`,
      [
        routeId,
        userId,
        patch.name ?? null,
        patch.activity ?? null,
        prepared ? JSON.stringify(prepared.points) : null,
        prepared ? JSON.stringify(prepared.cues) : null,
        prepared?.distanceM ?? null,
        prepared?.elevationGainM ?? null,
      ]
    )) as { rows: RouteRow[] };
    return result.rows[0] ? mapRoute(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

export async function deleteRoute(
  userId: string,
  routeId: string,
  authenticatedUserId?: string
): Promise<boolean> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = (await client.query(
      'DELETE FROM routes WHERE id = $1 AND user_id = $2',
      [routeId, userId]
    )) as { rowCount: number | null };
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

interface ActivityRow {
  exercise_name: string | null;
  entry_date: string | Date;
  points: unknown;
}

/**
 * One stored GPS point as a route point. A bad altitude (an out-of-range
 * sentinel, say) only costs the altitude, never the position: the point is kept
 * without `alt`. A point with no usable position is dropped (null).
 */
export function toRoutePoint(raw: unknown): RoutePoint | null {
  const full = routePointSchema.safeParse(raw);
  if (full.success) return full.data;
  if (typeof raw !== 'object' || raw === null) return null;
  const { lat, lon } = raw as { lat?: unknown; lon?: unknown };
  const position = routePointSchema.omit({ alt: true }).safeParse({ lat, lon });
  return position.success ? position.data : null;
}

/** The GPS track of a recorded activity, or null if the entry is not theirs or has none. */
export async function getActivityTrack(
  userId: string,
  exerciseEntryId: string,
  authenticatedUserId?: string
): Promise<{ name: string | null; points: RoutePoint[] } | null> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = (await client.query(
      `SELECT ee.exercise_name, p.entry_date, p.points
         FROM exercise_entry_gps_points p
         JOIN exercise_entries ee ON ee.id = p.exercise_entry_id
        WHERE p.exercise_entry_id = $1 AND p.user_id = $2
          AND ee.user_id = $2`,
      [exerciseEntryId, userId]
    )) as { rows: ActivityRow[] };
    const row = result.rows[0];
    if (!row || !Array.isArray(row.points)) return null;
    const points: RoutePoint[] = [];
    for (const raw of row.points) {
      const point = toRoutePoint(raw);
      if (point) points.push(point);
    }
    return { name: row.exercise_name, points };
  } finally {
    client.release();
  }
}
