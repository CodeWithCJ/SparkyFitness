import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchMealTypes } from '../services/api/mealTypesApi';
import { getDefaultMealTypeId } from '../constants/meals';
import { mealTypesQueryKey } from './queryKeys';

export function useMealTypes(options?: { enabled?: boolean }) {
  const { enabled = true } = options ?? {};

  const query = useQuery({
    queryKey: mealTypesQueryKey,
    queryFn: fetchMealTypes,
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled,
  });

  const mealTypes = useMemo(
    () =>
      (query.data ?? [])
        .filter((mt) => mt.is_visible)
        .sort((a, b) => a.sort_order - b.sort_order),
    [query.data],
  );

  const defaultMealTypeId = useMemo(
    () => getDefaultMealTypeId(mealTypes),
    [mealTypes],
  );

  return {
    mealTypes,
    defaultMealTypeId,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
