import { apiCall } from '@/api/api';
import {
  compareResponseSchema,
  compareSinceResponseSchema,
  isAskable,
  timingOf,
  type CompareQuery,
  type CompareQuestion,
  type CompareResponse,
  type CompareSinceQuery,
  type CompareSinceResponse,
} from '@workspace/shared';

/**
 * Whether two tracked things go together, over a window of days or weeks.
 * `quiet` leaves a failure to the caller, with no toast.
 */
export const getCompare = async (
  query: CompareQuery,
  { quiet = false }: { quiet?: boolean } = {}
): Promise<CompareResponse> => {
  const response = await apiCall('/v2/reports/compare', {
    method: 'GET',
    params: {
      a: query.a,
      b: query.b,
      mode: query.mode,
      timing: query.timing,
      start: query.start,
      end: query.end,
    },
    ...(quiet ? { suppressErrorToast: true } : {}),
  });
  return compareResponseSchema.parse(response);
};

/** The request for a picked question, or null when it is not askable here (incomplete). Since questions are `compareSinceQueryFor`'s. */
export const compareQueryFor = (
  question: Partial<CompareQuestion>,
  window: { startDate: string; endDate: string }
): CompareQuery | null => {
  if (!isAskable(question)) return null;
  const { mode, timing } = timingOf(question.choice);
  if (mode === 'since') return null;
  return {
    a: question.a,
    b: question.b,
    mode,
    timing,
    start: window.startDate,
    end: window.endDate,
  };
};

/** Whether an outcome differs since a habit started, against the days before it. */
export const getCompareSince = async (
  query: CompareSinceQuery
): Promise<CompareSinceResponse> => {
  const response = await apiCall('/v2/reports/compare', {
    method: 'GET',
    params: {
      a: query.a,
      b: query.b,
      mode: query.mode,
      ...(query.habitStart !== undefined && { habitStart: query.habitStart }),
      ...(query.line !== undefined && { line: query.line }),
    },
  });
  return compareSinceResponseSchema.parse(response);
};

/**
 * The request for a picked since question, or null when it is incomplete or
 * not a since question. A start or line not picked yet (null) is left out, and
 * the server suggests them.
 */
export const compareSinceQueryFor = (
  question: Partial<CompareQuestion>,
  habitStart: string | null,
  line: number | null
): CompareSinceQuery | null => {
  if (!isAskable(question)) return null;
  const { mode } = timingOf(question.choice);
  if (mode !== 'since') return null;
  return {
    a: question.a,
    b: question.b,
    mode,
    ...(habitStart !== null && { habitStart }),
    ...(line !== null && { line }),
  };
};
