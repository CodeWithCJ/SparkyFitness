import { useQuery } from '@tanstack/react-query';
import { fetchFamilyDiaryUsers } from '../services/api/familyApi';
import { fetchDailySummary } from '../services/api/dailySummaryApi';
import { useRefetchOnFocus } from './useRefetchOnFocus';
import {
  familyCopySourceQueryKey,
  familyDailySummaryQueryKey,
  familyUsersQueryKey,
} from './queryKeys';

interface UseFamilyDailySummaryOptions {
  familyUserId: string;
  date: string;
  enabled?: boolean;
}

interface UseFamilyUsersOptions {
  enabled?: boolean;
  refetchOnFocus?: boolean;
}

export function useFamilyUsers({
  enabled = true,
  refetchOnFocus = false,
}: UseFamilyUsersOptions = {}) {
  const query = useQuery({
    queryKey: familyUsersQueryKey,
    queryFn: fetchFamilyDiaryUsers,
    enabled,
    ...(refetchOnFocus ? { staleTime: 0 } : {}),
  });
  useRefetchOnFocus(query.refetch, enabled && refetchOnFocus, 0);
  return query;
}

// Copy review needs actual food-entry IDs, before the own diary folds logged
// meal components into synthetic display rows. It never changes profile context.
export function useFamilyCopySource({
  date,
  enabled = true,
}: {
  date: string;
  enabled?: boolean;
}) {
  const canFetch = enabled && date.length > 0;
  const query = useQuery({
    queryKey: familyCopySourceQueryKey(date),
    queryFn: () => fetchDailySummary(date),
    enabled: canFetch,
    staleTime: 0,
  });
  useRefetchOnFocus(query.refetch, canFetch, 0);
  return query;
}

export function useFamilyDailySummary({
  familyUserId,
  date,
  enabled = true,
}: UseFamilyDailySummaryOptions) {
  return useQuery({
    queryKey: familyDailySummaryQueryKey(familyUserId, date),
    queryFn: () => fetchDailySummary(date, familyUserId),
    enabled: enabled && familyUserId.length > 0,
  });
}
