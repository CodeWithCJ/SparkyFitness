import { useQuery } from '@tanstack/react-query';
import { fetchExerciseById } from '../services/api/exerciseApi';
import { exerciseDetailQueryKey } from './queryKeys';
import { useServerConnection } from './useServerConnection';

// The server's `/exercises/:id` route 400s on non-UUID ids.
const UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * The demonstration video link for an exercise in a workout. Diary snapshots
 * don't carry it, so unless the snapshot already has one (an exercise added
 * from the library this session), read it from the cached library record.
 * Shares the exercise detail query, so opening the exercise reuses it.
 */
export function useExerciseVideoUrl(
  exerciseId: string | null | undefined,
  snapshotVideoUrl: string | null | undefined,
  enabled: boolean
): string | null {
  const { isConnected } = useServerConnection();
  const id = exerciseId ?? '';
  const { data } = useQuery({
    queryKey: exerciseDetailQueryKey(id),
    queryFn: () => fetchExerciseById(id),
    enabled:
      enabled &&
      isConnected &&
      snapshotVideoUrl === undefined &&
      UUID_REGEX.test(id),
    staleTime: 10 * 60 * 1000,
  });
  return snapshotVideoUrl ?? data?.videoUrl ?? null;
}
