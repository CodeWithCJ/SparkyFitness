/**
 * Optional feature choices (#3487) against a real database: what
 * `mergeFeatureChoices` stores for each platform, the 64-key cap checked on
 * each merged platform, concurrent changes, the column checks that keep
 * `cycle`, other shapes and unknown platforms out, the cleanup the migration
 * runs for databases that ran its first draft, and who can read the choices.
 *
 * Runs only against a database whose name marks it as a test database, like
 * the other integration tests.
 */
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
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

const MIGRATION = new URL(
  '../db/migrations/20261113090000_add_user_feature_choices.sql',
  import.meta.url
);

function keys(count: number, prefix = 'feature') {
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => [`${prefix}${index}`, true])
  );
}

type Stored = {
  web?: Record<string, boolean>;
  mobile?: Record<string, boolean>;
};

describe.runIf(RUN)('feature choices storage', () => {
  let db: pg.Client;
  let gate: pg.Client;
  // What a new preferences row holds before any test writes to it.
  let newRowChoices: unknown;
  const userId = randomUUID();
  const userWithoutPreferences = randomUUID();
  const stranger = randomUUID();
  const delegate = randomUUID();
  const legacyDelegate = randomUUID();

  const stored = async () =>
    (
      await db.query(
        'SELECT feature_choices FROM public.user_preferences WHERE user_id = $1',
        [userId]
      )
    ).rows[0].feature_choices as Stored;

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
      [stranger, 'stranger'],
      [delegate, 'delegate'],
      [legacyDelegate, 'legacy-delegate'],
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
    // A grant that covers the person's settings, and one with only a legacy
    // key: switching into the account accepts it, but row-level security on
    // user_preferences does not.
    for (const [id, permissions] of [
      [delegate, { can_manage_diary: true }],
      [legacyDelegate, { reports: true, can_manage_diary: false }],
    ] as const) {
      await db.query(
        `INSERT INTO public.family_access
           (owner_user_id, family_user_id, family_email, access_permissions, is_active, status)
         VALUES ($1, $2, $3, $4::jsonb, true, 'active')`,
        [userId, id, `${id}@example.test`, JSON.stringify(permissions)]
      );
    }
  });

  beforeEach(() => setStored('{}'));

  afterAll(async () => {
    await db.query(
      'DELETE FROM public.family_access WHERE owner_user_id = $1',
      [userId]
    );
    await db.query('DELETE FROM public."user" WHERE id = ANY($1::uuid[])', [
      [userId, userWithoutPreferences, stranger, delegate, legacyDelegate],
    ]);
    await db.end();
    await gate.end();
    await endPool();
  });

  it('starts empty: a missing platform or key means the default', () => {
    expect(newRowChoices).toEqual({});
  });

  it('changes only the platform and keys sent, and resets a key sent as null', async () => {
    expect(
      await preferenceRepository.mergeFeatureChoices(userId, {
        web: { labResults: false, medications: true },
      })
    ).toEqual({
      status: 'ok',
      choices: { web: { labResults: false, medications: true }, mobile: {} },
    });

    // The other platform keeps its choices; a key left out keeps its value;
    // null removes the key, so the default applies again; null for a key that
    // was never stored adds nothing.
    await preferenceRepository.mergeFeatureChoices(userId, {
      mobile: { labResults: false },
    });
    expect(
      await preferenceRepository.mergeFeatureChoices(userId, {
        web: { medications: null, futureFeature: null, alcohol: false },
      })
    ).toEqual({
      status: 'ok',
      choices: {
        web: { labResults: false, alcohol: false },
        mobile: { labResults: false },
      },
    });
    expect(await stored()).toEqual({
      web: { labResults: false, alcohol: false },
      mobile: { labResults: false },
    });
  });

  it(`refuses a merge that would leave a platform with more than ${MAX_FEATURE_CHOICES} keys and leaves the row as it was`, async () => {
    await setStored(JSON.stringify({ web: keys(MAX_FEATURE_CHOICES) }));

    expect(
      await preferenceRepository.mergeFeatureChoices(userId, {
        web: { extra: true },
      })
    ).toEqual({ status: 'tooMany' });
    expect(Object.keys((await stored()).web ?? {})).toHaveLength(
      MAX_FEATURE_CHOICES
    );
    expect((await stored()).web).not.toHaveProperty('extra');

    // The cap is per platform, and applies to the merged result: at the cap,
    // the other platform still takes choices, and changing a stored key or
    // swapping one for another is fine.
    const otherPlatform = await preferenceRepository.mergeFeatureChoices(
      userId,
      { mobile: { extra: true } }
    );
    expect(otherPlatform.status).toBe('ok');
    const changed = await preferenceRepository.mergeFeatureChoices(userId, {
      web: { feature0: false },
    });
    expect(changed.status).toBe('ok');
    const swapped = await preferenceRepository.mergeFeatureChoices(userId, {
      web: { feature1: null, extra: true },
    });
    expect(swapped.status).toBe('ok');
    const after = await stored();
    expect(Object.keys(after.web ?? {})).toHaveLength(MAX_FEATURE_CHOICES);
    expect(after.web).toMatchObject({ feature0: false, extra: true });
    expect(after.mobile).toEqual({ extra: true });
  });

  it('never lets two patches sent at once pass the cap together', async () => {
    await setStored(JSON.stringify({ web: keys(MAX_FEATURE_CHOICES - 1) }));

    // Both updates read the row before either writes, so a merge that checks
    // the cap on what it read, not on the row it locks, lets both through.
    const [first, second] = await raceWrites(gate, db, 'user_preferences', [
      () =>
        preferenceRepository.mergeFeatureChoices(userId, {
          web: { first: true },
        }),
      () =>
        preferenceRepository.mergeFeatureChoices(userId, {
          web: { second: true },
        }),
    ]);

    expect([first.status, second.status].sort()).toEqual(['ok', 'tooMany']);
    const [kept, refused] =
      first.status === 'ok' ? ['first', 'second'] : ['second', 'first'];
    const after = (await stored()).web ?? {};
    expect(Object.keys(after)).toHaveLength(MAX_FEATURE_CHOICES);
    expect(after).toHaveProperty(kept, true);
    expect(after).not.toHaveProperty(refused);
  });

  it('keeps both of two changes sent at once from different devices', async () => {
    // A merge that worked from a separate read of the row would write back
    // what it read, and the second change would undo the first.
    const results = await raceWrites(gate, db, 'user_preferences', [
      () =>
        preferenceRepository.mergeFeatureChoices(userId, {
          web: { labResults: false },
        }),
      () =>
        preferenceRepository.mergeFeatureChoices(userId, {
          mobile: { medications: false },
        }),
    ]);

    expect(results.map((result) => result.status)).toEqual(['ok', 'ok']);
    expect(await stored()).toEqual({
      web: { labResults: false },
      mobile: { medications: false },
    });
  });

  it('reports a missing preferences row instead of writing anywhere', async () => {
    expect(
      await preferenceRepository.mergeFeatureChoices(userWithoutPreferences, {
        web: { labResults: false },
      })
    ).toEqual({ status: 'noRow' });
  });

  it('keeps cycle, unknown platforms and other shapes out of the column', async () => {
    await expect(
      preferenceRepository.mergeFeatureChoices(userId, {
        mobile: { cycle: true },
      })
    ).rejects.toMatchObject({ code: '23514' });
    for (const value of [
      '{"web": {"cycle": false}}',
      '{"labResults": false}',
      '{"watch": {}}',
      '{"web": []}',
      '{"mobile": true}',
      '[]',
    ]) {
      await expect(setStored(value)).rejects.toMatchObject({ code: '23514' });
    }
    expect(await stored()).toEqual({});
  });

  it('lets the person and someone acting for them read the choices, and nobody without access', async () => {
    await setStored('{"web": {"labResults": false}}');
    expect(
      await preferenceRepository.getFeatureChoices(userId, userId)
    ).toEqual({ web: { labResults: false } });
    expect(
      await preferenceRepository.getFeatureChoices(userId, delegate)
    ).toEqual({ web: { labResults: false } });
    // The service answers this one with a 403, never with "no choices".
    expect(
      await preferenceRepository.getFeatureChoices(userId, legacyDelegate)
    ).toBeNull();
    expect(
      await preferenceRepository.getFeatureChoices(userId, stranger)
    ).toBeNull();
    expect(
      await preferenceRepository.getFeatureChoices(
        userWithoutPreferences,
        userWithoutPreferences
      )
    ).toBeNull();
  });

  it('resets choices of another shape when the migration runs again (databases that ran its first draft)', async () => {
    const sql = await readFile(MIGRATION, 'utf8');
    await db.query('BEGIN');
    try {
      await db.query(
        'ALTER TABLE public.user_preferences DROP CONSTRAINT user_preferences_feature_choices_platforms'
      );
      await setStored('{"labResults": false}');
      await db.query(sql);
      expect(await stored()).toEqual({});
      // The checks are back.
      await expect(setStored('{"labResults": false}')).rejects.toMatchObject({
        code: '23514',
      });
    } finally {
      await db.query('ROLLBACK');
    }
  });
});
