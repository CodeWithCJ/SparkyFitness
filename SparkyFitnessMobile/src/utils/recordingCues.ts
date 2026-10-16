import type { TFunction } from 'i18next';
import { formatClock, METERS_PER_KM, METERS_PER_MILE } from './gpsRecording';
import { formatLocalizedNumber } from '../localization';
import {
  STEP_METERS_PER_MILE,
  type HeartRateAlertKind,
  type IntervalStep,
  type IntervalStyle,
  type PaceAlertKind,
  type StepDistanceUnit,
} from '@workspace/shared';

/** Miles to two decimals at most: 0.25, 0.5, 1, 1.5. */
const stepMiles = (meters: number): number =>
  Math.round((meters / STEP_METERS_PER_MILE) * 100) / 100;

/**
 * The words spoken during a GPS recording. Pure and given `t`, so it runs under
 * Jest and follows the app language. Durations are spelled out ("5 minutes 24
 * seconds") because a speech engine reads "5:24" as a time of day.
 */

export type CueUnit = 'km' | 'miles';

export type CueEvent = 'started' | 'paused' | 'autoPaused' | 'resumed';

export const cueUnitMeters = (unit: CueUnit): number =>
  unit === 'miles' ? METERS_PER_MILE : METERS_PER_KM;

/** "1 hour 5 minutes 3 seconds", leaving out the parts that are zero. */
export function spokenDuration(t: TFunction, totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const parts: string[] = [];
  if (hours > 0) {
    parts.push(
      t('recordActivity.cues.hours', {
        count: hours,
        defaultValue: '{{count}} hours',
        defaultValue_one: '{{count}} hour',
        defaultValue_other: '{{count}} hours',
      })
    );
  }
  if (minutes > 0) {
    parts.push(
      t('recordActivity.cues.minutes', {
        count: minutes,
        defaultValue: '{{count}} minutes',
        defaultValue_one: '{{count}} minute',
        defaultValue_other: '{{count}} minutes',
      })
    );
  }
  if (rest > 0 || parts.length === 0) {
    parts.push(
      t('recordActivity.cues.seconds', {
        count: rest,
        defaultValue: '{{count}} seconds',
        defaultValue_one: '{{count}} second',
        defaultValue_other: '{{count}} seconds',
      })
    );
  }
  return parts.join(' ');
}

/** "3 kilometers" or "2.5 miles". */
export function spokenDistance(
  t: TFunction,
  count: number,
  unit: CueUnit
): string {
  return unit === 'miles'
    ? t('recordActivity.cues.miles', {
        count,
        defaultValue: '{{count}} miles',
        defaultValue_one: '{{count}} mile',
        defaultValue_other: '{{count}} miles',
      })
    : t('recordActivity.cues.kilometers', {
        count,
        defaultValue: '{{count}} kilometers',
        defaultValue_one: '{{count}} kilometer',
        defaultValue_other: '{{count}} kilometers',
      });
}

/**
 * An interval step's distance, said aloud in the unit it was set in:
 * "400 meters", "1.5 kilometers" from a kilometer up, or "0.25 miles".
 */
export function spokenStepDistance(
  t: TFunction,
  meters: number,
  unit?: StepDistanceUnit
): string {
  if (unit === 'mi') return spokenDistance(t, stepMiles(meters), 'miles');
  if (meters >= 1000) {
    return spokenDistance(t, Math.round(meters / 100) / 10, 'km');
  }
  return t('recordActivity.cues.meters', {
    count: Math.round(meters),
    defaultValue: '{{count}} meters',
    defaultValue_one: '{{count}} meter',
    defaultValue_other: '{{count}} meters',
  });
}

/**
 * Said when a full kilometer or mile is done: how far, the time on the clock,
 * and how long that last kilometer or mile took.
 */
export function splitCue(
  t: TFunction,
  options: {
    /** Whole units completed so far. */
    completed: number;
    /** Active seconds at the end of this split. */
    totalSeconds: number;
    /** How long this one split took, which is its pace. */
    splitSeconds: number;
    /** How long the split before took; adds a faster or slower note when it differs enough. */
    previousSplitSeconds?: number;
    unit: CueUnit;
  }
): string {
  const time = spokenDuration(t, options.totalSeconds);
  const distance = spokenDistance(t, options.completed, options.unit);
  const split = spokenDuration(t, options.splitSeconds);
  const base =
    options.unit === 'miles'
      ? t('recordActivity.cues.splitMiles', {
          distance,
          time,
          split,
          defaultValue: '{{distance}}. Time {{time}}. Last mile {{split}}.',
        })
      : t('recordActivity.cues.splitKm', {
          distance,
          time,
          split,
          defaultValue:
            '{{distance}}. Time {{time}}. Last kilometer {{split}}.',
        });
  const trend = splitTrendNote(
    t,
    options.splitSeconds,
    options.previousSplitSeconds
  );
  return trend ? `${base} ${trend}` : base;
}

