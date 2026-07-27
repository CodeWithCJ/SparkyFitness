import type { WellnessPalette } from '../components/wellness/theme/wellnessTokens';

export type CyclePhaseKey = 'menstrual' | 'follicular' | 'fertile' | 'ovulation' | 'luteal' | 'unknown';

/**
 * Single source of truth for user-facing phase display labels across Dashboard & Hub.
 * Respects discreet mode to avoid revealing sensitive terms when enabled.
 */
export function getPhaseDisplayName(phase: string, discreetMode = false): string {
  if (discreetMode) return 'Active Phase';
  switch (phase) {
    case 'menstrual':
      return 'Period';
    case 'follicular':
      return 'Follicular Phase';
    case 'fertile':
      return 'Fertile Window';
    case 'ovulation':
      return 'Ovulation Day';
    case 'luteal':
      return 'Luteal Phase';
    default:
      return 'Cycle Active';
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

export { useCyclePredictionData, type CyclePredictionData } from '../hooks/useCyclePredictionData';
