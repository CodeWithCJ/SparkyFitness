import { useQuery } from '@tanstack/react-query';
import { fetchFamilyDiaryUsers } from '../services/api/familyApi';
import { fetchDailySummary } from '../services/api/dailySummaryApi';
import { familyDailySummaryQueryKey, familyUsersQueryKey } from './queryKeys';

interface UseFamilyDailySummaryOptions {
  familyUserId: string;
  date: string;
  enabled?: boolean;
}

export function useFamilyUsers() {
  return useQuery({
    queryKey: familyUsersQueryKey,
    queryFn: fetchFamilyDiaryUsers,
  });
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
