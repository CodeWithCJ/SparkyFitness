import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { apiCall } from '@/api/api';

import i18n from 'i18next';
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
        title: i18n.t(
          'hooks.useSyncAllergens.allergenSyncComplete',
          'Allergen sync complete'
        ),
        description:
          result.total === 0
            ? i18n.t(
                'hooks.useSyncAllergens.allYourOpenFoodFactsFoodsAlready',
                'All your OpenFoodFacts foods already have allergen data.'
              )
            : i18n.t(
                'hooks.useSyncAllergens.updatedOfFoodS',
                'Updated {{updated}} of {{total}} food(s).',
                { updated: result.updated, total: result.total }
              ),
      });
    } catch {
      toast({
        title: i18n.t('hooks.useSyncAllergens.syncFailed', 'Sync failed'),
        description: i18n.t(
          'hooks.useSyncAllergens.couldNotSyncAllergensPlease',
          'Could not sync allergens. Please try again.'
        ),
        variant: 'destructive',
      });
    } finally {
      setSyncingAllergens(false);
    }
  };

  return { handleSyncAllergens, syncingAllergens };
};
