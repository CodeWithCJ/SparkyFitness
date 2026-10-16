/**
 * The Apple Watch app's swipeable pages, in the order the watch shipped with.
 *
 * The strings are wire values: the watch maps each one onto a page of its own
 * (`WatchPage` in `targets/watch/Domain/WatchPage.swift`), so renaming one here
 * alone makes the watch drop it. A saved order is reconciled against this
 * array (`resolveKeyOrder`), so a page added later shows up, at the end, for
 * users who already reordered theirs.
 */
export const WATCH_PAGE_KEYS = [
  'goals',
  'water',
  'medications',
  'entry',
  'trend',
  'workout',
  'fasting',
  'steps',
] as const;

export type WatchPageKey = (typeof WATCH_PAGE_KEYS)[number];

type Translator = (key: string, options: { defaultValue: string }) => string;

/**
 * A page's name as the settings screen lists it. Resolvers rather than key
 * strings because the i18n audit needs the literal key at the call site; a
 * total record so a page added without a name is a compile error.
 */
export const WATCH_PAGE_LABELS: Record<
  WatchPageKey,
  (t: Translator) => string
> = {
  goals: (t) => t('watchSettings.pages.goals', { defaultValue: 'Goals' }),
  water: (t) => t('watchSettings.pages.water', { defaultValue: 'Water' }),
  medications: (t) =>
    t('watchSettings.pages.medications', { defaultValue: 'Medications' }),
  entry: (t) =>
    t('watchSettings.pages.entry', { defaultValue: 'Weight check-in' }),
  trend: (t) =>
    t('watchSettings.pages.trend', { defaultValue: 'Weight trend' }),
  workout: (t) => t('watchSettings.pages.workout', { defaultValue: 'Workout' }),
  fasting: (t) => t('watchSettings.pages.fasting', { defaultValue: 'Fasting' }),
  steps: (t) => t('watchSettings.pages.steps', { defaultValue: 'Steps' }),
};

/** What the watch's Goals page lists until the wearer picks: the three macros. */
export const DEFAULT_WATCH_NUTRIENTS = ['protein', 'carbs', 'fat'];

/**
 * How the watch's workout page takes a set's weight and reps: a number
 * keypad, or adjusted in place with the Digital Crown or a drag (Hevy-style).
 * Wire values, read
 * by the watch's `SetInputStyle`.
 */
export const WATCH_SET_INPUT_STYLES = ['keypad', 'crown'] as const;
export type WatchSetInputStyle = (typeof WATCH_SET_INPUT_STYLES)[number];
