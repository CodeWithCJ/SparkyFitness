import i18n from '@/i18n';
import {
  FOOD_VARIANT_NUTRIENT_FIELDS,
  MACRO_PICKER_FIELDS,
  getMicronutrientById,
  normalizeNutrientName,
  type MedicationWithMeal,
} from '@workspace/shared';
import type { UserCustomNutrient } from '@/types/customNutrient';
import type { MedicationNutrients } from '@/types/medications';
import {
  Pill,
  Syringe,
  Tablets,
  FlaskConical,
  Bandage,
  SprayCan,
  Pipette,
  Droplets,
  Package,
  Frown,
  BatteryLow,
  Brain,
  ArrowDownFromLine,
  CircleAlert,
  Flame,
  RotateCcw,
  Activity,
  User,
  Heart,
  Dumbbell,
  Bone,
  Gauge,
  StickyNote,
  type LucideIcon,
} from 'lucide-react';
import { BUILT_IN_SYMPTOMS } from '@workspace/shared';
import { formatTimeOfDayString } from '@/utils/timeFormatters';
import type { MedicationSchedule } from '@/types/medications';

export const MED_TYPES = [
  'pill',
  'tablet',
  'capsule',
  'liquid',
  'injection',
  'patch',
  'inhaler',
  'nasal_spray',
  'drops',
  'cream',
  'suppository',
  'other',
];

// Dose-forms offered on the supplement form. These reuse the medication `type_id`
// text column (no schema change) — a supplement is an is_supplement medication row,
// so its form lives in the same field a medication's type does.
export const SUPPLEMENT_FORMS = [
  'tablet',
  'capsule',
  'softgel',
  'gummy',
  'powder',
  'liquid',
] as const;

/**
 * Forms whose servings can be COUNTED, so "1 serving = 2 tablets" says something.
 *
 * Powder and liquid are deliberately absent. A serving of those is a scoop or a volume,
 * not a number of items, and "1 serving = 1 liquid" is not a sentence. For them the panel
 * heading alone is already unambiguous, since the serving is whatever the label says it is.
 */
export const COUNTABLE_SUPPLEMENT_FORMS: string[] = [
  'tablet',
  'capsule',
  'softgel',
  'gummy',
  'pill',
];

export const isCountableForm = (typeId: string | null | undefined): boolean =>
  !!typeId && COUNTABLE_SUPPLEMENT_FORMS.includes(typeId);

export type MedSubtype = 'all' | 'meds' | 'supplements';

// Partitions the medication list for the `All | Meds | Supplements` segmented filter.
// Supplements are is_supplement medication rows, so this is a view filter over the same
// list, not a separate data source — keeping the adherence engine and rollup untouched.
export const filterMedsBySubtype = <T extends { is_supplement?: boolean }>(
  meds: T[],
  subtype: MedSubtype
): T[] =>
  meds.filter((med) =>
    subtype === 'all'
      ? true
      : subtype === 'supplements'
        ? Boolean(med.is_supplement)
        : !med.is_supplement
  );

// Whether a logged entry belongs to the subtype currently on screen. `all` always
// says yes and deliberately never consults the id set: an entry outlives the
// medication it came from, so an orphan matches no visible id and filtering the
// mixed view would silently drop history that view exists to show. The narrowed
// views do filter, because an orphan cannot be classified once its row is gone.
export const isEntryVisibleForSubtype = (
  medicationId: string | null | undefined,
  visibleMedIds: Set<string>,
  subtype: MedSubtype
): boolean =>
  subtype === 'all' || (!!medicationId && visibleMedIds.has(medicationId));

// Array form of the rule above, for the Log view's entry lists.
export const filterEntriesBySubtype = <T extends { medication_id: string }>(
  entries: T[],
  visibleMedIds: Set<string>,
  subtype: MedSubtype
): T[] =>
  entries.filter((entry) =>
    isEntryVisibleForSubtype(entry.medication_id, visibleMedIds, subtype)
  );

