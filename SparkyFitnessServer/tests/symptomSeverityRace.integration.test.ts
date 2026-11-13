/**
 * A severity or impact change on an episode adds a reading to its timeline.
 * Two updates that overlap (a phone retry and a watch, or two people with
 * access) must both keep their reading, and a retry of the same reading must
 * not add it twice. A quick log's peak must end up at its value.
 *
 * Skipped unless a test database is reachable, since the tests briefly lock
 * the whole symptom_entries table.
 */

import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { endPool } from '../db/poolManager.js';
import symptomService from '../services/symptomService.js';
import { raceWrites } from './helpers/raceGate.js';

function ownerClient() {
  return new pg.Client({
    host: process.env.SPARKY_FITNESS_DB_HOST,
    port: Number(process.env.SPARKY_FITNESS_DB_PORT) || 5432,
    database: process.env.SPARKY_FITNESS_DB_NAME,
    user: process.env.SPARKY_FITNESS_DB_USER,
    password: process.env.SPARKY_FITNESS_DB_PASSWORD,
    connectionTimeoutMillis: 2000,
  });
}

async function isDbReachable(): Promise<boolean> {
  if (process.env.SKIP_RLS_MATRIX === '1') return false;
  if (!process.env.SPARKY_FITNESS_DB_HOST) return false;
  // These tests briefly lock whole tables, so only run against a test database.
  if (!/(^|[_-])test([_-]|$)/i.test(process.env.SPARKY_FITNESS_DB_NAME ?? ''))
    return false;
  const probe = ownerClient();
  try {
    await probe.connect();
    await probe.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => {});
  }
}

const RUN = await isDbReachable();

describe.runIf(RUN)('overlapping severity updates to one episode', () => {
  let db: pg.Client;
  let gate: pg.Client;
  const userId = randomUUID();

  const insertEpisode = async () =>
    (
      await db.query(
        `INSERT INTO public.symptom_entries
           (user_id, symptom_name_snapshot, severity, peak_severity,
            started_at, logged_at, entry_date, severity_timeline)
         VALUES ($1, 'Migraine', 4, 4, '2026-09-20T08:00:00Z',
                 '2026-09-20T08:00:00Z', '2026-09-20',
                 '[{"at": "2026-09-20T08:00:00.000Z", "severity": 4}]')
         RETURNING id`,
        [userId]
      )
    ).rows[0].id as string;

  const insertQuickLog = async () =>
    (
      await db.query(
        `INSERT INTO public.symptom_entries
           (user_id, symptom_name_snapshot, severity, peak_severity,
            logged_at, entry_date)
         VALUES ($1, 'Headache', 3, 3, '2026-09-20T08:00:00Z', '2026-09-20')
         RETURNING id`,
        [userId]
      )
    ).rows[0].id as string;

  const episode = async (id: string) => {
    const row = (
      await db.query(
        `SELECT severity::float AS severity, peak_severity::float AS peak,
                severity_timeline
         FROM public.symptom_entries WHERE id = $1`,
        [id]
      )
    ).rows[0];
    return {
      severity: row.severity,
      peak: row.peak,
      readings: (row.severity_timeline as { severity: number }[]).map(
        (point) => point.severity
      ),
    };
  };

  beforeAll(async () => {
    db = ownerClient();
    await db.connect();
    gate = ownerClient();
    await gate.connect();
    await db.query(
      'INSERT INTO public."user" (id, email, email_verified) VALUES ($1, $2, true)',
      [userId, `symptom-race-${userId}@example.test`]
    );
  });

  afterAll(async () => {
    await db.query('DELETE FROM public.symptom_entries WHERE user_id = $1', [
      userId,
    ]);
    await db.query('DELETE FROM public."user" WHERE id = $1', [userId]);
    await db.end();
    await gate.end();
    await endPool();
  });

  it('keeps both readings of two overlapping changes', async () => {
    const id = await insertEpisode();

    await raceWrites(gate, db, 'symptom_entries', [
      () => symptomService.updateEntry(userId, id, { severity: 7 }),
      () => symptomService.updateEntry(userId, id, { severity: 2 }),
    ]);

    const result = await episode(id);
    expect(result.readings.slice(0, 1)).toEqual([4]);
    expect([...result.readings.slice(1)].sort()).toEqual([2, 7]);
    expect(result.readings.at(-1)).toBe(result.severity);
    expect(result.peak).toBe(7);
  });

  it('keeps both impact readings of two overlapping changes', async () => {
    const id = await insertEpisode();

    await raceWrites(gate, db, 'symptom_entries', [
      () => symptomService.updateEntry(userId, id, { impact: 'mild' }),
      () => symptomService.updateEntry(userId, id, { impact: 'severe' }),
    ]);

    const { impact, impact_timeline: timeline } = (
      await db.query(
        'SELECT impact, impact_timeline FROM public.symptom_entries WHERE id = $1',
        [id]
      )
    ).rows[0] as { impact: string; impact_timeline: { impact: string }[] };
    expect(timeline.map((point) => point.impact).sort()).toEqual([
      'mild',
      'severe',
    ]);
    expect(timeline.at(-1)?.impact).toBe(impact);
  });

  it('records a retried reading once', async () => {
    const id = await insertEpisode();

    await raceWrites(gate, db, 'symptom_entries', [
      () => symptomService.updateEntry(userId, id, { severity: 6 }),
      () => symptomService.updateEntry(userId, id, { severity: 6 }),
    ]);

    expect(await episode(id)).toEqual({
      severity: 6,
      peak: 6,
      readings: [4, 6],
    });
  });

  it('keeps the peak of the whole episode when the severity falls', async () => {
    const id = await insertEpisode();

    await symptomService.updateEntry(userId, id, { severity: 9 });
    await symptomService.updateEntry(userId, id, { severity: 3 });
    await symptomService.updateEntry(userId, id, { severity: 3 });

    expect(await episode(id)).toEqual({
      severity: 3,
      peak: 9,
      readings: [4, 9, 3],
    });
  });

  // A quick log has no timeline: its peak is its value. One of two overlapping
  // edits sends the value both read as stored, so a peak decided from that
  // read is skipped whenever that edit commits second. Which commits first is
  // up to PostgreSQL, so several rounds make the bad order all but certain.
  it('keeps a quick log peak at its value after overlapping edits', async () => {
    for (let round = 0; round < 8; round += 1) {
      const id = await insertQuickLog();

      await raceWrites(gate, db, 'symptom_entries', [
        () => symptomService.updateEntry(userId, id, { severity: 5 }),
        () => symptomService.updateEntry(userId, id, { severity: 3 }),
      ]);

      const result = await episode(id);
      expect([3, 5]).toContain(result.severity);
      expect(result.peak).toBe(result.severity);
      expect(result.readings).toEqual([]);
    }
  });

  it('moves a quick log peak with its value', async () => {
    const id = await insertQuickLog();

    await symptomService.updateEntry(userId, id, { severity: 8 });
    expect(await episode(id)).toEqual({ severity: 8, peak: 8, readings: [] });
    await symptomService.updateEntry(userId, id, { severity: 2 });
    expect(await episode(id)).toEqual({ severity: 2, peak: 2, readings: [] });
  });
});
