import i18n from '../localization/i18n';
import {
  resolveLanguage,
  type SupportedLanguage,
} from '../localization/localeRegistry';

/** Live Activity labels follow the authoritative shipped-locale registry. */
export type WorkoutLiveActivityLocale = SupportedLanguage;

/**
 * Serialized user-facing labels rendered by the Workout Live Activity layout.
 * Built in the main app from static i18n keys so the layout never needs
 * i18next, React Native, or any JSON-boundary-hostile value. Every field is a
 * plain string that crosses the widget boundary as JSON.
 */
export type WorkoutLiveActivityLabels = {
  rest: string;
  paused: string;
  elapsed: string;
  workoutComplete: string;
  complete: string;
  addFifteenSeconds: string;
  /** Compact "+15s" button label (numeric/unit text shown on the button). */
  addFifteenSecondsShort: string;
  skipRest: string;
  workout: string;
  exercise: string;
  set: string;
  /** Connector joining set number and count, e.g. "of" (en) / "z" (pl). */
  setOf: string;
  /** Accessibility label of the -15s rest button. */
  subtractFifteenSeconds: string;
  /** Compact "-15s" button label. */
  subtractFifteenSecondsShort: string;
  /** Visible label of the skip-rest button. */
  skip: string;
  /** Prefix for the upcoming set while resting, e.g. "Next". */
  next: string;
};

const LABEL_KEYS: readonly (keyof WorkoutLiveActivityLabels)[] = [
  'rest',
  'paused',
  'elapsed',
  'workoutComplete',
  'complete',
  'addFifteenSeconds',
  'addFifteenSecondsShort',
  'skipRest',
  'workout',
  'exercise',
  'set',
  'setOf',
  'subtractFifteenSeconds',
  'subtractFifteenSecondsShort',
  'skip',
  'next',
];

/** English fallback used when i18n is not yet initialized or a key is missing. */
const EN_FALLBACK: WorkoutLiveActivityLabels = {
  rest: 'Rest',
  paused: 'Paused',
  elapsed: 'Elapsed',
  workoutComplete: 'Workout complete',
  complete: 'Complete',
  addFifteenSeconds: 'Add 15 seconds',
  addFifteenSecondsShort: '+15s',
  skipRest: 'Skip rest',
  workout: 'Workout',
  exercise: 'Exercise',
  set: 'Set',
  setOf: 'of',
  subtractFifteenSeconds: 'Subtract 15 seconds',
  subtractFifteenSecondsShort: '-15s',
  skip: 'Skip',
  next: 'Next',
};

export function isWorkoutLiveActivityLocale(
  value: string | null | undefined
): value is WorkoutLiveActivityLocale {
  return typeof value === 'string' && resolveLanguage(value) === value;
}

/** Normalizes any language tag to the supported locale, defaulting to English. */
export function resolveWorkoutLiveActivityLocale(
  language: string | null | undefined
): WorkoutLiveActivityLocale {
  return resolveLanguage(language);
}

/**
 * Returns the serialized label set for a locale. Uses the i18n resource for the
 * given locale with an English fallback for any missing key, so the returned
 * object is always complete and never contains i18next syntax.
 */
export function buildWorkoutLiveActivityLabels(
  locale: WorkoutLiveActivityLocale
): WorkoutLiveActivityLabels {
  if (!i18n.isInitialized) {
    // English is the stable cold-start fallback: return the built-in map
    // before i18n is ready (app boot, tests).
    return { ...EN_FALLBACK };
  }
  // The i18n catalog (EN and PL) is the source of truth once initialized; the
  // built-in map is only the per-key English defaultValue, so editing the EN
  // catalog (e.g. before Weblate) actually changes the Live Activity text.
  const fixedT = i18n.getFixedT(locale, 'translation');
  const labels = {} as WorkoutLiveActivityLabels;
  for (const key of LABEL_KEYS) {
    // i18next can return the raw key path when the key is missing; an explicit
    // English defaultValue per key guarantees the label object never contains
    // "activeWorkout.liveActivity.*" text. The non-empty check is the last
    // line of defense (e.g. an accidentally empty resource value).
    const value = fixedT(`activeWorkout.liveActivity.${key}`, {
      defaultValue: EN_FALLBACK[key],
    });
    labels[key] =
      typeof value === 'string' && value.length > 0 ? value : EN_FALLBACK[key];
  }
  return labels;
}

/**
 * "12 reps" / "1 rep" for the Live Activity's target line, in the locale the
 * labels were built for. A count rather than a pair of "rep" / "reps" labels,
 * because the plural rules differ by language (Polish has three forms), which
 * only i18next's count handling gets right.
 */
export function formatRepCount(
  reps: number,
  locale: WorkoutLiveActivityLocale
): string {
  if (!i18n.isInitialized) return reps === 1 ? '1 rep' : `${reps} reps`;
  const fixedT = i18n.getFixedT(locale, 'translation');
  return fixedT('activeWorkout.liveActivity.repCount', {
    count: reps,
    defaultValue_one: '{{count}} rep',
    defaultValue_other: '{{count}} reps',
  });
}

/** "Set 2 of 4". `total` rather than `count`: i18next treats `count` as a plural. */
export function formatSetProgress(
  number: number,
  total: number,
  locale: WorkoutLiveActivityLocale
): string {
  if (!i18n.isInitialized) return `Set ${number} of ${total}`;
  const fixedT = i18n.getFixedT(locale, 'translation');
  return fixedT('activeWorkout.liveActivity.setProgress', {
    number,
    total,
    defaultValue: 'Set {{number}} of {{total}}',
  });
}

/**
 * Resting subtitle. With a target: "Next: Set 2 of 4 (65 lbs × 12 reps)".
 * Without one: "Next: Set 2 of 4".
 */
export function formatNextSubtitle(
  set: string,
  target: string | null,
  locale: WorkoutLiveActivityLocale
): string {
  if (!i18n.isInitialized) {
    return target != null ? `Next: ${set} (${target})` : `Next: ${set}`;
  }
  const fixedT = i18n.getFixedT(locale, 'translation');
  if (target != null) {
    return fixedT('activeWorkout.liveActivity.nextSetWithTarget', {
      set,
      target,
      defaultValue: 'Next: {{set}} ({{target}})',
    });
  }
  return fixedT('activeWorkout.liveActivity.nextSet', {
    set,
    defaultValue: 'Next: {{set}}',
  });
}
