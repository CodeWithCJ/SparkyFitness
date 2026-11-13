/**
 * Maps the body-map SVG's `path[class]` names to the muscle vocabulary stored in
 * exercises.primary_muscles/secondary_muscles (the free-exercise-db muscle names, e.g.
 * "abdominals", "lower back", "quadriceps"). Web (BodyMapFilter, WorkoutSessionBodyMap,
 * MuscleHeatmap) and the mobile muscle figure read this one map.
 */
export const svgClassToSchemaName: Record<string, string> = {
  abdominal: 'abdominals',
  obliques: 'abdominals',
  lowerback: 'lower back',
  quads: 'quadriceps',
  biceps: 'biceps',
  calves: 'calves',
  chest: 'chest',
  forearms: 'forearms',
  glutes: 'glutes',
  hamstrings: 'hamstrings',
  // Posterior "wings" on muscle-male.svg. The file ships them as obliques,
  // which painted ab sets onto the lats. Those paths are retagged `lats`.
  lats: 'lats',
  shoulders: 'shoulders',
  traps: 'traps',
  triceps: 'triceps',
};

const MUSCLE_ALIASES: Record<string, string[]> = {
  abdominals: ['abs', 'abdominal', 'obliques'],
  quadriceps: ['quads'],
  'lower back': ['lowerback'],
  traps: ['trapezius'],
  lats: ['latissimus dorsi'],
};

export function muscleKey(name: string): string {
  return name.trim().toLowerCase();
}

export function svgClassToMuscleKey(svgClass: string): string {
  return muscleKey(svgClassToSchemaName[svgClass] || svgClass);
}

export function setsForMuscleKey(
  key: string,
  setsByMuscle: Record<string, number>
): number {
  const names = new Set([key, ...(MUSCLE_ALIASES[key] ?? [])]);
  let total = 0;
  for (const [name, count] of Object.entries(setsByMuscle)) {
    if (names.has(muscleKey(name))) total += count;
  }
  return total;
}

const DRAWN_MUSCLE_KEYS = new Set(
  Object.keys(svgClassToSchemaName).map(svgClassToMuscleKey)
);

/** Largest per-path total on the body map, with aliases combined as drawn. */
export function maxDrawnMuscleSets(
  setsByMuscle: Record<string, number>
): number {
  let max = 0;
  for (const key of DRAWN_MUSCLE_KEYS) {
    max = Math.max(max, setsForMuscleKey(key, setsByMuscle));
  }
  return max;
}

/**
 * The figure region a stored muscle name tints, resolving aliases such as
 * "Abs" or "Latissimus Dorsi". Null when the figure does not draw it.
 */
export function figureKeyForMuscle(name: string): string | null {
  const key = muscleKey(name);
  if (DRAWN_MUSCLE_KEYS.has(key)) return key;
  for (const [canonical, aliases] of Object.entries(MUSCLE_ALIASES)) {
    if (DRAWN_MUSCLE_KEYS.has(canonical) && aliases.includes(key)) {
      return canonical;
    }
  }
  return null;
}

/** Muscles with sets that no figure path draws, largest first. */
export function unmappedMuscleSets(
  setsByMuscle: Record<string, number>
): { muscle: string; sets: number }[] {
  return Object.entries(setsByMuscle)
    .filter(([name, sets]) => sets > 0 && figureKeyForMuscle(name) === null)
    .map(([muscle, sets]) => ({ muscle, sets }))
    .sort((a, b) => b.sets - a.sets);
}

/** Buckets a set count into heat levels 0 (none) to 4 (most). */
export function heatLevel(count: number, max: number): number {
  if (count <= 0 || max <= 0) return 0;
  const t = count / max;
  if (t <= 0.25) return 1;
  if (t <= 0.5) return 2;
  if (t <= 0.75) return 3;
  return 4;
}

/** Which drawn body the heat map shows. Both use the same region classes. */
export type BodyFigure = 'male' | 'female';

/**
 * The figure to start on, from the gender stored for BMR. Only a stored
 * female picks the female figure; the choice on screen is never written
 * back to the profile.
 */
export function defaultBodyFigure(
  gender: string | null | undefined
): BodyFigure {
  return gender?.trim().toLowerCase() === 'female' ? 'female' : 'male';
}
