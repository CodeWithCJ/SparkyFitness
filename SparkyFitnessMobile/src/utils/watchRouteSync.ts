import type { Route } from '@workspace/shared';
import type {
  WatchRouteLibraryPayload,
  WatchRouteSyncPayload,
} from '../../modules/watch-connectivity';
import { toWatchRoutePayload } from './watchRoute';

/**
 * Where a saved route stands on the watch, as far as this phone knows.
 *
 * - `none`: never sent (or removed).
 * - `pending`: sent at its current revision; the watch has not said it holds it yet.
 * - `onWatch`: the watch reports this revision or a newer one.
 * - `outdated`: the watch holds, or was sent, an older revision (the route was
 *   edited since). Nothing re-sends it on its own.
 * - `full`: the watch turned this revision away.
 */
export type WatchRouteStatus =
  'none' | 'pending' | 'onWatch' | 'outdated' | 'full';

/** What the phone remembers about the watch's route library. */
export interface WatchRouteRecord {
  /** Route id -> the revision (epoch ms) last sent. */
  sent: Record<string, number>;
  /** What the watch last reported holding, id -> revision; null before any report. */
  reported: Record<string, number> | null;
  /** Route ids the watch turned away, with why. */
  rejected: Record<string, 'full' | 'storage'>;
}

/** The library cap the watch reports; used until it has said. */
export const DEFAULT_WATCH_ROUTE_CAPACITY = 10;

/** A route's revision for the watch: its `updatedAt` as epoch ms (0 if unreadable). */
export function routeRevision(updatedAt: string): number {
  const ms = Date.parse(updatedAt);
  return Number.isFinite(ms) ? ms : 0;
}

export function watchRouteStatus(
  route: Pick<Route, 'id' | 'updatedAt'>,
  record: WatchRouteRecord
): WatchRouteStatus {
  const current = routeRevision(route.updatedAt);
  const sent = record.sent[route.id];
  const onWatch = record.reported?.[route.id];

  if (record.rejected[route.id] && sent === current && onWatch === undefined) {
    return 'full';
  }
  if (onWatch !== undefined) {
    if (onWatch >= current) return 'onWatch';
    return sent === current ? 'pending' : 'outdated';
  }
  if (sent === undefined) return 'none';
  return sent === current ? 'pending' : 'outdated';
}

/** The `routeSync` message for a route, or null when it has no line to follow. */
export function buildRouteSync(
  route: Pick<Route, 'id' | 'name' | 'points' | 'cues' | 'updatedAt'>
): WatchRouteSyncPayload | null {
  const payload = toWatchRoutePayload(route);
  if (!payload) return null;
  return { route: payload, updatedAt: routeRevision(route.updatedAt) };
}

/**
 * The record after the watch's report. The watch keeps its rejections only in
 * memory, so a report after a relaunch carries none; a rejection the phone
 * already holds stays until the route is reported, re-sent or removed.
 */
export function applyLibraryReport(
  record: WatchRouteRecord,
  report: WatchRouteLibraryPayload
): WatchRouteRecord {
  const reported: Record<string, number> = {};
  for (const row of report.routes) reported[row.id] = row.updatedAt;
  const rejected: WatchRouteRecord['rejected'] = {};
  for (const [id, reason] of Object.entries(record.rejected)) {
    if (!(id in reported)) rejected[id] = reason;
  }
  for (const row of report.rejected) {
    rejected[row.id] = row.reason === 'full' ? 'full' : 'storage';
  }
  return { sent: record.sent, reported, rejected };
}
