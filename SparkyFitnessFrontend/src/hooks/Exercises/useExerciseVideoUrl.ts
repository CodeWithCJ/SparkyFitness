import { useQuery } from '@tanstack/react-query';
import { exerciseByIdOptions } from '@/hooks/Exercises/useExercises';

/**
 * The demonstration video link for an exercise shown from the diary. Diary
 * snapshots don't carry it, so unless the snapshot already has one, read it
 * from the library row. The id can be an entry id when the library exercise
 * was deleted, so a miss is expected and stays quiet.
 */
export function useExerciseVideoUrl(
  exerciseId: string | null | undefined,
  snapshotVideoUrl: string | null | undefined,
  enabled: boolean
): string | null {
  const id = exerciseId ?? '';
  const { data } = useQuery({
    ...exerciseByIdOptions(id),
    enabled: enabled && !!id && snapshotVideoUrl === undefined,
    meta: undefined,
    retry: false,
  });
  return snapshotVideoUrl ?? data?.video_url ?? null;
}
