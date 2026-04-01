import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type { ExerciseHistoryResponse, ExerciseSessionResponse } from '@workspace/shared';
import type { DailySummaryRawData } from './useDailySummary';
import { normalizeDate } from '../utils/dateUtils';
import { dailySummaryQueryKey, exerciseHistoryQueryKey } from './queryKeys';

function replaceSession(
  sessions: ExerciseSessionResponse[],
  updatedSession: ExerciseSessionResponse,
): ExerciseSessionResponse[] {
  let didUpdate = false;

  const nextSessions = sessions.map(session => {
    if (session.id !== updatedSession.id) {
      return session;
    }

    didUpdate = true;
    return updatedSession;
  });

  return didUpdate ? nextSessions : sessions;
}

export function syncExerciseSessionInCache(
  queryClient: QueryClient,
  updatedSession: ExerciseSessionResponse,
) {
  queryClient.setQueriesData<InfiniteData<ExerciseHistoryResponse>>(
    { queryKey: exerciseHistoryQueryKey },
    existing => {
      if (!existing) return existing;

      let didUpdate = false;
      const nextPages = existing.pages.map(page => {
        const nextSessions = replaceSession(page.sessions, updatedSession);
        if (nextSessions === page.sessions) {
          return page;
        }

        didUpdate = true;
        return {
          ...page,
          sessions: nextSessions,
        };
      });

      if (!didUpdate) {
        return existing;
      }

      return {
        ...existing,
        pages: nextPages,
      };
    },
  );

  const entryDate = updatedSession.entry_date ? normalizeDate(updatedSession.entry_date) : undefined;
  if (!entryDate) {
    return;
  }

  queryClient.setQueryData<DailySummaryRawData>(
    dailySummaryQueryKey(entryDate),
    existing => {
      if (!existing) return existing;

      const nextSessions = replaceSession(existing.exerciseEntries, updatedSession);
      if (nextSessions === existing.exerciseEntries) {
        return existing;
      }

      return {
        ...existing,
        exerciseEntries: nextSessions,
      };
    },
  );
}
