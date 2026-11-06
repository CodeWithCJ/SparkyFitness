import type { TFunction } from 'i18next';
import type { GarminManualSyncResponse } from '@/api/Settings/externalProviderService';

interface GarminSyncWarning {
  title: string;
  description: string;
  variant?: 'destructive';
}

/** The translated name of a sync phase; an unknown phase keeps its server name. */
const phaseLabel = (phase: string, t: TFunction): string => {
  switch (phase) {
    case 'health':
      return t('integrations.garminSyncPhaseHealth', 'Health');
    case 'activities':
      return t('integrations.garminSyncPhaseActivities', 'Activities');
    case 'nutrition':
      return t('integrations.garminSyncPhaseNutrition', 'Nutrition');
    default:
      return phase;
  }
};

/**
 * The toast for a manual Garmin sync that did not finish, or null when every
 * phase did. The server still answers 200 for a partly failed sync.
 */
export const garminSyncWarning = (
  result: GarminManualSyncResponse,
  t: TFunction
): GarminSyncWarning | null => {
  if (result.serviceUnreachable) {
    return {
      title: t(
        'integrations.garminServiceUnreachableTitle',
        'Garmin unreachable'
      ),
      description: t(
        'integrations.garminServiceUnreachable',
        'The Garmin service is not reachable. Check that the Garmin microservice is running.'
      ),
      variant: 'destructive',
    };
  }
  if (result.failedPhases.length > 0) {
    return {
      title: t(
        'integrations.garminSyncIncompleteTitle',
        'Garmin sync incomplete'
      ),
      description: t('integrations.garminSyncIncomplete', {
        phases: result.failedPhases
          .map((phase) => phaseLabel(phase, t))
          .join(', '),
        defaultValue:
          'Some Garmin data could not be synced ({{phases}}). Try again later.',
      }),
    };
  }
  return null;
};
