import i18n from '../localization/i18n';

/** Supported Live Activity locales — kept intentionally small (en | pl). */
export type WorkoutLiveActivityLocale = 'en' | 'pl';

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
};

export function isWorkoutLiveActivityLocale(
  value: string | null | undefined,
): value is WorkoutLiveActivityLocale {
  return value === 'en' || value === 'pl';
}

/** Normalizes any language tag to the supported locale, defaulting to English. */
export function resolveWorkoutLiveActivityLocale(
  language: string | null | undefined,
): WorkoutLiveActivityLocale {
  return language?.toLowerCase().startsWith('pl') ? 'pl' : 'en';
}

/**
 * Returns the serialized label set for a locale. Uses the i18n resource for the
 * given locale with an English fallback for any missing key, so the returned
 * object is always complete and never contains i18next syntax.
 */
export function buildWorkoutLiveActivityLabels(
  locale: WorkoutLiveActivityLocale,
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
    labels[key] = typeof value === 'string' && value.length > 0 ? value : EN_FALLBACK[key];
  }
  return labels;
}
