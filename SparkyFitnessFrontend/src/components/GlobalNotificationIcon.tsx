import React, { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { getNeedsReviewCount, getNeedsReviewItems, ReviewItem } from '@/services/reviewService'; // Assuming a service to fetch the count
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

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
        console.error("Failed to fetch items needing review:", error);
      }
    };

    fetchReviewCount();
    const interval = setInterval(fetchReviewCount, 60000); // Poll every 60 seconds

    return () => clearInterval(interval);
  }, [user]);

  // Temporarily hide the notification. Remove this line to re-enable.
  if (true) {
    return null;
  }

  if (!user || reviewCount === 0) {
    return null; // Don't show the icon if not logged in or no items to review
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="relative cursor-pointer" onClick={() => setIsDialogOpen(true)}>
            <Bell className="h-6 w-6" />
            {reviewCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-xs text-white">
                {reviewCount}
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{reviewCount} item(s) need your review.</p>
        </TooltipContent>
      </Tooltip>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Items Needing Review (WIP)</DialogTitle>
            <DialogDescription>
              You have {reviewCount} item(s) that require your attention.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-2">
            {reviewItems.map((item, index) => (
              <div key={`${item.type}-${item.id || index}`} className="flex items-center justify-between p-2 border rounded-md">
                <span>{item.name || '(food)'} ({item.type})</span>
                {/* Add action buttons here if needed, e.g., to dismiss or view details */}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
};

export default GlobalNotificationIcon;