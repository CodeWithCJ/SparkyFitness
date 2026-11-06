/**
 * The first point of an episode's severity and impact timeline comes from the
 * `started_at` the client sent. PostgreSQL accepts forms that JavaScript reads
 * differently or not at all (a compact `20270625`, a time without an offset),
 * so every timeline time is stored the way PostgreSQL reads it, like the
 * points appended later.
 *
 * Skipped unless a test database is reachable.
 */

import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { endPool } from '../db/poolManager.js';
import symptomService from '../services/symptomService.js';

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

describe.runIf(RUN)(
  'timeline times are stored as PostgreSQL reads them',
  () => {
    let db: pg.Client;
    const userId = randomUUID();

    const stored = async (id: string) =>
      (
        await db.query(
          `SELECT started_at, impact, severity_timeline, impact_timeline
           FROM public.symptom_entries WHERE id = $1`,
          [id]
        )
      ).rows[0] as {
        started_at: Date;
        impact: string | null;
        severity_timeline: { at: string; severity: number }[];
        impact_timeline: { at: string; impact: string }[];
      };

    beforeAll(async () => {
      db = ownerClient();
      await db.connect();
      await db.query(
        'INSERT INTO public."user" (id, email, email_verified) VALUES ($1, $2, true)',
        [userId, `symptom-times-${userId}@example.test`]
      );
    });

    afterAll(async () => {
      await db.query('DELETE FROM public.symptom_entries WHERE user_id = $1', [
        userId,
      ]);
      await db.query('DELETE FROM public."user" WHERE id = $1', [userId]);
      await db.end();
      await endPool();
    });

    it.each(['20270625', '2027-06-25 08:00', '2027-06-25T08:00:00.000Z'])(
      'starts both timelines at the stored start for %s',
      async (startedAt) => {
        const entry = await symptomService.createEntry(userId, {
          symptom_name_snapshot: 'Migraine',
          severity: 5,
          impact: 'moderate',
          started_at: startedAt,
          // Sent by the client, so the day is not worked out from the start.
          entry_date: '2027-06-25',
        });
        const row = await stored(entry.id);
        const start = row.started_at.getTime();
        expect(Date.parse(row.severity_timeline[0]!.at)).toBe(start);
        expect(Date.parse(row.impact_timeline[0]!.at)).toBe(start);
      }
    );

    it('reads an older raw time the same way on the next change', async () => {
      const id = (
        await db.query(
          `INSERT INTO public.symptom_entries
           (user_id, symptom_name_snapshot, severity, peak_severity, impact,
            started_at, logged_at, entry_date, severity_timeline, impact_timeline)
         VALUES ($1, 'Migraine', 4, 4, 'mild', '2099-06-25', '2099-06-25',
                 '2099-06-25',
                 '[{"at": "20990625", "severity": 4}]',
                 '[{"at": "20990625", "impact": "mild"}]')
         RETURNING id`,
          [userId]
        )
      ).rows[0].id as string;

      await symptomService.updateEntry(userId, id, { impact: 'severe' });

      // The points keep their order, so the new reading stays last and matches
      // the current impact; only the old start time is read again.
      const row = await stored(id);
      expect(row.impact_timeline.map((p) => p.impact)).toEqual([
        'mild',
        'severe',
      ]);
      expect(row.impact).toBe('severe');
      expect(Date.parse(row.impact_timeline[0]!.at)).toBe(
        row.started_at.getTime()
      );
      expect(
        row.impact_timeline.every((p) => !Number.isNaN(Date.parse(p.at)))
      ).toBe(true);
    });
  }
);
