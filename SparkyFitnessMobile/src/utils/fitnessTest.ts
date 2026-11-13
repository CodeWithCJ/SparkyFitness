import type { TFunction } from 'i18next';
import {
  COOPER_SECONDS,
  evaluateFitnessTest,
  FIVE_K_METERS,
  THIRTY_MINUTE_SECONDS,
  THIRTY_MINUTE_SPLIT_SECONDS,
  type FitnessTestMeasurement,
  type FitnessTestResponse,
  type FitnessTestSurface,
  type FitnessTestType,
} from '@workspace/shared';
import { formatLocalizedNumber } from '../localization';
import {
  cumulativeActiveSeconds,
  cumulativeDistances,
  formatClock,
  METERS_PER_MILE,
  type RecordedPoint,
} from './gpsRecording';

/**
 * Turns a GPS recording into the measurement a fitness test needs: the time
 * to 5 km, the distance in 12 minutes, or the distance at 10 and 30 minutes.
 * Time is the recording's active time (pauses removed), and the figure is
 * read at the test's own mark whatever the person did afterwards, so jogging
 * on after the finish does not change the result.
 */

/** Distance covered after `seconds` of active time, or null if the recording is shorter. */
export function distanceAtActiveSeconds(
  points: readonly RecordedPoint[],
  seconds: number
): number | null {
  if (points.length === 0 || !(seconds >= 0)) return null;
  const active = cumulativeActiveSeconds(points);
  const distance = cumulativeDistances(points);
  if (seconds === 0) return 0;
  for (let i = 1; i < points.length; i++) {
    if (active[i] < seconds) continue;
    const span = active[i] - active[i - 1];
    const share = span > 0 ? (seconds - active[i - 1]) / span : 0;
    return distance[i - 1] + share * (distance[i] - distance[i - 1]);
  }
  return null;
}

/** Active seconds taken to cover `meters`, or null if the recording is shorter. */
export function activeSecondsAtDistance(
  points: readonly RecordedPoint[],
  meters: number
): number | null {
  if (points.length === 0 || !(meters >= 0)) return null;
  const active = cumulativeActiveSeconds(points);
  const distance = cumulativeDistances(points);
  if (meters === 0) return 0;
  for (let i = 1; i < points.length; i++) {
    if (distance[i] < meters) continue;
    const span = distance[i] - distance[i - 1];
    const share = span > 0 ? (meters - distance[i - 1]) / span : 0;
    return active[i - 1] + share * (active[i] - active[i - 1]);
  }
  return null;
}

/** The test's measurement from the recording, or null when the test was not completed. */
export function measureFitnessTest(
  type: FitnessTestType,
  points: readonly RecordedPoint[]
): FitnessTestMeasurement | null {
  if (type === '5k') {
    const seconds = activeSecondsAtDistance(points, FIVE_K_METERS);
    if (seconds === null) return null;
    return {
      type,
      distanceMeters: FIVE_K_METERS,
      durationSeconds: Math.round(seconds),
    };
  }
  if (type === 'cooper') {
    const meters = distanceAtActiveSeconds(points, COOPER_SECONDS);
    if (meters === null) return null;
    return {
      type,
      distanceMeters: Math.round(meters),
      durationSeconds: COOPER_SECONDS,
    };
  }
  const total = distanceAtActiveSeconds(points, THIRTY_MINUTE_SECONDS);
  const split = distanceAtActiveSeconds(points, THIRTY_MINUTE_SPLIT_SECONDS);
  if (total === null || split === null) return null;
  return {
    type,
    distanceMeters: Math.round(total),
    splitDistanceMeters: Math.round(split),
    durationSeconds: THIRTY_MINUTE_SECONDS,
  };
}

export interface FitnessTestProgress {
  /** The test's mark has been reached: stop. */
  complete: boolean;
  /** 0 to 1. */
  fraction: number;
  /** Time left, for the two timed tests. */
  remainingSeconds: number | null;
  /** Distance left, for the 5K. */
  remainingMeters: number | null;
  /** 30-minute run only: the first 10 minutes have passed, so the last 20 count. */
  inThresholdPhase: boolean;
}

/** Where a live test stands, from the recording's active time and distance. */
export function fitnessTestProgress(
  type: FitnessTestType,
  activeSeconds: number,
  distanceMeters: number
): FitnessTestProgress {
  if (type === '5k') {
    const left = Math.max(0, FIVE_K_METERS - distanceMeters);
    return {
      complete: left === 0,
      fraction: Math.min(1, distanceMeters / FIVE_K_METERS),
      remainingSeconds: null,
      remainingMeters: left,
      inThresholdPhase: false,
    };
  }
  const total = type === 'cooper' ? COOPER_SECONDS : THIRTY_MINUTE_SECONDS;
  const left = Math.max(0, total - activeSeconds);
  return {
    complete: left === 0,
    fraction: Math.min(1, activeSeconds / total),
    remainingSeconds: left,
    remainingMeters: null,
    inThresholdPhase:
      type === '30min' && activeSeconds >= THIRTY_MINUTE_SPLIT_SECONDS,
  };
}

