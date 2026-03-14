import type { QueryClient } from '@tanstack/react-query';
import type { ExerciseHistoryResponse, ExerciseSessionResponse } from '@workspace/shared';
import type { DailySummaryRawData } from './useDailySummary';
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
  queryClient.setQueriesData<ExerciseHistoryResponse>(
    { queryKey: exerciseHistoryQueryKey },
    existing => {
      if (!existing) return existing;

      const nextSessions = replaceSession(existing.sessions, updatedSession);
      if (nextSessions === existing.sessions) {
        return existing;
      }

      return {
        ...existing,
        sessions: nextSessions,
      };
    },
  );

  const entryDate = updatedSession.entry_date?.split('T')[0];
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
