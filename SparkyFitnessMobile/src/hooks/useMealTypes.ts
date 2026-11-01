import { useQuery } from '@tanstack/react-query';
import {
  fetchFamilyMealTypes,
  fetchMealTypes,
} from '../services/api/mealTypesApi';
import { getDefaultMealTypeId } from '../constants/meals';
import { familyMealTypesQueryKey, mealTypesQueryKey } from './queryKeys';

export function useMealTypes(options?: {
  enabled?: boolean;
  familyUserId?: string;
}) {
  const { enabled = true, familyUserId } = options ?? {};

  const query = useQuery({
    queryKey: familyUserId
      ? familyMealTypesQueryKey(familyUserId)
      : mealTypesQueryKey,
    queryFn: familyUserId
      ? () => fetchFamilyMealTypes(familyUserId)
      : fetchMealTypes,
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled,
    select: (data) => {
      const mealTypes = data
        .filter((mt) => mt.is_visible)
        .sort((a, b) => a.sort_order - b.sort_order);
      return {
        mealTypes,
        defaultMealTypeId: getDefaultMealTypeId(mealTypes),
      };
    },
  });

  return {
    mealTypes: query.data?.mealTypes ?? [],
    defaultMealTypeId: query.data?.defaultMealTypeId ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
