import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  useNeedsReviewCountQuery,
  useNeedsReviewItemsQuery,
} from '@/hooks/Foods/useReview';

const GlobalNotificationIcon = () => {
  const { user } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // remove false to activate
  const { data: reviewCount = 0 } = useNeedsReviewCountQuery(!!user && false);

  const { data: reviewItems = [] } = useNeedsReviewItemsQuery(
    !!user && reviewCount > 0
  );

  return null;
};

export default GlobalNotificationIcon;
