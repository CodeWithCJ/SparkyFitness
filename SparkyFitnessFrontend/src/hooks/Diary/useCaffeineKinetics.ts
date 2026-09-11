import { getActiveCaffeine } from '@/api/Diary/caffeineService';
import { caffeineKeys } from '@/api/keys/diary';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

export const useActiveCaffeineQuery = (
  date: string,
  userId?: string | null,
  doseMg?: number,
  enabled: boolean = true
) => {
  const { t } = useTranslation();
  return useQuery({
    queryKey: caffeineKeys.active(date, userId ?? undefined),
    queryFn: () => getActiveCaffeine(date, userId ?? undefined, doseMg),
    enabled: Boolean(date) && enabled,
    meta: {
      errorMessage: t(
        'diary.caffeine.failedToLoad',
        'Failed to load active caffeine data.'
      ),
    },
  });
};
