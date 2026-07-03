import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { reviewKeys } from '@/api/keys/review';
import {
  getNeedsReviewItems,
  getNeedsReviewCount,
} from '@/api/Foods/reviewService';

export const useNeedsReviewItemsQuery = (enabled = true) => {
  const { t } = useTranslation();

  return useQuery({
    queryKey: reviewKeys.items(),
    queryFn: () => getNeedsReviewItems(),
    enabled,
    meta: {
      errorMessage: t(
        'review.errorLoadingItems',
        'Failed to load review items.'
      ),
    },
  });
};

export const useNeedsReviewCountQuery = (enabled = true) => {
  const { t } = useTranslation();

  return useQuery({
    queryKey: reviewKeys.count(),
    queryFn: () => getNeedsReviewCount(),
    enabled,
    meta: {
      errorMessage: t(
        'review.errorLoadingCount',
        'Failed to load review count.'
      ),
    },
  });
};
