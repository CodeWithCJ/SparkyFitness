import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type { ExerciseHistoryResponse, ExerciseSessionResponse } from '@workspace/shared';
import { exerciseHistoryQueryKey } from './queryKeys';

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
}
