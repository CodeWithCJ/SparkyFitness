import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  useNeedsReviewCountQuery,
  useNeedsReviewItemsQuery,
} from '@/hooks/Foods/useReview';

const GlobalNotificationIcon = (): null => {
  const { user } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // remove false to activate
  const { data: reviewCount = 0 } = useNeedsReviewCountQuery(!!user && false);

  const { data: reviewItems = [] } = useNeedsReviewItemsQuery(
    !!user && reviewCount > 0
  );

  useEffect(() => {
    if (isDialogOpen) {
      console.log(reviewItems);
      setIsDialogOpen(false);
    }
  }, [isDialogOpen, reviewItems]);

  return null;
};

export default GlobalNotificationIcon;
