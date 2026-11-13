import type { TFunction } from 'i18next';
import type {
  HeartRateDisplayBand,
  HeartRateTier,
  HrZoneMethod,
  MaxHrSource,
  StoredZoneMethod,
} from '@workspace/shared';

/** Short name of how a set of zones is worked out. */
export function methodName(t: TFunction, method: HrZoneMethod): string {
  switch (method) {
    case 'heart_rate_reserve':
      return t('heartRateZones.method.heartRateReserve', {
        defaultValue: 'Heart rate reserve',
      });
    case 'custom':
      return t('heartRateZones.method.custom', {
        defaultValue: 'Custom zones',
      });
    default:
      return t('heartRateZones.method.percentMax', {
        defaultValue: '% of max heart rate',
      });
  }
}

/**
 * The line a zone chart shows under its title, saying which zone method the
 * stored time in zone was worked out with. Null when it is not known (a
 * workout stored before methods were recorded).
 */
export function zoneMethodLabel(
  t: TFunction,
  method: StoredZoneMethod | 'mixed' | null
): string | null {
  if (method === null) return null;
  if (method === 'device') {
    return t('heartRateZones.chart.device', {
      defaultValue: 'Zones set by your watch or device',
    });
  }
  if (method === 'mixed') {
    return t('heartRateZones.chart.mixed', {
      defaultValue:
        'Zones were worked out with more than one method. Changing your zone settings does not change past workouts.',
    });
  }
  return t('heartRateZones.chart.method', {
    method: methodName(t, method),
    defaultValue:
      'Zones: {{method}}. Changing your zone settings does not change past workouts.',
  });
}

/** Where the max heart rate in use came from, in words. */
export function maxHrSourceLabel(t: TFunction, source: MaxHrSource): string {
  switch (source) {
    case 'user':
      return t('heartRateZones.source.user', { defaultValue: 'You set it' });
    case 'age':
      return t('heartRateZones.source.age', {
        defaultValue: 'From your date of birth',
      });
    case 'observed':
      return t('heartRateZones.source.observed', {
        defaultValue: 'From the highest heart rate in the workout',
      });
    default:
      return t('heartRateZones.source.fallback', {
        defaultValue: 'A typical value; add your date of birth or set your own',
      });
  }
}

function tierName(t: TFunction, tier: HeartRateTier): string {
  switch (tier) {
    case 'light':
      return t('heartRateZones.tier.light', { defaultValue: 'Light' });
    case 'moderate':
      return t('heartRateZones.tier.moderate', { defaultValue: 'Moderate' });
    case 'vigorous':
      return t('heartRateZones.tier.vigorous', { defaultValue: 'Vigorous' });
    default:
      return t('heartRateZones.tier.peak', { defaultValue: 'Peak' });
  }
}

/** "Zone 3", or the tier name ("Light") when four tiers are shown. */
export function displayBandLabel(
  t: TFunction,
  band: Pick<HeartRateDisplayBand, 'index' | 'tier'>
): string {
  return band.tier
    ? tierName(t, band.tier)
    : t('exerciseStatistics.cardio.zone', {
        defaultValue: 'Zone {{zone}}',
        zone: band.index,
      });
}
