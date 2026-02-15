import type React from 'react';
import { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  getNeedsReviewCount,
  getNeedsReviewItems,
  type ReviewItem,
} from '@/services/reviewService';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

const GlobalNotificationIcon: React.FC = () => {
  const { user } = useAuth();
  const [reviewCount, setReviewCount] = useState(0);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => {
    if (!user) return;

    const fetchReviewCount = async () => {
      try {
        // This service and endpoint need to be created.
        const count = await getNeedsReviewCount();
        setReviewCount(count);
        if (count > 0) {
          const items = await getNeedsReviewItems();
          setReviewItems(items);
        }
      } catch (error) {
        console.error('Failed to fetch items needing review:', error);
      }
    };

    fetchReviewCount();
    const interval = setInterval(fetchReviewCount, 60000); // Poll every 60 seconds

    return () => clearInterval(interval);
  }, [user]);

  // Temporarily hide the notification. Remove this line to re-enable.
  return null;
};
export default GlobalNotificationIcon;
