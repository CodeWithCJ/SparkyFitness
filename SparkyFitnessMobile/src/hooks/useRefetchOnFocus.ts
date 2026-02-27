import { useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';

type RefetchFn = () => void;

const DEFAULT_STALE_TIME = 30_000;

/**
 * Triggers a refetch when the screen gains focus, but only if enough time
 * has elapsed since the last refetch to avoid redundant network requests
 * on rapid tab switches.
 *
 * @param refetch - The refetch function from useQuery (stable reference per React Query)
 * @param enabled - Whether refetching is enabled (defaults to true)
 * @param staleTime - Minimum ms between refetches (defaults to 30 000)
 */
export function useRefetchOnFocus(
  refetch: RefetchFn,
  enabled: boolean = true,
  staleTime: number = DEFAULT_STALE_TIME,
): void {
  const lastRefetchedAt = useRef(-Infinity);

  useFocusEffect(
    useCallback(() => {
      if (enabled && Date.now() - lastRefetchedAt.current >= staleTime) {
        lastRefetchedAt.current = Date.now();
        refetch();
      }
    }, [refetch, enabled, staleTime])
  );
}
