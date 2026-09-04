import { AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import type {
  OpenFoodFactsAdminSyncStatusResponse,
  OpenFoodFactsAutomaticSyncResponse,
} from '@workspace/shared';

type SyncFailure =
  | OpenFoodFactsAutomaticSyncResponse['recentFailures'][number]
  | OpenFoodFactsAdminSyncStatusResponse['recentFailures'][number];

interface OpenFoodFactsContributionStatusProps {
  status:
    | OpenFoodFactsAutomaticSyncResponse['status']
    | OpenFoodFactsAdminSyncStatusResponse['status'];
  recentFailures: SyncFailure[];
  showUserId?: boolean;
}

const hasUserId = (
  failure: SyncFailure
): failure is OpenFoodFactsAdminSyncStatusResponse['recentFailures'][number] =>
  'userId' in failure;

export const OpenFoodFactsContributionStatus = ({
  status,
  recentFailures,
  showUserId = false,
}: OpenFoodFactsContributionStatusProps) => {
  const { t } = useTranslation();
  const counts = [
    {
      label: t(
        'settings.foodExerciseDataProviders.openFoodFacts.pending',
        'Pending'
      ),
      value: status.pending,
    },
    {
      label: t(
        'settings.foodExerciseDataProviders.openFoodFacts.processing',
        'Processing'
      ),
      value: status.processing,
    },
    {
      label: t(
        'settings.foodExerciseDataProviders.openFoodFacts.failed',
        'Failed'
      ),
      value: status.failed,
      destructive: status.failed > 0,
    },
    {
      label: t(
        'settings.foodExerciseDataProviders.openFoodFacts.succeeded',
        'Published (succeeded)'
      ),
      value: status.succeeded,
    },
  ];

  return (
    <div
      className="space-y-3"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={t(
        'settings.foodExerciseDataProviders.openFoodFacts.statusSummary',
        'Open Food Facts upload status'
      )}
    >
      <div className="flex flex-wrap gap-2">
        {counts.map(({ label, value, destructive }) => (
          <Badge
            key={label}
            variant={destructive ? 'destructive' : 'secondary'}
          >
            {label} {value}
          </Badge>
        ))}
      </div>

      {recentFailures.length > 0 && (
        <div className="space-y-2">
          <h4 className="flex items-center gap-2 text-sm font-medium">
            <AlertCircle className="h-4 w-4 text-destructive" aria-hidden />
            {t(
              'settings.foodExerciseDataProviders.openFoodFacts.recentFailures',
              'Recent upload errors'
            )}
          </h4>
          <ul className="space-y-2">
            {recentFailures.map((failure) => (
              <li
                key={`${failure.foodId}-${failure.updatedAt}`}
                className="rounded-md border border-destructive/30 p-3 text-sm"
              >
                <div className="font-medium">
                  {failure.foodName || failure.foodId}
                </div>
                <div className="text-muted-foreground">
                  {failure.error ||
                    t(
                      'settings.foodExerciseDataProviders.openFoodFacts.unknownError',
                      'Unknown upload error'
                    )}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {failure.attemptCount}{' '}
                  {t(
                    'settings.foodExerciseDataProviders.openFoodFacts.attempts',
                    'attempts'
                  )}
                  {showUserId && hasUserId(failure) && (
                    <>
                      {' · '}
                      {t(
                        'settings.foodExerciseDataProviders.openFoodFacts.userId',
                        'User'
                      )}{' '}
                      {failure.userId}
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
