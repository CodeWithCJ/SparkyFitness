import type { TFunction } from 'i18next';
import type {
  LoadSportGroup,
  PlannedItem,
  PlannedStatus,
} from '@workspace/shared';
import { formatLocalizedNumber } from '../localization';
import { programName } from '../components/recording/RunProgramCard';

export function sportLoadLabel(t: TFunction, sport: LoadSportGroup): string {
  switch (sport) {
    case 'running':
      return t('trainingCalendar.sport.running', { defaultValue: 'Running' });
    case 'cycling':
      return t('trainingCalendar.sport.cycling', { defaultValue: 'Cycling' });
    case 'walking':
      return t('trainingCalendar.sport.walking', { defaultValue: 'Walking' });
    case 'cardio':
      return t('trainingCalendar.sport.cardio', { defaultValue: 'Cardio' });
    case 'strength':
      return t('trainingCalendar.sport.strength', { defaultValue: 'Strength' });
    default:
      return t('trainingCalendar.sport.other', { defaultValue: 'Other' });
  }
}

export function plannedStatusLabel(
  t: TFunction,
  status: PlannedStatus
): string {
  switch (status) {
    case 'done':
      return t('trainingCalendar.status.done', { defaultValue: 'Done' });
    case 'partial':
      return t('trainingCalendar.status.partial', {
        defaultValue: 'Partly done',
      });
    case 'missed':
      return t('trainingCalendar.status.missed', { defaultValue: 'Missed' });
    default:
      return t('trainingCalendar.status.upcoming', {
        defaultValue: 'Upcoming',
      });
  }
}

/** A planned item's name: the program and workout number, or the plan's own name. */
export function plannedItemLabel(t: TFunction, item: PlannedItem): string {
  if (item.source === 'runProgram' && item.programId) {
    return t('trainingCalendar.programWorkout', {
      name: programName(t, item.programId),
      number: formatLocalizedNumber(item.workoutNumber ?? 1),
      defaultValue: '{{name}} · workout {{number}}',
    });
  }
  return (
    item.label ??
    t('trainingCalendar.workoutPlanFallback', { defaultValue: 'Workout plan' })
  );
}

/** What a screen reader says for a sport icon: the sport and the status. */
export function markA11yLabel(
  t: TFunction,
  sport: LoadSportGroup,
  status: PlannedStatus | 'extra'
): string {
  return t('trainingCalendar.markA11y', {
    sport: sportLoadLabel(t, sport),
    status:
      status === 'extra'
        ? t('trainingCalendar.extraA11y', {
            defaultValue: 'extra, not planned',
          })
        : plannedStatusLabel(t, status),
    defaultValue: '{{sport}}, {{status}}',
  });
}