export const MED_TYPE_ICONS: Record<string, LucideIcon> = {
  pill: Pill,
  tablet: Tablets,
  capsule: Pill,
  softgel: Pill,
  gummy: Tablets,
  powder: FlaskConical,
  liquid: FlaskConical,
  injection: Syringe,
  patch: Bandage,
  inhaler: SprayCan,
  nasal_spray: SprayCan,
  drops: Pipette,
  cream: Droplets,
  suppository: Pill,
  other: Package,
};

export const MED_TYPE_COLORS: Record<string, string> = {
  pill: 'text-rose-500',
  tablet: 'text-amber-500',
  capsule: 'text-orange-500',
  softgel: 'text-amber-500',
  gummy: 'text-pink-500',
  powder: 'text-emerald-500',
  liquid: 'text-cyan-500',
  injection: 'text-blue-500',
  patch: 'text-violet-500',
  inhaler: 'text-teal-500',
  nasal_spray: 'text-emerald-500',
  drops: 'text-sky-500',
  cream: 'text-pink-500',
  suppository: 'text-fuchsia-500',
  other: 'text-slate-500',
};

// Colorful icons + accent colors for built-in symptoms, shared across the
// symptom log form and the symptom history calendar / GI sub-tracker.
export const SYMPTOM_ICONS: Record<string, LucideIcon> = {
  nausea: Frown,
  fatigue: BatteryLow,
  headache: Brain,
  constipation: ArrowDownFromLine,
  diarrhea: Droplets,
  vomiting: CircleAlert,
  acid_reflux: Flame,
  stomach_pain: Frown,
  dizziness: RotateCcw,
};

export const SYMPTOM_COLORS: Record<string, string> = {
  nausea: 'text-emerald-500',
  fatigue: 'text-amber-500',
  headache: 'text-purple-500',
  constipation: 'text-orange-500',
  diarrhea: 'text-sky-500',
  vomiting: 'text-violet-500',
  acid_reflux: 'text-red-500',
  stomach_pain: 'text-rose-500',
  dizziness: 'text-indigo-500',
};

// Tinted chip backgrounds (light + dark) that wrap a symptom icon so it reads
// as colorful and prominent as the emojis it replaced.
export const SYMPTOM_CHIPS: Record<string, string> = {
  nausea:
    'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400',
  fatigue:
    'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400',
  headache:
    'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400',
  constipation:
    'bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400',
  diarrhea: 'bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-400',
  vomiting:
    'bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400',
  acid_reflux: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400',
  stomach_pain:
    'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400',
  dizziness:
    'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400',
};

export const symptomIcon = (name: string): LucideIcon =>
  SYMPTOM_ICONS[name] ?? StickyNote;
export const symptomColor = (name: string): string =>
  SYMPTOM_COLORS[name] ?? 'text-muted-foreground';
export const symptomChip = (name: string): string =>
  SYMPTOM_CHIPS[name] ?? 'bg-muted text-muted-foreground';

// Built-in symptoms are referenced by their display-name snapshot in logged
// history, so build a lookup keyed by lower-cased display name too.
const SNAPSHOT_TO_KEY: Record<string, string> = Object.fromEntries(
  BUILT_IN_SYMPTOMS.map((s) => [s.displayName.toLowerCase(), s.name])
);

export const symptomIconForSnapshot = (snapshot: string): LucideIcon =>
  symptomIcon(SNAPSHOT_TO_KEY[snapshot.toLowerCase()] ?? '');
export const symptomColorForSnapshot = (snapshot: string): string =>
  symptomColor(SNAPSHOT_TO_KEY[snapshot.toLowerCase()] ?? '');

export const LOCATION_ICONS: Record<string, LucideIcon> = {
  general: User,
  head: Brain,
  abdomen: Activity,
  chest: Heart,
  back: User,
  muscles: Dumbbell,
  joints: Bone,
};

