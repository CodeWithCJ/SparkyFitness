import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { apiCall } from '@/api/api';

export const useSyncAllergens = () => {
  const { toast } = useToast();
  const [syncingAllergens, setSyncingAllergens] = useState(false);

  const handleSyncAllergens = async () => {
    setSyncingAllergens(true);
    try {
      const result = (await apiCall('/foods/sync-allergens', {
        method: 'POST',
      })) as { updated: number; total: number };
      toast({
        title: 'Allergen sync complete',
        description:
          result.total === 0
            ? 'All your OpenFoodFacts foods already have allergen data.'
            : `Updated ${result.updated} of ${result.total} food(s).`,
      });
    } catch {
      toast({
        title: 'Sync failed',
        description: 'Could not sync allergens. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSyncingAllergens(false);
    }
  };

  return { handleSyncAllergens, syncingAllergens };
};