/** Splits closer than this are not worth a remark. */
export const SPLIT_TREND_MIN_SECONDS = 5;

/** "12 seconds faster than the one before.", or null when about the same. */
export function splitTrendNote(
  t: TFunction,
  splitSeconds: number,
  previousSplitSeconds: number | undefined
): string | null {
  if (previousSplitSeconds === undefined) return null;
  const diff = Math.round(previousSplitSeconds - splitSeconds);
  if (Math.abs(diff) < SPLIT_TREND_MIN_SECONDS) return null;
  const amount = spokenDuration(t, Math.abs(diff));
  return diff > 0
    ? t('recordActivity.cues.splitFaster', {
        amount,
        defaultValue: '{{amount}} faster than the one before.',
      })
    : t('recordActivity.cues.splitSlower', {
        amount,
        defaultValue: '{{amount}} slower than the one before.',
      });
}

/** Said when the Lap button is pressed: the lap number, how far and how long. */
export function lapCue(
  t: TFunction,
  options: {
    number: number;
    distanceMeters: number;
    seconds: number;
    unit: CueUnit;
  }
): string {
  return t('recordActivity.cues.lap', {
    number: options.number,
    distance: spokenDistance(
      t,
      Math.round((options.distanceMeters / cueUnitMeters(options.unit)) * 100) /
        100,
      options.unit
    ),
    time: spokenDuration(t, options.seconds),
    defaultValue: 'Lap {{number}}. {{distance}}. {{time}}.',
  });
}

export function eventCue(t: TFunction, event: CueEvent): string {
  switch (event) {
    case 'started':
      return t('recordActivity.cues.started', {
        defaultValue: 'Recording started',
      });
    case 'paused':
      return t('recordActivity.cues.paused', { defaultValue: 'Paused' });
    case 'autoPaused':
      return t('recordActivity.cues.autoPaused', {
        defaultValue: 'Auto paused',
      });
    case 'resumed':
      return t('recordActivity.cues.resumed', { defaultValue: 'Resumed' });
  }
}

/** Said on Finish: the distance, to one decimal, and the time. */
export function finishCue(
  t: TFunction,
  options: { distanceMeters: number; totalSeconds: number; unit: CueUnit }
): string {
  const distance = spokenDistance(
    t,
    Math.round((options.distanceMeters / cueUnitMeters(options.unit)) * 10) /
      10,
    options.unit
  );
  return t('recordActivity.cues.finished', {
    distance,
    time: spokenDuration(t, options.totalSeconds),
    defaultValue: 'Recording finished. {{distance}}. Time {{time}}.',
  });
}

/** The word for a step: "Run" and "Walk", or "Fast" and "Easy". */
export function intervalStepName(
  t: TFunction,
  kind: IntervalStep['kind'],
  style: IntervalStyle
): string {
  switch (kind) {
    case 'warmup':
      return t('recordActivity.intervals.warmup', { defaultValue: 'Warm up' });
    case 'cooldown':
      return t('recordActivity.intervals.cooldown', {
        defaultValue: 'Cool down',
      });
    case 'work':
      return style === 'runWalk'
        ? t('recordActivity.intervals.run', { defaultValue: 'Run' })
        : t('recordActivity.intervals.fast', { defaultValue: 'Fast' });
    case 'recovery':
      return style === 'runWalk'
        ? t('recordActivity.intervals.walk', { defaultValue: 'Walk' })
        : t('recordActivity.intervals.easy', { defaultValue: 'Easy' });
  }
}

/** Said when an interval step begins: what to do and for how long or how far. */
export function intervalCue(
  t: TFunction,
  options: { step: IntervalStep; style: IntervalStyle }
): string {
  const { step } = options;
  return t('recordActivity.cues.interval', {
    name: intervalStepName(t, step.kind, options.style),
    time:
      step.meters !== undefined && step.meters > 0
        ? spokenStepDistance(t, step.meters, step.unit)
        : spokenDuration(t, step.seconds),
    defaultValue: '{{name}}. {{time}}.',
  });
}

/**
 * An interval step's distance on screen, in the unit it was set in: "400 m",
 * "1.5 km" from a kilometer up, or "0.25 mi".
 */
