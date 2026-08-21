import type { WellnessPalette } from '../components/wellness/theme/wellnessTokens';
import type { TFunction } from 'i18next';

export type CyclePhaseKey = 'menstrual' | 'follicular' | 'fertile' | 'ovulation' | 'luteal' | 'unknown';

/**
 * Single source of truth for user-facing phase display labels across Dashboard & Hub.
 * Respects discreet mode to avoid revealing sensitive terms when enabled.
 */
export function getPhaseDisplayName(phase: string, discreetMode: boolean, t: TFunction): string {
  if (discreetMode) return t('cycle.phase.active', { defaultValue: 'Active Phase' });
  switch (phase) {
    case 'menstrual':
      return t('cycle.phase.period', { defaultValue: 'Period' });
    case 'follicular':
      return t('cycle.phase.follicular', { defaultValue: 'Follicular Phase' });
    case 'fertile':
      return t('cycle.phase.fertile', { defaultValue: 'Est. Fertile Window' });
    case 'ovulation':
      return t('cycle.phase.ovulation', { defaultValue: 'Est. Ovulation' });
    case 'luteal':
      return t('cycle.phase.luteal', { defaultValue: 'Luteal Phase' });
    default:
      return t('cycle.phase.activeCycle', { defaultValue: 'Cycle Active' });
  }
}

/**
 * Single source of truth for phase colors across CycleCard, CycleCalendarGrid, and CycleRing.
 */
export function getPhaseColor(phase: string, tokens: WellnessPalette): string {
  switch (phase) {
    case 'menstrual':
      return tokens.phaseMenstrual;
    case 'follicular':
    case 'fertile':
      return tokens.phaseFollicular;
    case 'ovulation':
      return tokens.phaseOvulation;
    case 'luteal':
      return tokens.phaseLuteal;
    default:
      return tokens.accent;
  }
}

/**
 * Ranges the cycle length settings accept, mirroring the bounds the server
 * enforces in `UpsertCycleSettingsBodySchema`. Anything outside them comes
 * back as a 400, so inputs must clamp before saving.
 */
export const CYCLE_SETTING_LIMITS = {
  cycleLength: { min: 15, max: 90 },
  periodLength: { min: 1, max: 15 },
  lutealLength: { min: 9, max: 18 },
} as const;

/** Pregnancy field ranges, mirroring the server's `pregnancySchemas` bounds. */
export const PREGNANCY_SETTING_LIMITS = {
  fetusCount: { min: 1, max: 4 },
} as const;

export { useCyclePredictionData, type CyclePredictionData } from '../hooks/useCyclePredictionData';
