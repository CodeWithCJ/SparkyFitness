// Read-only report: lists stored exercise entries that look like the same
// workout imported twice (#2839), for a person to review and delete by hand.
// It never changes or deletes anything. Uses the same rules as the import-time
// check (services/workoutDuplicateDetection.ts); manual entries are listed as
// overlaps only.
//
// Usage (from SparkyFitnessServer/):
//   pnpm exec tsx scripts/reportDuplicateWorkouts.script.ts --start=2026-10-01 --end=2026-10-31
//   pnpm exec tsx scripts/reportDuplicateWorkouts.script.ts --user=<user id> --start=2026-01-01
//   add --json for machine-readable output

import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { addDays, todayInZone } from '@workspace/shared';
import { loadSecrets } from '../utils/secretLoader.js';
import { endPool, getSystemClient } from '../db/poolManager.js';
import { log } from '../config/logging.js';
import { findWorkoutDedupeCandidates } from '../models/workoutDuplicateRepository.js';
import {
  classifyIncomingWorkout,
  type DuplicateMetrics,
  type WorkoutSummary,
} from '../services/workoutDuplicateDetection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface ReportedPair {
  user_id: string;
  kind: 'synced-pair' | 'overlaps-manual';
  suggested_keep: string;
  suggested_review: string;
  entries: ReturnType<typeof summarize>[];
  metrics: DuplicateMetrics;
}

function parseArgs() {
  const value = (name: string) =>
    process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
  return {
    userId: value('user'),
    startDate: value('start'),
    endDate: value('end'),
    json: process.argv.includes('--json'),
  };
}

const summarize = (w: WorkoutSummary) => ({
  id: w.id,
  source: w.source,
  sourceId: w.sourceId,
  activity: w.activity,
  start: w.startMs === null ? null : new Date(w.startMs).toISOString(),
  durationMinutes: Math.round(w.durationMinutes * 10) / 10,
  distanceKm: w.distanceKm,
  steps: w.steps,
  avgHeartRate: w.avgHeartRate,
  maxHeartRate: w.maxHeartRate,
  completeness: w.completeness,
});

/** Each entry against the ones that started before it, so a pair is reported once. */
export function findStoredDuplicatePairs(
  userId: string,
  entries: WorkoutSummary[]
): ReportedPair[] {
  const sorted = entries
    .filter((e) => e.startMs !== null)
    .sort((a, b) => (a.startMs as number) - (b.startMs as number));
  const pairs: ReportedPair[] = [];
  sorted.forEach((later, i) => {
    if (later.isManual || !later.sourceId) return;
    for (const earlier of sorted.slice(0, i)) {
      const decision = classifyIncomingWorkout({ ...later, id: undefined }, [
        earlier,
      ]);
      if (decision.kind === 'none' || decision.kind === 'resync') continue;
      // A manual entry is always the one to keep; otherwise the more complete.
      const [keep, review] =
        decision.kind === 'replace-existing'
          ? [later, earlier]
          : [earlier, later];
      pairs.push({
        user_id: userId,
        kind:
          decision.kind === 'manual-overlap'
            ? 'overlaps-manual'
            : 'synced-pair',
        suggested_keep: keep.id as string,
        suggested_review: review.id as string,
        entries: [summarize(earlier), summarize(later)],
        metrics: decision.metrics,
      });
    }
  });
  return pairs;
}

async function run() {
  const args = parseArgs();
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });
  loadSecrets();

  // The owner connection, like the other maintenance scripts: the app role's
  // password may only exist inside the running server. Every query below
  // filters by user explicitly.
  const system = await getSystemClient();
  const pairs: ReportedPair[] = [];
  try {
    const users = args.userId
      ? { rows: [{ user_id: args.userId }] }
      : await system.query(
          `SELECT DISTINCT user_id FROM exercise_entries
            WHERE ($1::date IS NULL OR entry_date >= $1)
              AND ($2::date IS NULL OR entry_date <= $2)`,
          [args.startDate ?? null, args.endDate ?? null]
        );
    for (const { user_id: userId } of users.rows as { user_id: string }[]) {
      const pref = await system.query(
        'SELECT timezone FROM user_preferences WHERE user_id = $1',
        [userId]
      );
      const tz: string = pref.rows[0]?.timezone || 'UTC';
      const end = args.endDate ?? todayInZone(tz);
      const start = args.startDate ?? addDays(end, -30);
      const entries = await findWorkoutDedupeCandidates(
        userId,
        start,
        end,
        tz,
        system
      );
      pairs.push(...findStoredDuplicatePairs(userId, entries));
    }
  } finally {
    system.release();
  }

  if (args.json) {
    process.stdout.write(`${JSON.stringify(pairs, null, 2)}\n`);
  } else {
    const line = (e: ReturnType<typeof summarize>) =>
      `  ${e.start}  ${e.activity}  ${e.durationMinutes} min  ${e.distanceKm ?? '-'} km  ${e.steps ?? '-'} steps  ` +
      `HR ${e.avgHeartRate ?? '-'}/${e.maxHeartRate ?? '-'}  completeness ${e.completeness}  ` +
      `${e.source}/${e.sourceId ?? '-'}  entry ${e.id}\n`;
    for (const p of pairs) {
      const [a, b] = p.entries;
      process.stdout.write(
        `${p.kind}  user ${p.user_id}\n` +
          line(a) +
          line(b) +
          `  overlap ${(p.metrics.overlapRatio * 100).toFixed(1)}%  agreeing: ${p.metrics.agreeing.join(', ')}  ` +
          `keep ${p.suggested_keep}, review ${p.suggested_review}\n\n`
      );
    }
    process.stdout.write(
      `${pairs.length} probable duplicate pair(s). Nothing was changed.\n`
    );
  }
  await endPool();
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  run().catch((err) => {
    log('error', '[reportDuplicateWorkouts] Fatal error:', err);
    process.exitCode = 1;
  });
}