export function stepDistanceText(
  t: TFunction,
  meters: number,
  unit?: StepDistanceUnit
): string {
  if (unit === 'mi') {
    return `${formatLocalizedNumber(stepMiles(meters), {
      maximumFractionDigits: 2,
    })} ${t('recordActivity.unitMi', { defaultValue: 'mi' })}`;
  }
  if (meters >= 1000) {
    return `${formatLocalizedNumber(Math.round(meters / 100) / 10, {
      maximumFractionDigits: 1,
    })} ${t('recordActivity.unitKm', { defaultValue: 'km' })}`;
  }
  return `${formatLocalizedNumber(Math.round(meters))} ${t(
    'recordActivity.unitM',
    { defaultValue: 'm' }
  )}`;
}

/** A step's length as shown: its distance, or its time as m:ss. */
export function stepLengthText(t: TFunction, step: IntervalStep): string {
  return step.meters !== undefined && step.meters > 0
    ? stepDistanceText(t, step.meters, step.unit)
    : formatClock(step.seconds);
}

/**
 * How close to the end of a distance step the "to go" cue is said: 100 m,
 * or a tenth of a mile on a step set in miles.
 */
export const stepToGoMeters = (unit?: StepDistanceUnit): number =>
  unit === 'mi' ? STEP_METERS_PER_MILE / 10 : 100;
/** Steps shorter than this get no "to go" cue: it would follow the start too soon. */
export const STEP_TO_GO_MIN_METERS = 300;

/** Said near the end of a distance step: "100 meters to go." or "0.1 miles to go." */
export function intervalToGoCue(t: TFunction, unit?: StepDistanceUnit): string {
  return t('recordActivity.cues.intervalToGo', {
    distance: spokenStepDistance(t, stepToGoMeters(unit), unit),
    defaultValue: '{{distance}} to go.',
  });
}

/** Said when the last step is over. */
export function intervalsDoneCue(t: TFunction): string {
  return t('recordActivity.cues.intervalsDone', {
    defaultValue: 'Intervals complete.',
  });
}

/** Said when the pace has stayed outside the runner's band. */
export function paceAlertCue(t: TFunction, kind: PaceAlertKind): string {
  return kind === 'tooFast'
    ? t('recordActivity.cues.paceTooFast', {
        defaultValue: 'Too fast. Ease off.',
      })
    : t('recordActivity.cues.paceTooSlow', {
        defaultValue: 'Too slow. Pick it up.',
      });
}

/** Said when the heart rate has stayed outside the runner's range. */
export function heartRateAlertCue(
  t: TFunction,
  kind: HeartRateAlertKind
): string {
  return kind === 'tooHigh'
    ? t('recordActivity.cues.heartRateTooHigh', {
        defaultValue: 'Heart rate high. Ease off.',
      })
    : t('recordActivity.cues.heartRateTooLow', {
        defaultValue: 'Heart rate low. Pick it up.',
      });
}

/** Said ten seconds before a step ends: how long is left and what comes next. */
export function stepWarningCue(
  t: TFunction,
  options: { next: IntervalStep | null; style: IntervalStyle }
): string {
  return options.next
    ? t('recordActivity.cues.stepWarning', {
        name: intervalStepName(t, options.next.kind, options.style),
        defaultValue: 'Ten seconds. Next, {{name}}.',
      })
    : t('recordActivity.cues.stepWarningLast', {
        defaultValue: 'Ten seconds to go.',
      });
}

/** Said as a timed step is about to end: the last three seconds in one breath. */
export function stepCountdownCue(t: TFunction): string {
  return t('recordActivity.cues.stepCountdown', {
    defaultValue: 'Three. Two. One.',
  });
}

/** Said when the distance passes 5K, 10K, a half marathon or a marathon. */
export function milestoneCue(t: TFunction, meters: number): string {
  if (meters >= 42195) {
    return t('recordActivity.cues.milestoneMarathon', {
      defaultValue: 'Marathon distance. Incredible.',
    });
  }
  if (meters >= 21097.5) {
    return t('recordActivity.cues.milestoneHalfMarathon', {
      defaultValue: 'Half marathon distance. Amazing.',
    });
  }
  if (meters >= 10000) {
    return t('recordActivity.cues.milestone10k', {
      defaultValue: '10K done. Strong effort.',
    });
  }
  return t('recordActivity.cues.milestone5k', {
    defaultValue: '5K done. Nice work.',
  });
}

/** Said when a plan workout is half over. */
export function halfwayCue(t: TFunction): string {
  return t('recordActivity.cues.halfway', {
    defaultValue: 'Halfway there. Keep it up.',
  });
}

/** Said when a minute is left in a plan workout. */
export function lastMinuteCue(t: TFunction): string {
  return t('recordActivity.cues.lastMinute', {
    defaultValue: 'One minute left. Finish strong.',
  });
}

