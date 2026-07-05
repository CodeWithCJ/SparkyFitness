import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useAddCategoryMutation } from '@/hooks/Settings/useCustomCategories';
import type { FertilityDetails } from '@/hooks/useCycle';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Thermometer, TriangleAlert } from 'lucide-react';

interface BbtStatusCardProps {
  bbtStatus: FertilityDetails['bbtStatus'];
}

// Must match exactly what the mobile Health Connect sync creates, so a
// self-hosted user's synced BBT lands in the same category the engine reads.
const BBT_CATEGORY = {
  name: 'basal_body_temperature',
  display_name: 'Basal Body Temperature',
  measurement_type: 'celsius',
  frequency: 'Daily',
  data_type: 'numeric',
} as const;

/**
 * Surfaces the state of the basal_body_temperature custom measurement in the
 * cycle tab: offers one-click setup when missing, warns when stale. BBT confirms
 * ovulation; calendar/OPK predictions keep working regardless.
 */
export default function BbtStatusCard({ bbtStatus }: BbtStatusCardProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const addCategory = useAddCategoryMutation();

  const handleCreate = async () => {
    await addCategory.mutateAsync(BBT_CATEGORY);
    queryClient.invalidateQueries({ queryKey: ['cycle-fertility'] });
    queryClient.invalidateQueries({ queryKey: ['cycle-overview'] });
    queryClient.invalidateQueries({ queryKey: ['cycle-insights'] });
  };

  if (!bbtStatus.categoryExists) {
    return (
      <Card className="border-amber-300 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20">
        <CardContent className="flex items-start gap-3 py-3.5">
          <Thermometer className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="flex-1 space-y-2">
            <p className="text-sm">
              {t(
                'cycle.bbt.missing',
                'Track your basal body temperature to confirm ovulation. It lives in Check-in and can sync from your phone.'
              )}
            </p>
            <Button
              size="sm"
              variant="outline"
              disabled={addCategory.isPending}
              onClick={handleCreate}
            >
              {addCategory.isPending
                ? t('cycle.bbt.creating', 'Setting up…')
                : t('cycle.bbt.create', 'Create & track in Check-in')}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (bbtStatus.isStale) {
    return (
      <Card className="border-amber-300 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20">
        <CardContent className="flex items-start gap-3 py-3.5">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="flex-1 text-sm">
            {t(
              'cycle.bbt.stale',
              'Your last BBT reading was {{n}} days ago. Temperature confirmation is paused until you log a fresh reading — calendar and OPK predictions still work.',
              { n: bbtStatus.staleDays ?? 0 }
            )}
          </p>
        </CardContent>
      </Card>
    );
  }

  return null;
}
