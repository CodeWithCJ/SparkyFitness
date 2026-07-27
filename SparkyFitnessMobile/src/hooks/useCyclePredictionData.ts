import { useMemo } from 'react';
import {
  predictNextCycles,
  phaseForDay,
  daysBetween,
  isHormonalBc,
  type DerivedCycle,
  type CyclePrediction,
} from '@workspace/shared';
import { useCycleSettings } from './useCycleSettings';
import { useCycleHistory } from './useCycleHistory';
import { getTodayDate } from '../utils/dateUtils';

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

    const suppressFertility =
      isHormonalBc(settings.birth_control_method) ||
      settings.show_fertile_window === false ||
      settings.mode === 'postpartum' ||
      settings.mode === 'menopause';

    let phase = dayStats.phase;
    if (suppressFertility && (phase === 'fertile' || phase === 'ovulation')) {
      const halfCycle = Math.floor(avgCycleLength / 2);
      phase = dayNumber <= halfCycle ? 'follicular' : 'luteal';
    }

    const next = prediction.cycles[0];
    const toDay = (d: string | null | undefined): number | null =>
      !suppressFertility && d && lastCycle.start_date ? daysBetween(lastCycle.start_date, d) + 1 : null;

    const nextPeriodStart = next?.periodStart;
    const daysLate = nextPeriodStart && date > nextPeriodStart ? daysBetween(nextPeriodStart, date) : 0;

    return {
      day: dayNumber,
      phase,
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
