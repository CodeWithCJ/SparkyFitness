import { getBloodAlcohol } from '@/api/Diary/bloodAlcoholService';
import { bloodAlcoholKeys } from '@/api/keys/diary';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

export const useBloodAlcoholQuery = (date: string) => {
  const { t } = useTranslation();
  return useQuery({
    queryKey: bloodAlcoholKeys.estimate(date),
    queryFn: () => getBloodAlcohol(date),
    enabled: Boolean(date),
    // Body data, profile and BAC settings are edited on other pages that do
    // not invalidate this key; refetch whenever the card mounts again.
    staleTime: 0,
    meta: {
      errorMessage: t(
        'diary.bloodAlcohol.failedToLoad',
        'Failed to load the blood alcohol estimate.'
      ),
    },
  });
};
