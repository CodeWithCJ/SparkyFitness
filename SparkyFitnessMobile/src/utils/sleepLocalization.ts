import type { TFunction } from 'i18next';

import type { SleepStageLane } from '../types/sleep';

/**
 * Sleep stage names, keyed by lane.
 *
 * Built as a record of literal `t()` calls rather than `t(someVariable)` because the i18n
 * audit rejects dynamic keys — a computed key cannot be statically verified against the
 * catalogs, so a missing translation would only surface at runtime.
 */
export const localizeSleepStage = (
  t: TFunction,
  lane: SleepStageLane
): string => {
  const names: Record<SleepStageLane, string> = {
    awake: t('sleep.stage.awake', { defaultValue: 'Awake' }),
    rem: t('sleep.stage.rem', { defaultValue: 'REM' }),
    light: t('sleep.stage.light', { defaultValue: 'Light' }),
    deep: t('sleep.stage.deep', { defaultValue: 'Deep' }),
    other: t('sleep.stage.other', { defaultValue: 'Other' }),
  };
  return names[lane];
};
