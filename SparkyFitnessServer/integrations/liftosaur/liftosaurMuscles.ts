/**
 * Liftosaur exercise muscles.
 *
 * The liftohistory text that GET /api/v1/history returns carries exercise
 * names only, and the API has no exercise catalog endpoint. POST
 * /api/v1/program-stats does report muscles: given a program, it returns each
 * muscle group with the exercises that work it (`isSynergist: false` for a
 * target muscle, `true` for a synergist), already applying the user's own
 * muscle overrides from Liftosaur. Sending a one-day program that lists the
 * synced exercises therefore yields each exercise's muscles in Liftosaur's own
 * terms, which are then translated to the SparkyFitness vocabulary
 * (`CANONICAL_MUSCLES` in @workspace/shared).
 *
 * Behaviour verified against the live API:
 * - The response names exercises without the equipment suffix ("Bicep Curl"
 *   for "Bicep Curl, Cable"), so a request never holds two names that share a
 *   bare name; such names go into separate requests.
 * - An unknown exercise fails the whole request with 422 `parse_error` whose
 *   details name it (`type: "unknownExercise"`, `data.name`); those names are
 *   dropped and the request is retried once.
 *
 * Everything here is best effort and never throws: an exercise left without
 * muscles is asked about again on the next sync.
 */
import axios from 'axios';
import { z } from 'zod';
import { normalizeMuscle, type CanonicalMuscle } from '@workspace/shared';
import { log } from '../../config/logging.js';
import { logRawResponse } from '../../utils/diagnosticLogger.js';
import { describeError } from '../../utils/errors.js';
import { getValidatedLiftosaurBaseUrl } from './liftosaurTypes.js';

export interface MuscleMapping {
  primary: CanonicalMuscle[];
  secondary: CanonicalMuscle[];
}

/** Muscles per exercise, keyed by the exact Liftosaur exercise name. */
export type LiftosaurMuscleLookup = Map<string, MuscleMapping>;

/** Exercises per program-stats request. */
const BATCH_SIZE = 50;
const REQUEST_TIMEOUT_MS = 10000;

/**
 * Liftosaur muscle-group keys that the shared `normalizeMuscle` does not
 * already understand once camelCase is split ("frontDelts" -> "front delts").
 * `null` means SparkyFitness has no matching muscle and the group is dropped.
 */
const LIFTOSAUR_MUSCLE_ALIASES: Record<string, CanonicalMuscle | null> = {
  rotatorCuff: 'shoulders',
  upperTraps: 'traps',
  midTraps: 'traps',
  middleTraps: 'traps',
  lowerTraps: 'traps',
  forearmFlexors: 'forearms',
  forearmExtensors: 'forearms',
  hipFlexors: null,
};

const programStatsResponseSchema = z.object({
  data: z.object({
    muscleGroups: z.array(
      z.object({
        muscle: z.string(),
        exercises: z.array(
          z.object({
            name: z.string(),
            isSynergist: z.boolean().optional(),
          })
        ),
      })
    ),
  }),
});

export type LiftosaurProgramStats = z.infer<typeof programStatsResponseSchema>;

const parseErrorResponseSchema = z.object({
  error: z.object({
    code: z.string().optional(),
    details: z
      .array(
        z.object({
          type: z.string().optional(),
          data: z.object({ name: z.string().optional() }).optional(),
        })
      )
      .optional(),
  }),
});

/** Translate a Liftosaur muscle-group key to a SparkyFitness muscle. */
export function toSparkyMuscle(liftosaurKey: string): CanonicalMuscle | null {
  if (Object.hasOwn(LIFTOSAUR_MUSCLE_ALIASES, liftosaurKey)) {
    return LIFTOSAUR_MUSCLE_ALIASES[liftosaurKey] ?? null;
  }
  return normalizeMuscle(liftosaurKey.replace(/([a-z])([A-Z])/g, '$1 $2'));
}