/**
 * The periodic update: the time on the clock and, outdoors, how far and the
 * average pace. `secondsPerUnit` is null before there is enough to average.
 */
export function checkInCue(
  t: TFunction,
  options: {
    totalSeconds: number;
    /** Null for an indoor session, which has no measured distance. */
    distanceMeters: number | null;
    secondsPerUnit: number | null;
    unit: CueUnit;
  }
): string {
  const time = spokenDuration(t, options.totalSeconds);
  if (options.distanceMeters === null || options.distanceMeters < 10) {
    return t('recordActivity.cues.checkInTime', {
      time,
      defaultValue: '{{time}} done.',
    });
  }
  const distance = spokenDistance(
    t,
    Math.round((options.distanceMeters / cueUnitMeters(options.unit)) * 10) /
      10,
    options.unit
  );
  if (options.secondsPerUnit === null) {
    return t('recordActivity.cues.checkInDistance', {
      time,
      distance,
      defaultValue: '{{time}}. {{distance}}.',
    });
  }
  const pace = spokenDuration(t, Math.round(options.secondsPerUnit));
  return options.unit === 'miles'
    ? t('recordActivity.cues.checkInMiles', {
        time,
        distance,
        pace,
        defaultValue: '{{time}}. {{distance}}. Average pace {{pace}} per mile.',
      })
    : t('recordActivity.cues.checkInKm', {
        time,
        distance,
        pace,
        defaultValue:
          '{{time}}. {{distance}}. Average pace {{pace}} per kilometer.',
      });
}

/** "Week 2, run 3" or "Week 2, walk 3", spoken. */
function spokenProgramPlace(
  t: TFunction,
  options: { activity: 'run' | 'walk'; week: number; day: number }
): string {
  return options.activity === 'walk'
    ? t('recordActivity.cues.programPlaceWalk', {
        week: options.week,
        day: options.day,
        defaultValue: 'Week {{week}}, walk {{day}}',
      })
    : t('recordActivity.cues.programPlaceRun', {
        week: options.week,
        day: options.day,
        defaultValue: 'Week {{week}}, run {{day}}',
      });
}

/**
 * Said as a program workout begins, ahead of its first step: where it sits in
 * the program, how long it is, and a note when it was eased from the original.
 */
export function programStartCue(
  t: TFunction,
  options: {
    activity: 'run' | 'walk';
    week: number;
    day: number;
    totalSeconds: number;
    eased: boolean;
  }
): string {
  const place = spokenProgramPlace(t, options);
  const time = spokenDuration(t, options.totalSeconds);
  const base = t('recordActivity.cues.programStart', {
    place,
    time,
    defaultValue: '{{place}}. {{time}}.',
  });
  return options.eased
    ? `${base} ${t('recordActivity.cues.programEased', {
        defaultValue: 'Eased for today.',
      })}`
    : base;
}

/** "Workout 4. 30 minutes." for a workout of the person's own plan. */
export function customProgramStartCue(
  t: TFunction,
  options: { number: number; title?: string; totalSeconds: number }
): string {
  return t('recordActivity.cues.customProgramStart', {
    workout: options.title || `${options.number}`,
    time: spokenDuration(t, options.totalSeconds),
    defaultValue: 'Workout {{workout}}. {{time}}.',
  });
}

/** Said at the end of a workout of the person's own plan. */
export function customProgramDoneCue(
  t: TFunction,
  options: { done: number; total: number }
): string {
  if (options.done >= options.total) {
    return t('recordActivity.cues.programComplete', {
      defaultValue: 'Program complete. Well done.',
    });
  }
  return t('recordActivity.cues.customProgramDone', {
    done: options.done,
    total: options.total,
    next: options.done + 1,
    defaultValue:
      'Workout {{done}} of {{total}} done. Next up, workout {{next}}.',
  });
}

/**
 * Said at the end of a program workout that reached its last step: how far
 * through the program that is, and what comes next.
 */
export function programDoneCue(
  t: TFunction,
  options: {
    activity: 'run' | 'walk';
    done: number;
    total: number;
    next: { week: number; day: number } | null;
  }
): string {
  if (!options.next || options.done >= options.total) {
    return t('recordActivity.cues.programComplete', {
      defaultValue: 'Program complete. Well done.',
    });
  }
  return t('recordActivity.cues.programDone', {
    done: options.done,
    total: options.total,
    next: spokenProgramPlace(t, {
      activity: options.activity,
      week: options.next.week,
      day: options.next.day,
    }),
    defaultValue: 'Workout {{done}} of {{total}} done. Next up, {{next}}.',
  });
}