export const LOCATION_COLORS: Record<string, string> = {
  general: 'text-slate-500',
  head: 'text-purple-500',
  abdomen: 'text-orange-500',
  chest: 'text-red-500',
  back: 'text-teal-500',
  muscles: 'text-amber-500',
  joints: 'text-cyan-500',
};

// GI sub-tracker tile accents (icon + value share the same hue).
export const GI_TILE_ICONS = {
  nausea: Frown,
  vomiting: CircleAlert,
  reflux: Flame,
  bristol: Gauge,
} as const;

export const formatDaysOfWeek = (days: number[] | null) => {
  if (!days || days.length === 0) return '';
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days.map((d) => names[d] ?? '').join(', ');
};

const translateMealRelation = (withMeal: MedicationWithMeal): string => {
  switch (withMeal) {
    case 'before':
      return i18n.t('medications.mealRelation.before', 'Before meal');
    case 'with':
      return i18n.t('medications.mealRelation.with', 'With meal');
    case 'after':
      return i18n.t('medications.mealRelation.after', 'After meal');
    case 'away_from_meals':
      return i18n.t(
        'medications.mealRelation.awayFromMeals',
        'Away from meals'
      );
  }
};

export const formatScheduleDescription = (
  sched: MedicationSchedule,
  timeFormat: string
) => {
  const timeStr = sched.time_of_day
    ? i18n.t('medications.scheduleDesc.atTime', ' at {{time}}', {
        time: formatTimeOfDayString(sched.time_of_day, timeFormat),
      })
    : '';
  const mealStr = sched.with_meal
    ? i18n.t('medications.scheduleDesc.mealRelationSuffix', ' ({{meal}})', {
        meal: translateMealRelation(sched.with_meal),
      })
    : '';

  switch (sched.schedule_type_id) {
    case 'daily':
      return `${i18n.t('medications.scheduleDesc.daily', 'Daily')}${timeStr}${mealStr}`;
    case 'weekly':
    case 'specific_days':
      return `${i18n.t('medications.scheduleDesc.weeklyOn', 'Weekly on {{days}}', { days: formatDaysOfWeek(sched.days_of_week) })}${timeStr}${mealStr}`;
    case 'every_n_days':
      return `${i18n.t('medications.scheduleDesc.everyNDays', 'Every {{n}} days', { n: sched.interval_days })}${timeStr}${mealStr}`;
    case 'cyclic':
      return `${i18n.t('medications.scheduleDesc.cyclic', 'Cycle: {{on}} days on, {{off}} days off', { on: sched.cycle_on_days, off: sched.cycle_off_days })}${timeStr}${mealStr}`;
    case 'monthly':
      return `${i18n.t('medications.scheduleDesc.monthly', 'Monthly on day {{day}}', { day: sched.day_of_month })}${timeStr}${mealStr}`;
    case 'prn':
      return `${i18n.t('medications.scheduleDesc.prn', 'As needed (PRN)')}${sched.prn_reason ? `: ${sched.prn_reason}` : ''}`;
    case 'taper':
      return `${i18n.t('medications.scheduleDesc.taper', 'Taper / titration')}${timeStr}${mealStr}`;
    default:
      return `${sched.schedule_type_id}${timeStr}${mealStr}`;
  }
};

// Normalises a free-text number input into a `dose_amount` the API will accept. The
// server requires dose_amount to be positive, but these are plain number inputs saved
// via onClick rather than a native form submit, so their `min` attribute never triggers
// constraint validation — an empty, zero or negative entry has to become null ("no
// dose" / "no override") here, or the save fails with a 400.
export const positiveDoseOrNull = (value: string): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

// Which of the two Log cards to render for the active filter. The medications card
// doubles as the "nothing scheduled at all" empty state, so it stays in the All view
// even when the user has no medications — dropping it there would leave a user with
// only supplements-in-waiting staring at a blank column. The supplement card is only
// worth its header once there is something to put under it.
export const visibleDoseCards = (
  subtype: MedSubtype,
  hasSupplementContent: boolean
): { medications: boolean; supplements: boolean } => ({
  medications: subtype !== 'supplements',
  supplements:
    subtype === 'supplements' || (subtype === 'all' && hasSupplementContent),
});

