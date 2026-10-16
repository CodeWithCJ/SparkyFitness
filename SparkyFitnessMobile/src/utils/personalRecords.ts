import type { TFunction } from 'i18next';
import type {
  ExercisePersonalRecordItem,
  PrSportGroup,
} from '@workspace/shared';

/** The order the sport groups are listed in. */
const GROUP_ORDER: readonly PrSportGroup[] = [
  'run',
  'walk',
  'ride',
  'swim',
  'other',
];

export interface PersonalRecordGroup {
  group: PrSportGroup;
  items: ExercisePersonalRecordItem[];
}

/**
 * Cardio records grouped by sport, in a fixed order, shortest distance first.
 * Records are only comparable within a sport group, so they are never mixed.
 * An older server sends no group; those go under "other".
 */
export function groupPersonalRecords(
  items: readonly ExercisePersonalRecordItem[]
): PersonalRecordGroup[] {
  const byGroup = new Map<PrSportGroup, ExercisePersonalRecordItem[]>();
  for (const item of items) {
    const group = item.sportGroup ?? 'other';
    byGroup.set(group, [...(byGroup.get(group) ?? []), item]);
  }
  return GROUP_ORDER.flatMap((group) => {
    const list = byGroup.get(group);
    return list ? [{ group, items: list }] : [];
  });
}

/** The records a given activity currently holds (a just-saved run's bests). */
export function recordsHeldBy(
  items: readonly ExercisePersonalRecordItem[],
  activityId: string
): ExercisePersonalRecordItem[] {
  return items.filter((item) => item.activityId === activityId);
}

export function sportGroupLabel(t: TFunction, group: PrSportGroup): string {
  switch (group) {
    case 'run':
      return t('personalRecords.group.run', { defaultValue: 'Running' });
    case 'walk':
      return t('personalRecords.group.walk', { defaultValue: 'Walking' });
    case 'ride':
      return t('personalRecords.group.ride', { defaultValue: 'Cycling' });
    case 'swim':
      return t('personalRecords.group.swim', { defaultValue: 'Swimming' });
    default:
      return t('personalRecords.group.other', { defaultValue: 'Other' });
  }
}

/** "5 km", "Half marathon"... in the app language; custom ones keep the server's label. */
export function distanceStandardLabel(
  t: TFunction,
  item: Pick<ExercisePersonalRecordItem, 'distanceStandard' | 'label'>
): string {
  switch (item.distanceStandard) {
    case '1k':
      return t('personalRecords.standard.1k', { defaultValue: '1 km' });
    case '1mi':
      return t('personalRecords.standard.1mi', { defaultValue: '1 mile' });
    case '5k':
      return t('personalRecords.standard.5k', { defaultValue: '5 km' });
    case '10k':
      return t('personalRecords.standard.10k', { defaultValue: '10 km' });
    case '15k':
      return t('personalRecords.standard.15k', { defaultValue: '15 km' });
    case 'half_marathon':
      return t('personalRecords.standard.halfMarathon', {
        defaultValue: 'Half marathon',
      });
    case 'marathon':
      return t('personalRecords.standard.marathon', {
        defaultValue: 'Marathon',
      });
    default:
      return item.label;
  }
}
