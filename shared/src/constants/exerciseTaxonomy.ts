/**
 * Canonical muscle and equipment vocabulary for comparing exercises.
 *
 * Exercise rows store muscles/equipment as free text: free-exercise-db uses
 * its own lowercase vocabulary, wger imports are mapped onto that vocabulary
 * (integrations/wger/wgerNameMapping.ts) but with a few spellings of their own
 * ("bodyweight", "kettlebell", "ez-bar"), and custom exercises carry whatever
 * the user typed ("Quads", "Pecs", "Delts"). Similarity ranking (exercise
 * alternatives, workout variation) must compare meaning, not spelling, so
 * every value is funnelled through these normalizers first.
 *
 * The canonical values are free-exercise-db's own strings. They are what the
 * existing muscle/equipment filters already send, so no stored data or
 * client filter has to change.
 */

export const CANONICAL_MUSCLES = [
  'abdominals',
  'abductors',
  'adductors',
  'biceps',
  'calves',
  'chest',
  'forearms',
  'glutes',
  'hamstrings',
  'lats',
  'lower back',
  'middle back',
  'neck',
  'quadriceps',
  'shoulders',
  'traps',
  'triceps',
] as const;

export type CanonicalMuscle = (typeof CANONICAL_MUSCLES)[number];

export const CANONICAL_EQUIPMENT = [
  'barbell',
  'dumbbell',
  'kettlebells',
  'cable',
  'machine',
  'bands',
  'body only',
  'medicine ball',
  'exercise ball',
  'foam roll',
  'e-z curl bar',
  'other',
] as const;

export type CanonicalEquipment = (typeof CANONICAL_EQUIPMENT)[number];

const MUSCLE_SYNONYMS: Record<string, CanonicalMuscle> = {
  abs: 'abdominals',
  ab: 'abdominals',
  core: 'abdominals',
  obliques: 'abdominals',
  oblique: 'abdominals',
  'rectus abdominis': 'abdominals',
  'obliquus externus abdominis': 'abdominals',
  'hip abductors': 'abductors',
  'hip adductors': 'adductors',
  'inner thigh': 'adductors',
  'inner thighs': 'adductors',
  bicep: 'biceps',
  'biceps brachii': 'biceps',
  brachialis: 'forearms',
  forearm: 'forearms',
  calf: 'calves',
  soleus: 'calves',
  gastrocnemius: 'calves',
  pecs: 'chest',
  pec: 'chest',
  pectorals: 'chest',
  'pectoralis major': 'chest',
  'serratus anterior': 'chest',
  glute: 'glutes',
  gluteus: 'glutes',
  'gluteus maximus': 'glutes',
  'gluteus medius': 'glutes',
  hamstring: 'hamstrings',
  'biceps femoris': 'hamstrings',
  lat: 'lats',
  'latissimus dorsi': 'lats',
  'lower back': 'lower back',
  'erector spinae': 'lower back',
  'middle back': 'middle back',
  'upper back': 'middle back',
  rhomboids: 'middle back',
  back: 'middle back',
  quads: 'quadriceps',
  quad: 'quadriceps',
  'quadriceps femoris': 'quadriceps',
  shoulder: 'shoulders',
  delts: 'shoulders',
  delt: 'shoulders',
  deltoids: 'shoulders',
  deltoid: 'shoulders',
  'anterior deltoid': 'shoulders',
  'front delts': 'shoulders',
  'side delts': 'shoulders',
  'rear delts': 'shoulders',
  trap: 'traps',
  trapezius: 'traps',
  tricep: 'triceps',
  'triceps brachii': 'triceps',
};

const EQUIPMENT_SYNONYMS: Record<string, CanonicalEquipment> = {
  'body weight': 'body only',
  bodyweight: 'body only',
  'body-weight': 'body only',
  none: 'body only',
  'none (bodyweight exercise)': 'body only',
  'pull-up bar': 'body only',
  'pullup bar': 'body only',
  'dip station': 'body only',
  dumbbells: 'dumbbell',
  kettlebell: 'kettlebells',
  cables: 'cable',
  'cable machine': 'cable',
  'smith machine': 'machine',
  machines: 'machine',
  band: 'bands',
  'resistance band': 'bands',
  'resistance bands': 'bands',
  'swiss ball': 'exercise ball',
  'stability ball': 'exercise ball',
  'foam roller': 'foam roll',
  'ez-bar': 'e-z curl bar',
  'ez bar': 'e-z curl bar',
  'sz-bar': 'e-z curl bar',
  'ez curl bar': 'e-z curl bar',
  'gym mat': 'other',
};

