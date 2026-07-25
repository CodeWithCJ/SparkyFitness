import { useMemo } from 'react';
import { predictNextCycles, phaseForDay, daysBetween, type DerivedCycle, type CyclePrediction } from '@workspace/shared';
import { useCycleSettings } from '../hooks/useCycleSettings';
import { useCycleHistory } from '../hooks/useCycleHistory';
import { getTodayDate } from './dateUtils';
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
      return tokens.phaseFollicular;
    case 'fertile':
    case 'ovulation':
      return tokens.phaseOvulation;
    case 'luteal':
      return tokens.phaseLuteal;
    default:
      return tokens.accent;
  }
}

export interface CyclePredictionData {
  day: number;
  phase: string;
  avgCycleLength: number;
  avgPeriodLength: number;
  fertileStartDay: number | null;
  fertileEndDay: number | null;
  ovulationDay: number | null;
  nextPeriodStart?: string;
  daysLate: number;
  prediction: CyclePrediction;
}

/**
 * Shared hook providing derived cycle statistics and next-cycle predictions
 * for both Dashboard (CycleCard) and Hub (CycleHubScreen) to prevent code drift.
 */
export function useCyclePredictionData(dateString?: string): CyclePredictionData | null {
  const { settings } = useCycleSettings();
  const { cycles } = useCycleHistory();
  const date = dateString ?? getTodayDate();

  return useMemo(() => {
    if (!settings || settings.mode === 'pregnant' || cycles.length === 0) return null;

    const completed = cycles.filter((c) => c.cycle_length && c.period_length);
    const cycleLengths = completed.map((c) => c.cycle_length!);
    const periodLengths = completed.map((c) => c.period_length!);

    const avgCycleLength =
      settings.avg_cycle_length_override ??
      (cycleLengths.length
        ? Math.round(cycleLengths.reduce((a, b) => a + b, 0) / cycleLengths.length)
        : 28);
    const avgPeriodLength =
      settings.avg_period_length_override ??
      (periodLengths.length
        ? Math.round(periodLengths.reduce((a, b) => a + b, 0) / periodLengths.length)
        : 5);

    const stats = {
      avgCycleLength,
      avgPeriodLength,
      regularity: 'regular' as const,
      sampleSize: cycleLengths.length,
      medianCycleLength: 28,
      cycleLengthSd: 0,
    };

    const lastCycle = cycles[0];
    if (!lastCycle || !lastCycle.start_date) return null;

    const prediction = predictNextCycles(stats, lastCycle.start_date, settings);
    const dayStats = phaseForDay(date, cycles as DerivedCycle[], prediction);
    const dayNumber = dayStats.cycleDay ?? 0;

    const next = prediction.cycles[0];
    const toDay = (d: string | null | undefined): number | null =>
      d && lastCycle.start_date ? daysBetween(lastCycle.start_date, d) + 1 : null;

    const nextPeriodStart = next?.periodStart;
    const daysLate = nextPeriodStart && date > nextPeriodStart ? daysBetween(nextPeriodStart, date) : 0;

    return {
      day: dayNumber,
      phase: dayStats.phase,
      avgCycleLength,
      avgPeriodLength,
      fertileStartDay: toDay(next?.fertileStart),
      fertileEndDay: toDay(next?.fertileEnd),
      ovulationDay: toDay(next?.ovulation),
      nextPeriodStart,
      daysLate,
      prediction,
    };
  }, [settings, cycles, date]);
}