export function fitnessTestName(t: TFunction, type: FitnessTestType): string {
  switch (type) {
    case '5k':
      return t('fitnessTest.type.5k', { defaultValue: '5K time trial' });
    case '30min':
      return t('fitnessTest.type.30min', {
        defaultValue: '30-minute all-out run',
      });
    default:
      return t('fitnessTest.type.cooper', {
        defaultValue: '12-minute Cooper test',
      });
  }
}

/** Seconds per km shown per kilometre or per mile. */
export function paceInUnit(secondsPerKm: number, unit: 'km' | 'miles'): number {
  return unit === 'miles'
    ? (secondsPerKm * METERS_PER_MILE) / 1000
    : secondsPerKm;
}

/** "km" or "mi", for a pace per unit. */
function perUnitLabel(t: TFunction, unit: 'km' | 'miles'): string {
  return unit === 'miles'
    ? t('fitnessTest.perMile', { defaultValue: 'mi' })
    : t('fitnessTest.perKm', { defaultValue: 'km' });
}

/** "4:50/km" or "7:46/mi". */
export function paceText(
  t: TFunction,
  secondsPerKm: number,
  unit: 'km' | 'miles'
): string {
  const unitLabel = perUnitLabel(t, unit);
  return t('fitnessTest.pacePerUnit', {
    pace: formatClock(paceInUnit(secondsPerKm, unit)),
    unit: unitLabel,
    defaultValue: '{{pace}}/{{unit}}',
  });
}

/** "Min–max/km" for a zone. */
export function paceRangeText(
  t: TFunction,
  minSecondsPerKm: number,
  maxSecondsPerKm: number,
  unit: 'km' | 'miles'
): string {
  const unitLabel = perUnitLabel(t, unit);
  return t('fitnessTest.paceRange', {
    fast: formatClock(paceInUnit(minSecondsPerKm, unit)),
    slow: formatClock(paceInUnit(maxSecondsPerKm, unit)),
    unit: unitLabel,
    defaultValue: '{{fast}}–{{slow}}/{{unit}}',
  });
}

/** The headline result in words: "5K in 25:00", "3,000 m in 12 minutes" or "4:21/km over the last 20 minutes". */
export function fitnessTestResultText(
  t: TFunction,
  test: Pick<FitnessTestResponse, 'test_type' | 'result_value'>,
  unit: 'km' | 'miles'
): string {
  if (test.test_type === '5k') {
    return t('fitnessTest.result.5k', {
      time: formatClock(test.result_value),
      defaultValue: '5K in {{time}}',
    });
  }
  if (test.test_type === 'cooper') {
    return unit === 'miles'
      ? t('fitnessTest.result.cooperMiles', {
          distance: formatLocalizedNumber(test.result_value / METERS_PER_MILE, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }),
          defaultValue: '{{distance}} mi in 12 minutes',
        })
      : t('fitnessTest.result.cooperMeters', {
          distance: formatLocalizedNumber(Math.round(test.result_value)),
          defaultValue: '{{distance}} m in 12 minutes',
        });
  }
  return t('fitnessTest.result.30min', {
    pace: paceText(t, test.result_value, unit),
    defaultValue: '{{pace}} over the last 20 minutes',
  });
}

/** "12 s/km faster", "5 s/mi slower" or "no change", for a change in seconds per km. */
export function paceChangeText(
  t: TFunction,
  changeSecondsPerKm: number,
  unit: 'km' | 'miles'
): string {
  const seconds = Math.round(Math.abs(paceInUnit(changeSecondsPerKm, unit)));
  if (seconds === 0) {
    return t('fitnessTest.change.same', { defaultValue: 'no change' });
  }
  const perUnit = perUnitLabel(t, unit);
  return changeSecondsPerKm < 0
    ? t('fitnessTest.change.faster', {
        seconds: formatLocalizedNumber(seconds),
        unit: perUnit,
        defaultValue: '{{seconds}} s/{{unit}} faster',
      })
    : t('fitnessTest.change.slower', {
        seconds: formatLocalizedNumber(seconds),
        unit: perUnit,
        defaultValue: '{{seconds}} s/{{unit}} slower',
      });
}

/** "24:30" or "1:02:03" as seconds, or null when it is not a time. */
export function parseClockText(text: string): number | null {
  const parts = text.trim().split(':');
  if (parts.length < 2 || parts.length > 3) return null;
  if (!parts.every((part) => /^\d{1,2}$/.test(part))) return null;
  const numbers = parts.map(Number);
  const seconds = numbers.at(-1)!;
  const minutes = numbers.at(-2)!;
  if (seconds > 59 || (parts.length === 3 && minutes > 59)) return null;
  const hours = parts.length === 3 ? numbers[0] : 0;
  const total = hours * 3600 + minutes * 60 + seconds;
  return total > 0 ? total : null;
}

