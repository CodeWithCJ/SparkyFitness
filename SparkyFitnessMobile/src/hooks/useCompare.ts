import { useQuery } from '@tanstack/react-query';
import {
  type CompareQuestion,
  type CompareResponse,
  type CompareSinceResponse,
  isAskable,
  timingOf,
} from '@workspace/shared';
import {
  fetchCompare,
  fetchCompareSince,
  type CompareParams,
  type CompareSinceParams,
} from '../services/api/compareApi';
import { ApiError } from '../services/api/errors';
import { compareQueryKey, compareSinceQueryKey } from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';

interface CompareAnswer<T> {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  /** The server has no compare endpoint, or none for this mode. */
  serverTooOld: boolean;
  refetch: () => void;
}

function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.statusCode === 404;
}

/**
 * A server from before since mode checks `mode=since` against its day/week
 * schema and answers 400 with `mode` in the validation details. Any other 400
 * (a start out of range, say) is an ordinary error from a server that has it.
 */
function rejectsSinceMode(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.statusCode !== 400 || !error.body) {
    return false;
  }
  try {
    const body: unknown = JSON.parse(error.body);
    return (
      typeof body === 'object' &&
      body !== null &&
      'details' in body &&
      typeof body.details === 'object' &&
      body.details !== null &&
      'mode' in body.details
    );
  } catch {
    return false;
  }
}

function useCompareQuery<T>(
  queryKey: readonly unknown[],
  queryFn: () => Promise<T>,
  enabled: boolean,
  tooOld: (error: unknown) => boolean
): CompareAnswer<T> {
  const query = useQuery({ queryKey, queryFn, enabled });

  // The app's default staleTime is Infinity, so follow new logs on focus.
  const refetch = () => void query.refetch();
  useRefetchOnFocus(refetch, enabled);

  // A disabled key may still hold another question's answer or error: a since
  // question falls back to the same day key as that pair's same-day question.
  if (!enabled) {
    return {
      data: undefined,
      isLoading: false,
      isError: false,
      serverTooOld: false,
      refetch,
    };
  }
  const serverTooOld = tooOld(query.error);
  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError && !serverTooOld,
    serverTooOld,
    refetch,
  };
}

/** A day or week question; a since question is left to useCompareSince. */
export function useCompare(
  question: Partial<CompareQuestion>,
  window: { startDate: string; endDate: string }
): CompareAnswer<CompareResponse> {
  const timing = isAskable(question) ? timingOf(question.choice) : null;
  const paired = timing && timing.mode !== 'since' ? timing : null;
  const params: CompareParams = {
    a: question.a ?? 'mood',
    b: question.b ?? 'mood',
    mode: paired?.mode ?? 'day',
    timing: paired?.timing ?? 0,
    start: window.startDate,
    end: window.endDate,
  };
  return useCompareQuery(
    compareQueryKey(params),
    () => fetchCompare(params),
    paired !== null,
    isNotFound
  );
}

/**
 * Has the outcome (b) changed since the habit (a) started? `habitStart` and
 * `line` are null until the person picks them, leaving them to the server.
 */
export function useCompareSince(
  question: Partial<CompareQuestion>,
  habitStart: string | null,
  line: number | null
): CompareAnswer<CompareSinceResponse> {
  const enabled =
    isAskable(question) && timingOf(question.choice).mode === 'since';
  const params: CompareSinceParams = {
    a: question.a ?? 'mood',
    b: question.b ?? 'mood',
    habitStart,
    line,
  };
  return useCompareQuery(
    compareSinceQueryKey(params),
    () => fetchCompareSince(params),
    enabled,
    (error) => isNotFound(error) || rejectsSinceMode(error)
  );
}