// Accessories that say nothing about how the load is applied: a bench press
// and a dumbbell bench press are both "bench", so counting it would make
// every bench exercise look like the same equipment.
const IGNORED_EQUIPMENT = new Set(['bench', 'incline bench', 'decline bench']);

/** A bench says nothing about the load, so modality derivation skips it. */
export function isIgnoredEquipment(value: string | null | undefined): boolean {
  if (!value) return false;
  return IGNORED_EQUIPMENT.has(clean(value));
}

function clean(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Canonical muscle for a stored/typed name, or null when it is unknown. */
export function normalizeMuscle(
  value: string | null | undefined
): CanonicalMuscle | null {
  if (!value) return null;
  const key = clean(value);
  if ((CANONICAL_MUSCLES as readonly string[]).includes(key)) {
    return key as CanonicalMuscle;
  }
  return MUSCLE_SYNONYMS[key] ?? null;
}

/** Canonical equipment for a stored/typed name, or null when it is unknown or an accessory. */
export function normalizeEquipment(
  value: string | null | undefined
): CanonicalEquipment | null {
  if (!value) return null;
  const key = clean(value);
  if (IGNORED_EQUIPMENT.has(key)) return null;
  if ((CANONICAL_EQUIPMENT as readonly string[]).includes(key)) {
    return key as CanonicalEquipment;
  }
  return EQUIPMENT_SYNONYMS[key] ?? null;
}

/** Distinct canonical muscles for a list of raw names; unknown names are dropped. */
export function normalizeMuscleList(
  values: readonly (string | null | undefined)[] | null | undefined
): CanonicalMuscle[] {
  const result = new Set<CanonicalMuscle>();
  for (const value of values ?? []) {
    const muscle = normalizeMuscle(value);
    if (muscle) result.add(muscle);
  }
  return [...result];
}

/**
 * Distinct canonical equipment for a list of raw names. An exercise with no
 * recognised equipment is treated as bodyweight — free-exercise-db leaves
 * equipment null for most bodyweight movements.
 */
export function normalizeEquipmentList(
  values: readonly (string | null | undefined)[] | null | undefined
): CanonicalEquipment[] {
  const result = new Set<CanonicalEquipment>();
  for (const value of values ?? []) {
    const equipment = normalizeEquipment(value);
    if (equipment) result.add(equipment);
  }
  if (result.size === 0) result.add('body only');
  return [...result];
}

/** Every raw spelling (lowercased) that normalizes to one of `muscles`. */
export function muscleSpellings(muscles: readonly CanonicalMuscle[]): string[] {
  const wanted = new Set<string>(muscles);
  const spellings = new Set<string>(muscles);
  for (const [synonym, canonical] of Object.entries(MUSCLE_SYNONYMS)) {
    if (wanted.has(canonical)) spellings.add(synonym);
  }
  return [...spellings];
}

/** Whether the given string matches a canonical muscle name (case-insensitive). */
export function isCanonicalMuscle(
  value: string | null | undefined
): value is CanonicalMuscle {
  if (!value) return false;
  return (CANONICAL_MUSCLES as readonly string[]).includes(clean(value));
}

/** Whether the given string matches a canonical equipment name (case-insensitive). */
export function isCanonicalEquipment(
  value: string | null | undefined
): value is CanonicalEquipment {
  if (!value) return false;
  return (CANONICAL_EQUIPMENT as readonly string[]).includes(clean(value));
}

/**
 * Standard English fallback display label for a canonical muscle or equipment.
 * E.g. "lower back" -> "Lower Back", "e-z curl bar" -> "E-Z Curl Bar".
 */
export function formatTaxonomyFallback(value: string): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (trimmed.toLowerCase() === 'e-z curl bar') {
    return 'E-Z Curl Bar';
  }
  return trimmed
    .split(' ')
    .map((word) =>
      word.length > 0
        ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        : ''
    )
    .join(' ');
}

/**
 * If the input normalizes or matches a canonical muscle (e.g. "Quads" -> "quadriceps", "Chest" -> "chest"),
 * returns the canonical lowercase form. Otherwise returns the trimmed original input preserving casing.
 */
export function resolveCanonicalOrCustomMuscle(input: string): string {
  const normalized = normalizeMuscle(input);
  if (normalized) return normalized;
  return input.trim();
}

/**
 * If the input normalizes or matches a canonical equipment (e.g. "Dumbbells" -> "dumbbell", "Barbell" -> "barbell"),
 * returns the canonical lowercase form. Otherwise returns the trimmed original input preserving casing.
 */
export function resolveCanonicalOrCustomEquipment(input: string): string {
  const normalized = normalizeEquipment(input);
  if (normalized) return normalized;
  return input.trim();
}