/** What a treadmill test needs from the person after Finish. */
export interface IndoorTestInputs {
  /** Time on the clock with pauses removed, seconds. */
  activeSeconds: number;
  /** The distance the treadmill shows, metres; null when not entered. */
  distanceMeters: number | null;
  /** 5K: the time at 5 km as typed, seconds; null to use the clock. */
  timeSeconds: number | null;
  /** 30-minute run: the distance at 10:00 as typed, metres; null to assume a steady pace. */
  splitMeters: number | null;
  /** Treadmill incline, percent; null for none. */
  inclinePercent: number | null;
  /** Correct the result for the incline. */
  adjustForIncline: boolean;
}

export type IndoorTestMeasurement =
  | { ok: true; measurement: FitnessTestMeasurement }
  | { ok: false; reason: 'tooShort' | 'noDistance' | 'badSplit' | 'badTime' };

/**
 * A treadmill test's measurement from what the clock and the person gave:
 * the 12-minute and 30-minute tests end on the clock and need the distance on
 * the display; the 5K needs its time, which is the clock unless the person
 * typed another. A 30-minute run with no distance at 10:00 assumes a steady
 * pace (a third of the total there).
 */
export function measureIndoorTest(
  type: FitnessTestType,
  input: IndoorTestInputs
): IndoorTestMeasurement {
  const extras = {
    inclinePercent: input.inclinePercent,
    adjustForIncline: input.adjustForIncline,
  };
  if (type === '5k') {
    const seconds = input.timeSeconds ?? Math.round(input.activeSeconds);
    if (!(seconds > 0)) return { ok: false, reason: 'badTime' };
    return {
      ok: true,
      measurement: {
        type,
        distanceMeters: FIVE_K_METERS,
        durationSeconds: seconds,
        ...extras,
      },
    };
  }
  const total = type === 'cooper' ? COOPER_SECONDS : THIRTY_MINUTE_SECONDS;
  if (input.activeSeconds < total) return { ok: false, reason: 'tooShort' };
  const distance = input.distanceMeters;
  if (distance === null || !(distance > 0)) {
    return { ok: false, reason: 'noDistance' };
  }
  if (type === 'cooper') {
    return {
      ok: true,
      measurement: {
        type,
        distanceMeters: Math.round(distance),
        durationSeconds: COOPER_SECONDS,
        ...extras,
      },
    };
  }
  const split = input.splitMeters ?? distance / 3;
  if (!(split > 0) || split >= distance) {
    return { ok: false, reason: 'badSplit' };
  }
  return {
    ok: true,
    measurement: {
      type,
      distanceMeters: Math.round(distance),
      splitDistanceMeters: Math.round(split),
      durationSeconds: THIRTY_MINUTE_SECONDS,
      ...extras,
    },
  };
}

/** "Outdoor" or "Treadmill". */
export function fitnessTestSurfaceName(
  t: TFunction,
  surface: FitnessTestSurface
): string {
  return surface === 'indoor'
    ? t('fitnessTest.surface.indoor', { defaultValue: 'Treadmill' })
    : t('fitnessTest.surface.outdoor', { defaultValue: 'Outdoor' });
}

/** "Treadmill, 3% incline, adjusted" for a treadmill test; "Outdoor" for a GPS one. */
export function fitnessTestSurfaceText(
  t: TFunction,
  test: Pick<
    FitnessTestResponse,
    'surface' | 'incline_percent' | 'incline_adjusted'
  >
): string {
  if (test.surface !== 'indoor') return fitnessTestSurfaceName(t, 'outdoor');
  if (test.incline_percent === null) {
    return fitnessTestSurfaceName(t, 'indoor');
  }
  const incline = formatLocalizedNumber(test.incline_percent, {
    maximumFractionDigits: 1,
  });
  return test.incline_adjusted
    ? t('fitnessTest.surface.inclineAdjusted', {
        incline,
        defaultValue: 'Treadmill, {{incline}}% incline, adjusted',
      })
    : t('fitnessTest.surface.inclineNotAdjusted', {
        incline,
        defaultValue: 'Treadmill, {{incline}}% incline, not adjusted',
      });
}

/**
 * For a test corrected for its incline: what was measured and what it counted
 * as, e.g. "3,000 m in 12 minutes" and "3,258 m in 12 minutes". Null when no
 * correction was applied or it changed nothing.
 */
export function inclineAdjustmentText(
  t: TFunction,
  test: FitnessTestResponse,
  unit: 'km' | 'miles'
): { raw: string; adjusted: string } | null {
  if (!test.incline_adjusted || test.incline_percent === null) return null;
  const raw = evaluateFitnessTest({
    type: test.test_type,
    distanceMeters: test.distance_meters,
    durationSeconds: test.duration_seconds,
    splitDistanceMeters: test.split_distance_meters,
  });
  if (!raw || raw.resultValue === test.result_value) return null;
  return {
    raw: fitnessTestResultText(
      t,
      { ...test, result_value: raw.resultValue },
      unit
    ),
    adjusted: fitnessTestResultText(t, test, unit),
  };
}
