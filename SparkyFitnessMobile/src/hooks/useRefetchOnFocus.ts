import { useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';

type RefetchFn = () => void;

/**
 * Triggers a refetch when the screen gains focus.
 *
 * @param refetch - The refetch function from useQuery (stable reference per React Query)
 * @param enabled - Whether refetching is enabled (defaults to true)
 */
export function useRefetchOnFocus(refetch: RefetchFn, enabled: boolean = true): void {
  useFocusEffect(
    useCallback(() => {
      if (enabled) {
        refetch();
      }
    }, [refetch, enabled])
  );
}