// How many nutrient rows a supplement's per-dose payload carries. Used for the compact
// "12 nutrients" badge — a multivitamin has ~26, which is correct but not worth listing
// inline on a card.
export const countMedicationNutrients = (
  nutrients: MedicationNutrients | null | undefined
): number => {
  if (!nutrients) return 0;
  const fixed = FOOD_VARIANT_NUTRIENT_FIELDS.filter(
    (field) => typeof nutrients[field] === 'number'
  ).length;
  return fixed + Object.keys(nutrients.custom_nutrients ?? {}).length;
};

/**
 * A nutrient row the user chose in the picker, before anything exists server-side.
 *
 * Nothing is created when a nutrient is picked — only when the supplement is SAVED.
 * Picking used to seed `user_custom_nutrients` immediately, which meant a mis-click on
 * "Multivitamin panel" followed by Cancel still left 20 custom nutrients (and their
 * display-preference and goal rows) behind permanently.
 *
 * `catalogId` marks a canonical catalog nutrient that must be find-or-created on save;
 * `isNew` a free-text one. Neither set means the key is already storable as-is (a fixed
 * food-variant column, or a custom nutrient the user already has).
 */
export interface NutrientPick {
  /** the key to store the value against (provisional for catalog/free-text picks) */
  key: string;
  unit: string;
  catalogId?: string;
  isNew?: boolean;
}

/**
 * True when a staged nutrient value would actually be written into the saved payload —
 * a real finite number. A cleared input holds `''` and an untouched row `undefined`.
 */
export const isStoredNutrientAmount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * Which pending picker rows to find-or-create when the supplement is saved.
 *
 * A row qualifies only if it is still in the editor (`selectedNutrients`) AND carries
 * an amount the payload will store. The amount check is load-bearing: the multivitamin
 * panel stages ~20 rows in one click, and saving with only two filled in must not
 * materialize the other eighteen — every created nutrient also fans out into goal
 * targets and report/goal display preferences on all platforms.
 */
export function collectNutrientsToProvision(
  pendingNutrients: Record<
    string,
    Pick<NutrientPick, 'catalogId' | 'unit' | 'isNew'>
  >,
  selectedNutrients: string[],
  customValues: Record<string, string | number> | undefined
): {
  catalogIds: string[];
  provisionalByCatalogId: Record<string, string>;
  freeText: { key: string; unit: string }[];
} {
  const selected = new Set(selectedNutrients);
  const catalogIds: string[] = [];
  const provisionalByCatalogId: Record<string, string> = {};
  const freeText: { key: string; unit: string }[] = [];
  for (const [key, pending] of Object.entries(pendingNutrients)) {
    if (!selected.has(key)) continue; // picked, then removed again
    if (!isStoredNutrientAmount(customValues?.[key])) continue; // left blank
    if (pending.catalogId) {
      catalogIds.push(pending.catalogId);
      provisionalByCatalogId[pending.catalogId] = key;
    } else if (pending.isNew) {
      freeText.push({ key, unit: pending.unit });
    }
  }
  return { catalogIds, provisionalByCatalogId, freeText };
}

/**
 * Every name the rows already in the supplement editor answer to: each row's own key,
 * plus the aliases of the custom nutrient behind it.
 *
 * Aliases matter because the server resolves a catalog pick onto a matching alias — a
 * user who tracks "Vit D" (alias "Vitamin D3") already HAS the catalog's "Vitamin D".
 */
export function collectClaimedNutrientNames(
  selected: string[],
  customNutrients?: UserCustomNutrient[]
): Set<string> {
  const claimed = new Set<string>();
  for (const key of selected) {
    claimed.add(normalizeNutrientName(key));
    const custom = customNutrients?.find((nutrient) => nutrient.name === key);
    for (const alias of custom?.aliases ?? []) {
      claimed.add(normalizeNutrientName(alias));
    }
  }
  return claimed;
}

