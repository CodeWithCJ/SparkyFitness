import { useQueries, useQuery } from '@tanstack/react-query';
import type {
  CompareQuery,
  CompareQuestion,
  CompareSinceQuery,
} from '@workspace/shared';
import { useTranslation } from 'react-i18next';
import { reportKeys } from '@/api/keys/reports';
import {
  compareQueryFor,
  compareSinceQueryFor,
  getCompare,
  getCompareSince,
} from '@/api/Reports/compareApi';
import { useAuth } from '@/hooks/useAuth';

// Short enough that coming back to the tab after logging something refetches.
const COMPARE_STALE_MS = 60_000;

type Timing = -1 | 0 | 1;

export const useCompare = (query: CompareQuery | null) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const userId = user?.activeUserId;
  return useQuery({
    queryKey: query
      ? reportKeys.compare(query, userId)
      : (['reports', 'compare', 'idle'] as const),
    queryFn: () => getCompare(query!),
    enabled: query !== null,
    staleTime: COMPARE_STALE_MS,
    meta: {
      errorMessage: t(
        'compareReport.loadFailed',
        "Couldn't load this comparison"
      ),
    },
  });
};

/**
 * The same pair read at the other timings, for the "other timings" rows. They
 * wait until the main answer has settled (`mainSettled`), so the asked timing
 * loads first. They are asked quietly: a failed row shows "Couldn't load" in
 * its row instead of a toast, so a bad moment never stacks up three of them.
 */
export const useCompareTimings = (
  base: CompareQuery | null,
  mainSettled: boolean
) => {
  const { user } = useAuth();
  const userId = user?.activeUserId;
  const all: readonly Timing[] = base?.mode === 'week' ? [0, 1] : [-1, 0, 1];
  const timings = all.filter((timing) => timing !== base?.timing);
  const results = useQueries({
    queries: timings.map((timing) => {
      const query = base ? { ...base, timing } : null;
      return {
        queryKey: query
          ? reportKeys.compare(query, userId)
          : (['reports', 'compare', 'idle', timing] as const),
        queryFn: () => getCompare(query!, { quiet: true }),
        enabled: query !== null && mainSettled,
        staleTime: COMPARE_STALE_MS,
      };
    }),
  });
  return timings.map((timing, i) => ({ timing, query: results[i]! }));
};

/**
 * A picked question read over a window: the asked timing, then the other
 * timings once it has an answer or an error. `window` is null when nothing
 * may be asked (acting on behalf), so no request fires.
 */
export const useCompareQuestion = (
  question: Partial<CompareQuestion>,
  window: { startDate: string; endDate: string } | null
) => {
  const query = window ? compareQueryFor(question, window) : null;
  const answer = useCompare(query);
  const timings = useCompareTimings(query, answer.isSuccess || answer.isError);
  return { answer, timings };
};

export const useCompareSince = (query: CompareSinceQuery | null) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const userId = user?.activeUserId;
  return useQuery({
    queryKey: query
      ? reportKeys.compareSince(query, userId)
      : (['reports', 'compareSince', 'idle'] as const),
    queryFn: () => getCompareSince(query!),
    enabled: query !== null,
    staleTime: COMPARE_STALE_MS,
    meta: {
      errorMessage: t(
        'compareReport.loadFailed',
        "Couldn't load this comparison"
      ),
    },
  });
};

/**
 * A picked since question with the habit start and line picked so far (null
 * for one not picked yet, which the server then suggests). `picks` is null
 * when nothing may be asked (acting on behalf), so no request fires.
 */
export const useCompareSinceQuestion = (
  question: Partial<CompareQuestion>,
  picks: { habitStart: string | null; line: number | null } | null
) =>
  useCompareSince(
    picks ? compareSinceQueryFor(question, picks.habitStart, picks.line) : null
  );
