import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildFollowRoadsRequest,
  followRoadsKey,
  type GeneratedRoutePreview,
  type RouteGenerateErrorKind,
  type RouteStyle,
} from '@workspace/shared';
import { generateRoutePreview } from '../services/routeService';
import { classifyRouteGenerateError } from '../utils/routeGenerateError';
import { routeRequestBudget } from '../utils/routeRequestBudget';
import {
  assembleLine,
  planSegments,
  segmentPoints,
  type EditorLine,
  type EditorSegment,
  type EditorState,
} from '../utils/routeEditor';

/** Wait for the edits to settle: the server allows 10 requests per 10 minutes. */
export const FOLLOW_ROADS_DEBOUNCE_MS = 800;
/** Routed pieces kept for undo/redo and for toggling back; oldest go first. */
const CACHE_LIMIT = 200;

type SnapSegment = Extract<EditorSegment, { kind: 'snap' }>;

export interface FollowRoadsState {
  /** The whole line as drawn now: routed pieces where available, straight or kept pieces elsewhere. */
  line: EditorLine;
  /** True when no snapped piece is still waiting for (or failed to get) its routed line. */
  isCurrent: boolean;
  isLoading: boolean;
  error: unknown;
  errorKind: RouteGenerateErrorKind | null;
  /** Asks again now, also after a rate limit paused automatic requests. */
  retry: () => void;
}

interface Failure {
  error: unknown;
  kind: RouteGenerateErrorKind;
}

/**
 * Snaps the snapped stretches of an edited route to roads through the generate
 * endpoint (waypoints mode). Consecutive snapped stretches are routed together
 * as one piece, so moving a point only re-routes the pieces beside it, and each
 * piece's answer is cached by its waypoints (undo, redo and toggling back cost
 * no request). Requests are debounced and counted against the editor's share of
 * the server's rate limit: when that is used up, or the server answers 429,
 * automatic requests pause (the first resumes by itself when the window frees
 * up) and the unrouted pieces stay on screen as straight lines. A failed piece
 * is also drawn straight until `retry`, so the points are never lost. A
 * changed `style` counts as a changed request.
 */
export function useFollowRoadsRoute(
  enabled: boolean,
  state: EditorState,
  style?: RouteStyle
): FollowRoadsState {
  const [cache, setCache] = useState<
    ReadonlyMap<string, GeneratedRoutePreview>
  >(() => new Map());
  const [failures, setFailures] = useState<ReadonlyMap<string, Failure>>(
    () => new Map()
  );
  // Why automatic requests are paused: the server said 429, or the editor's
  // own share of the limit is spent.
  const [pause, setPause] = useState<'server' | 'budget' | null>(null);
  const inFlight = useRef(new Set<string>());

  const segments = useMemo(
    () => planSegments(state, enabled),
    [state, enabled]
  );
  const pieces = useMemo(
    () =>
      segments
        .filter((s): s is SnapSegment => s.kind === 'snap')
        .map((segment) => {
          const points = segmentPoints(state, segment);
          return {
            segment,
            key: followRoadsKey(points, 'run', style),
            request: buildFollowRoadsRequest(points, 'run', style),
          };
        }),
    [segments, state, style]
  );
  const keyOf = useMemo(() => {
    const keys = new Map<SnapSegment, string>();
    pieces.forEach((piece) => keys.set(piece.segment, piece.key));
    return keys;
  }, [pieces]);

  const line = useMemo(
    () =>
      assembleLine(state, segments, (segment) => {
        const key = keyOf.get(segment);
        return key ? (cache.get(key) ?? null) : null;
      }),
    [state, segments, keyOf, cache]
  );

  const missing = pieces.filter(
    (piece) => !cache.has(piece.key) && !failures.has(piece.key)
  );
  const missingKey = missing.map((piece) => piece.key).join('|');

  const run = useCallback(() => {
    for (const piece of pieces) {
      if (
        !piece.request ||
        cache.has(piece.key) ||
        failures.has(piece.key) ||
        inFlight.current.has(piece.key)
      ) {
        continue;
      }
      if (!routeRequestBudget.take()) {
        setPause('budget');
        return;
      }
      const { key, request } = piece;
      inFlight.current.add(key);
      generateRoutePreview(request)
        .then((route) => {
          setCache((current) => {
            const next = new Map(current).set(key, route);
            if (next.size > CACHE_LIMIT) {
              const oldest = next.keys().next().value;
              if (oldest !== undefined) next.delete(oldest);
            }
            return next;
          });
        })
        .catch((error: unknown) => {
          const kind = classifyRouteGenerateError(error);
          if (kind === 'rateLimited') setPause('server');
          setFailures((current) => new Map(current).set(key, { error, kind }));
        })
        .finally(() => inFlight.current.delete(key));
    }
  }, [pieces, cache, failures]);

  useEffect(() => {
    if (!enabled || missingKey === '' || pause !== null) return;
    const timer = setTimeout(run, FOLLOW_ROADS_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [enabled, missingKey, pause, run]);

  // A spent budget frees up on its own; a server 429 waits for `retry`.
  useEffect(() => {
    if (pause !== 'budget') return;
    const timer = setTimeout(
      () => setPause(null),
      routeRequestBudget.msUntilFree()
    );
    return () => clearTimeout(timer);
  }, [pause]);

  const retry = useCallback(() => {
    setPause(null);
    setFailures(new Map());
  }, []);

  // The failure of any piece in the current line; others may have routed fine.
  const failure = pieces
    .map((piece) => failures.get(piece.key))
    .find((f): f is Failure => f !== undefined);
  const budgetPaused = enabled && pause === 'budget' && missing.length > 0;

  return {
    line,
    isCurrent: enabled ? pieces.every((piece) => cache.has(piece.key)) : true,
    isLoading: enabled && missing.length > 0 && pause === null,
    error: failure?.error ?? null,
    errorKind: failure?.kind ?? (budgetPaused ? 'rateLimited' : null),
    retry,
  };
}