/**
 * A picker option is unavailable once the editor holds a row that answers to any of its
 * names — its field key, its canonical name, or (for a catalog entry) any of its aliases.
 *
 * Without the alias arm the picker would offer a nutrient the user already tracks under
 * their own spelling, and adding it would silently do nothing.
 */
export function isNutrientOptionAlreadyAdded(
  option: { label: string; fieldKey?: string; catalogId?: string },
  selected: string[],
  claimedNames: Set<string>
): boolean {
  if (option.fieldKey && selected.includes(option.fieldKey)) return true;
  const names = [option.label];
  if (option.catalogId) {
    const entry = getMicronutrientById(option.catalogId);
    if (entry) names.push(...entry.aliases);
  }
  return names.some((name) => claimedNames.has(normalizeNutrientName(name)));
}

/**
 * What one logged dose of a supplement will actually contribute, when the schedule's dose
 * is not 1.
 *
 * A supplement's nutrition is entered per dose, and the entry snapshot multiplies it by the
 * dose count, so a schedule set to 2 counts double. That is correct and intended, but it is
 * invisible at the point where the mistake is made: a user reading a label whose serving is
 * two capsules can enter the serving amounts here AND set the dose to 2, silently doubling
 * their intake. Showing the multiplication makes that self-evident.
 *
 * Returns null when there is nothing to say: not a supplement, no nutrition entered, or a
 * dose of exactly 1, where "1 x 15 = 15" is noise rather than information.
 */
export const supplementDoseScaling = (
  med: {
    is_supplement?: boolean | null;
    nutrients?: MedicationNutrients | null;
  },
  doseInput: string,
  fallbackDose?: number | null
): { dose: number; calories: number | null } | null => {
  if (!med.is_supplement) return null;

  const nutrients = med.nutrients;
  const hasNutrition =
    !!nutrients &&
    (FOOD_VARIANT_NUTRIENT_FIELDS.some(
      (field) => typeof nutrients[field] === 'number'
    ) ||
      Object.keys(nutrients.custom_nutrients ?? {}).length > 0);
  if (!hasNutrition) return null;

  // An empty input inherits the medication's own dose, which is what the field's
  // placeholder shows. So does an INVALID one: handleSave sends positiveDoseOrNull, so a 0,
  // a negative or a typo saves as null and inherits too. Previewing 1 for those would
  // promise something different from what gets logged whenever the inherited dose is not 1.
  const parsed = doseInput.trim() === '' ? null : positiveDoseOrNull(doseInput);
  const dose = parsed ?? fallbackDose ?? 1;
  if (dose === 1) return null;

  const calories =
    typeof nutrients.calories === 'number' ? nutrients.calories : null;
  return { dose, calories };
};

/**
 * The five energy and macro fields, as a set.
 *
 * Kept together rather than offered individually in the nutrient picker: they are a closed
 * set that co-occurs, since a Supplement Facts panel printing calories almost always prints
 * carbohydrate and fat too. Searching a 33-entry catalog five times to transcribe one block
 * of a label is the wrong shape, and putting them in that list pushed the vitamins (the
 * common case) below the fold.
 */
export const MACRO_FIELD_KEYS: string[] = MACRO_PICKER_FIELDS.map(
  (field) => field.fieldKey as string
);

export const isMacroField = (key: string): boolean =>
  MACRO_FIELD_KEYS.includes(key);

/**
 * Whether a saved supplement already carries any energy or macro value, which is what
 * decides if the editor opens with the macro block expanded.
 */
export const hasMacroValue = (
  nutrients: MedicationNutrients | null | undefined
): boolean =>
  !!nutrients &&
  MACRO_FIELD_KEYS.some(
    (key) => typeof nutrients[key as keyof MedicationNutrients] === 'number'
  );
