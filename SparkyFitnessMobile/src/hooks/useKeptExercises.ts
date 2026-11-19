import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getOfflineDb } from '../offline/db';
import { subscribeOutboxChanged } from '../offline/events';
import { listKeptExercises } from '../offline/offlineImages';
import { getActiveServerConfigId } from '../services/storage';
import { keptExercisesQueryKey } from './queryKeys';

async function readKept(): Promise<Set<string>> {
  const serverConfigId = await getActiveServerConfigId();
  if (!serverConfigId) return new Set();
  return listKeptExercises(await getOfflineDb(), serverConfigId);
}

const EMPTY = new Set<string>();

/** Exercises whose pictures the person chose to keep offline (#1983). */
export function useKeptExercises(): ReadonlySet<string> {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: keptExercisesQueryKey,
    queryFn: readKept,
    staleTime: 0,
    networkMode: 'always',
  });
  useEffect(
    () =>
      subscribeOutboxChanged(() => {
        void queryClient.invalidateQueries({ queryKey: keptExercisesQueryKey });
      }),
    [queryClient]
  );
  return query.data ?? EMPTY;
}
