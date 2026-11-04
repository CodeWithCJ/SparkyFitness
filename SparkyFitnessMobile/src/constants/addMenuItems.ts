import type { IconName } from '../components/Icon';

/**
 * Everything the + sheet can offer, in the order it shipped with: the four
 * cards, then the rows. Any item can sit in one of the four card slots
 * (`addMenuCards`) or in the rows below them. A saved order is reconciled
 * against this array (`resolveKeyOrder`), so an item added later shows up, at
 * the end, for users who already arranged theirs. Exercise opens its own
 * sub-menu wherever it sits.
 */
export const ADD_MENU_ITEM_KEYS = [
  'food',
  'exercise',
  'measurements',
  'scanFood',
  'checkIn',
  'progressPhotos',
  'wellness',
  'symptoms',
  'mood',
  'mindfulness',
  'askSparky',
  'syncHealth',
] as const;

export type AddMenuItemKey = (typeof ADD_MENU_ITEM_KEYS)[number];

/** How many big cards the sheet has room for: two rows of two. */
export const ADD_MENU_CARD_COUNT = 4;

/** The cards the sheet shipped with. */
export const DEFAULT_ADD_MENU_CARDS: AddMenuItemKey[] = [
  'food',
  'exercise',
  'measurements',
  'scanFood',
];

type Translator = (key: string, options: { defaultValue: string }) => string;

/**
 * A row's name as the sheet and its settings screen show it. Resolvers rather
 * than key strings because the i18n audit needs the literal key at the call
 * site; a total record so a row added without a name is a compile error.
 */
export const ADD_MENU_ITEM_LABELS: Record<
  AddMenuItemKey,
  (t: Translator) => string
> = {
  food: (t) => t('addSheet.food', { defaultValue: 'Food' }),
  exercise: (t) => t('addSheet.exercise', { defaultValue: 'Exercise' }),
  measurements: (t) =>
    t('addSheet.measurements', { defaultValue: 'Measurements' }),
  scanFood: (t) => t('addSheet.scanFood', { defaultValue: 'Scan Food' }),
  checkIn: (t) => t('addSheet.checkIn', { defaultValue: 'Daily Check-In' }),
  progressPhotos: (t) =>
    t('addSheet.progressPhotos', { defaultValue: 'Progress Photos' }),
  wellness: (t) => t('addSheet.wellness', { defaultValue: 'Wellness' }),
  symptoms: (t) =>
    t('addSheet.symptomsHealth', { defaultValue: 'Symptoms & Health' }),
  mood: (t) => t('addSheet.mood', { defaultValue: 'Mood' }),
  mindfulness: (t) =>
    t('addSheet.mindfulness', { defaultValue: 'Mindfulness' }),
  askSparky: (t) => t('addSheet.askSparky', { defaultValue: 'Ask Sparky' }),
  syncHealth: (t) =>
    t('addSheet.syncHealthShort', { defaultValue: 'Sync Health' }),
};

/** A shorter name for the narrow card, where the row's name is long. */
export const ADD_MENU_CARD_LABELS: Partial<
  Record<AddMenuItemKey, (t: Translator) => string>
> = {
  measurements: (t) => t('addSheet.measureShort', { defaultValue: 'Measure' }),
  scanFood: (t) => t('addSheet.scanShort', { defaultValue: 'Scan' }),
};

/** Each item's icon, on a card and in a row. */
export const ADD_MENU_ITEM_ICONS: Record<AddMenuItemKey, IconName> = {
  food: 'food',
  exercise: 'exercise-weights',
  measurements: 'measurements',
  scanFood: 'scan',
  checkIn: 'check-in',
  progressPhotos: 'camera',
  wellness: 'wellness-filled',
  symptoms: 'symptoms',
  mood: 'mood',
  mindfulness: 'exercise-yoga',
  askSparky: 'sparkles',
  syncHealth: 'sync',
};

type AddMenuItemTint =
  'accent' | 'green' | 'violet' | 'red' | 'amber' | 'sky' | 'pink';

/** The colour of the tile behind each item's icon. */
export const ADD_MENU_ITEM_TINTS: Record<AddMenuItemKey, AddMenuItemTint> = {
  food: 'accent',
  exercise: 'accent',
  measurements: 'accent',
  scanFood: 'accent',
  checkIn: 'green',
  progressPhotos: 'violet',
  wellness: 'pink',
  symptoms: 'red',
  mood: 'amber',
  mindfulness: 'sky',
  askSparky: 'accent',
  syncHealth: 'accent',
};

/** How many pairs or buttons share a line. */
export const ADD_MENU_LINE_SIZE = 2;

export type AddMenuRowStyle = 'list' | 'compact' | 'action';

/** The order the sheet lays the styles out in, and settings lists them. */
export const ADD_MENU_ROW_STYLES: readonly AddMenuRowStyle[] = [
  'list',
  'compact',
  'action',
];

/**
 * How an item looks below the cards: `list` is a full-width row with a chevron,
 * `compact` shares a line with another compact item, and `action` is a button
 * at the foot of the sheet. Rows keep their arranged order within each style.
 */
export const ADD_MENU_ITEM_ROW_STYLES: Record<AddMenuItemKey, AddMenuRowStyle> =
  {
    food: 'list',
    exercise: 'list',
    measurements: 'list',
    scanFood: 'list',
    checkIn: 'list',
    progressPhotos: 'list',
    wellness: 'list',
    symptoms: 'list',
    mood: 'compact',
    mindfulness: 'compact',
    askSparky: 'action',
    syncHealth: 'action',
  };
