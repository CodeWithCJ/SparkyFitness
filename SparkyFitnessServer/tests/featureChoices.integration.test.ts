/**
 * Optional feature choices (#3487) against a real database: what
 * `mergeFeatureChoices` stores, the 64-key cap checked on the merged result,
 * and the column checks that keep `cycle` and non-objects out.
 *
 * Runs only against a database whose name marks it as a test database, like
 * the other integration tests.
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MAX_FEATURE_CHOICES } from '@workspace/shared';
import { endPool } from '../db/poolManager.js';
import preferenceRepository from '../models/preferenceRepository.js';
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

function keys(count: number, prefix = 'feature') {
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => [`${prefix}${index}`, true])
  );
}

describe.runIf(RUN)('feature choices storage', () => {
  let db: pg.Client;
  let gate: pg.Client;
  // What a new preferences row holds before any test writes to it.
  let newRowChoices: unknown;
  const userId = randomUUID();
  const userWithoutPreferences = randomUUID();

  const stored = async () =>
    (
      await db.query(
        'SELECT feature_choices FROM public.user_preferences WHERE user_id = $1',
        [userId]
      )
    ).rows[0].feature_choices as Record<string, boolean>;

  const setStored = (value: string) =>
    db.query(
      'UPDATE public.user_preferences SET feature_choices = $2::jsonb WHERE user_id = $1',
      [userId, value]
    );

  beforeAll(async () => {
    db = ownerClient();
    await db.connect();
    gate = ownerClient();
    await gate.connect();
    for (const [id, tag] of [
      [userId, 'features'],
      [userWithoutPreferences, 'no-preferences'],
    ]) {
      await db.query(
        'INSERT INTO public."user" (id, email, email_verified) VALUES ($1, $2, true)',
        [id, `${tag}-${id}@example.test`]
      );
    }
    await db.query(
      'INSERT INTO public.user_preferences (user_id) VALUES ($1)',
      [userId]
    );
    newRowChoices = await stored();
  });

  beforeEach(() => setStored('{}'));

  afterAll(async () => {
    await db.query('DELETE FROM public."user" WHERE id = ANY($1::uuid[])', [
      [userId, userWithoutPreferences],
    ]);
    await db.end();
    await gate.end();
    await endPool();
  });

  it('starts empty: a missing key means the default', () => {
    expect(newRowChoices).toEqual({});
  });

  it('changes only the keys sent and resets a key sent as null', async () => {
    expect(
      await preferenceRepository.mergeFeatureChoices(userId, {
        labResults: false,
        medications: true,
      })
    ).toEqual({
      status: 'ok',
      choices: { labResults: false, medications: true },
    });

    // A key left out keeps its value; null removes the key, so the default
    // applies again; null for a key that was never stored adds nothing.
    expect(
      await preferenceRepository.mergeFeatureChoices(userId, {
        medications: null,
        futureFeature: null,
        alcohol: false,
      })
    ).toEqual({
      status: 'ok',
      choices: { labResults: false, alcohol: false },
    });
    expect(await stored()).toEqual({ labResults: false, alcohol: false });
  });

  it(`refuses a merge that would hold more than ${MAX_FEATURE_CHOICES} keys and leaves the row as it was`, async () => {
    await setStored(JSON.stringify(keys(MAX_FEATURE_CHOICES)));

    expect(
      await preferenceRepository.mergeFeatureChoices(userId, { extra: true })
    ).toEqual({ status: 'tooMany' });
    expect(Object.keys(await stored())).toHaveLength(MAX_FEATURE_CHOICES);
    expect(await stored()).not.toHaveProperty('extra');

    // At the cap, changing a stored key or swapping one for another is fine,
    // because the limit applies to the merged result.
    const changed = await preferenceRepository.mergeFeatureChoices(userId, {
      feature0: false,
    });
    expect(changed.status).toBe('ok');
    const swapped = await preferenceRepository.mergeFeatureChoices(userId, {
      feature1: null,
      extra: true,
    });
    expect(swapped.status).toBe('ok');
    expect(Object.keys(await stored())).toHaveLength(MAX_FEATURE_CHOICES);
    expect(await stored()).toMatchObject({ feature0: false, extra: true });
  });

  it('never lets two patches sent at once pass the cap together', async () => {
    await setStored(JSON.stringify(keys(MAX_FEATURE_CHOICES - 1)));

    // Both updates read the row before either writes, so a merge that checks
    // the cap on what it read, not on the row it locks, lets both through.
    const [first, second] = await raceWrites(gate, db, 'user_preferences', [
      () => preferenceRepository.mergeFeatureChoices(userId, { first: true }),
      () => preferenceRepository.mergeFeatureChoices(userId, { second: true }),
    ]);

    expect([first.status, second.status].sort()).toEqual(['ok', 'tooMany']);
    const [kept, refused] =
      first.status === 'ok' ? ['first', 'second'] : ['second', 'first'];
    const after = await stored();
    expect(Object.keys(after)).toHaveLength(MAX_FEATURE_CHOICES);
    expect(after).toHaveProperty(kept, true);
    expect(after).not.toHaveProperty(refused);
  });

  it('reports a missing preferences row instead of writing anywhere', async () => {
    expect(
      await preferenceRepository.mergeFeatureChoices(userWithoutPreferences, {
        labResults: false,
      })
    ).toEqual({ status: 'noRow' });
  });

  it('keeps cycle and anything but an object out of the column', async () => {
    await expect(
      preferenceRepository.mergeFeatureChoices(userId, { cycle: true })
    ).rejects.toMatchObject({ code: '23514' });
    await expect(setStored('{"cycle": false}')).rejects.toMatchObject({
      code: '23514',
    });
    await expect(setStored('[]')).rejects.toMatchObject({ code: '23514' });
    expect(await stored()).toEqual({});
  });
});