/** "Seated Row, Leverage Machine" -> "seated row" */
function bareKey(name: string): string {
  return (name.split(',')[0] ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Names that cannot be written into a Liftoscript line without changing its
 * meaning ("/" separates sections, "#" starts a heading, braces open blocks).
 */
function isSafeProgramName(name: string): boolean {
  return name.trim() !== '' && !/[/#{}\r\n]/.test(name);
}

/** A one-day Liftoscript program listing each exercise once. */
export function buildProgramText(names: string[]): string {
  const lines = names.map((name) => `${name.trim()} / 3x5 / 100lb`);
  return ['# Week 1', '## Day 1', ...lines, ''].join('\n');
}

/**
 * Split names into request batches in which every bare name is unique, so a
 * response row ("Bicep Curl") maps back to exactly one requested name.
 */
export function batchNames(names: string[], size = BATCH_SIZE): string[][] {
  const batches: { names: string[]; bare: Set<string> }[] = [];
  for (const name of names) {
    const bare = bareKey(name);
    let batch = batches.find((b) => b.names.length < size && !b.bare.has(bare));
    if (!batch) {
      batch = { names: [], bare: new Set() };
      batches.push(batch);
    }
    batch.names.push(name);
    batch.bare.add(bare);
  }
  return batches.map((b) => b.names);
}

/**
 * Turn a program-stats response (muscle -> exercises) into exercise ->
 * muscles for the requested names. A muscle that is a target in one Liftosaur
 * group and a synergist in another (side delts vs front delts, both
 * "shoulders") stays primary only.
 */
export function invertProgramStats(
  stats: LiftosaurProgramStats,
  requestedNames: string[]
): LiftosaurMuscleLookup {
  const byBare = new Map(requestedNames.map((n) => [bareKey(n), n]));
  const collected = new Map<
    string,
    { primary: Set<CanonicalMuscle>; secondary: Set<CanonicalMuscle> }
  >();
  const unknownKeys = new Set<string>();

  for (const group of stats.data.muscleGroups) {
    const muscle = toSparkyMuscle(group.muscle);
    if (!muscle) {
      if (!Object.hasOwn(LIFTOSAUR_MUSCLE_ALIASES, group.muscle)) {
        unknownKeys.add(group.muscle);
      }
      continue;
    }
    for (const exercise of group.exercises) {
      const name = byBare.get(bareKey(exercise.name));
      if (!name) continue;
      let entry = collected.get(name);
      if (!entry) {
        entry = { primary: new Set(), secondary: new Set() };
        collected.set(name, entry);
      }
      (exercise.isSynergist ? entry.secondary : entry.primary).add(muscle);
    }
  }

  if (unknownKeys.size > 0) {
    log(
      'warn',
      `[liftosaurMuscles] Unmapped Liftosaur muscle groups dropped: ${[...unknownKeys].join(', ')}`
    );
  }

  const result: LiftosaurMuscleLookup = new Map();
  for (const [name, { primary, secondary }] of collected) {
    if (primary.size === 0) continue;
    result.set(name, {
      primary: [...primary],
      secondary: [...secondary].filter((m) => !primary.has(m)),
    });
  }
  return result;
}

/** Names a 422 parse error reports as unknown exercises. */
function unknownExerciseNames(body: unknown): string[] {
  const parsed = parseErrorResponseSchema.safeParse(body);
  if (!parsed.success) return [];
  return (parsed.data.error.details ?? [])
    .filter((d) => d.type === 'unknownExercise' && d.data?.name)
    .map((d) => d.data!.name!);
}

async function postProgramStats(
  apiKey: string,
  names: string[]
): Promise<{ status: number; body: unknown }> {
  const response = await axios.post(
    `${getValidatedLiftosaurBaseUrl()}/api/v1/program-stats`,
    { programText: buildProgramText(names) },
    {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: REQUEST_TIMEOUT_MS,
      validateStatus: (status) => status === 200 || status === 422,
    }
  );
  logRawResponse('liftosaur', 'raw_program_stats', response.data);
  return { status: response.status, body: response.data };
}

async function resolveBatch(
  apiKey: string,
  names: string[]
): Promise<LiftosaurMuscleLookup> {
  let pending = names;
  // One retry: the first 422 lists every unknown exercise in the program.
  for (let attempt = 0; attempt < 2 && pending.length > 0; attempt += 1) {
    const { status, body } = await postProgramStats(apiKey, pending);
    if (status === 200) {
      const parsed = programStatsResponseSchema.safeParse(body);
      if (!parsed.success) {
        log(
          'warn',
          `[liftosaurMuscles] Unexpected program-stats response shape: ${parsed.error.message}`
        );
        return new Map();
      }
      return invertProgramStats(parsed.data, pending);
    }
    const unknown = unknownExerciseNames(body);
    if (unknown.length === 0) break;
    log(
      'info',
      `[liftosaurMuscles] Liftosaur does not know ${unknown.join(', ')}; resolving muscles without them.`
    );
    // Bare names are unique within a batch, so matching on them also catches
    // an error that echoes the name without its equipment suffix.
    const unknownBare = new Set(unknown.map(bareKey));
    pending = pending.filter((n) => !unknownBare.has(bareKey(n)));
  }
  log(
    'warn',
    `[liftosaurMuscles] Liftosaur could not resolve muscles for: ${pending.join(', ')}`
  );
  return new Map();
}

/**
 * Ask Liftosaur which muscles each named exercise works. Returns only the
 * names it could resolve; never throws.
 */
export async function resolveLiftosaurMuscles(
  apiKey: string,
  names: string[]
): Promise<LiftosaurMuscleLookup> {
  const unique = [...new Set(names)];
  const safe = unique.filter(isSafeProgramName);
  if (safe.length < unique.length) {
    log(
      'debug',
      `[liftosaurMuscles] Skipping names that cannot go into a program: ${unique
        .filter((n) => !isSafeProgramName(n))
        .join(', ')}`
    );
  }

  const result: LiftosaurMuscleLookup = new Map();
  for (const batch of batchNames(safe)) {
    try {
      const resolved = await resolveBatch(apiKey, batch);
      for (const [name, muscles] of resolved) result.set(name, muscles);
    } catch (error) {
      log(
        'warn',
        `[liftosaurMuscles] program-stats request failed: ${describeError(error)}`
      );
    }
  }
  return result;
}

/** True when a stored muscle column (JSON text or array) holds no muscles. */
export function hasNoMuscles(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'string') {
    const compact = value.replace(/\s/g, '');
    return compact === '' || compact === '[]' || compact === 'null';
  }
  return false;
}
