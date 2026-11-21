import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { readOfflineDiaryDay, type OfflineDiaryDay } from '../offline/diaryDay';
import {
  subscribeDiaryDaySaved,
  subscribeOutboxChanged,
} from '../offline/events';
import {
  offlineDiaryDayQueryKey,
  offlineDiaryDayQueryKeyRoot,
} from './queryKeys';

const EMPTY: OfflineDiaryDay = {
  saved: null,
  waiting: [],
  deleted: [],
  savedFood: null,
  waitingFood: [],
  deletedFood: [],
};

/**
 * A day's workouts from this phone: the copy saved at the last diary load
 * and the ones still waiting to upload. Read from the phone's own file, so
 * it answers with no connection, and re-read whenever the upload queue
 * changes (a workout uploaded, finished offline, or resolved).
 */
export function useOfflineDiaryDay(date: string) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: offlineDiaryDayQueryKey(date),
    queryFn: () => readOfflineDiaryDay(date),
    staleTime: 0,
    networkMode: 'always',
  });

  useEffect(() => {
    const reread = () => {
      void queryClient.invalidateQueries({
        queryKey: offlineDiaryDayQueryKeyRoot,
      });
    };
    const stopOutbox = subscribeOutboxChanged(reread);
    const stopSaved = subscribeDiaryDaySaved(reread);
    return () => {
      stopOutbox();
      stopSaved();
    };
  }, [queryClient]);

  return query.data ?? EMPTY;
}
