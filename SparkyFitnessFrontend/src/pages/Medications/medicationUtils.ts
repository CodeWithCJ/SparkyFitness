import i18n from '@/i18n';
import { FOOD_VARIANT_NUTRIENT_FIELDS } from '@workspace/shared';
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
    ? i18n.t('medications.scheduleDesc.mealSuffix', ' ({{meal}} meal)', {
        meal: sched.with_meal,
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
