import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  vi,
} from 'vitest';
import { getClient, getSystemClient, endPool } from '../db/poolManager.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_SQL = readFileSync(
  path.join(
    here,
    '../db/migrations/20260909203000_deduplicate_strava_activity_details.sql'
  ),
  'utf8'
);

async function dbReachable(): Promise<boolean> {
  if (process.env.SKIP_RLS_MATRIX === '1') return false;
  if (
    !process.env.SPARKY_FITNESS_DB_HOST ||
    !process.env.SPARKY_FITNESS_APP_DB_USER
  )
    return false;
  // The migration is unscoped, so fixture IDs alone cannot protect a normal DB.
  if (!/(^|[_-])test([_-]|$)/i.test(process.env.SPARKY_FITNESS_DB_NAME ?? ''))
    return false;
  const probe = new pg.Client({
    host: process.env.SPARKY_FITNESS_DB_HOST,
    port: Number(process.env.SPARKY_FITNESS_DB_PORT) || 5432,
    database: process.env.SPARKY_FITNESS_DB_NAME,
    user: process.env.SPARKY_FITNESS_APP_DB_USER,
    password: process.env.SPARKY_FITNESS_APP_DB_PASSWORD,
    connectionTimeoutMillis: 2000,
  });
  try {
    await probe.connect();
    await probe.query(
      'SELECT id FROM public.exercise_entry_activity_details LIMIT 0'
    );
    return true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => {});
  }
}

const RUN = await dbReachable();
const OWNER = '00000000-0000-4000-b200-000000000001';
const OTHER = '00000000-0000-4000-b200-000000000002';
const EXERCISE = '00000000-0000-4000-b200-000000000003';
const ENTRY = '00000000-0000-4000-b200-000000000004';
const FOREIGN = '00000000-0000-4000-b200-000000000005';
const MANUAL = '00000000-0000-4000-b200-000000000006';
const PRESET = '00000000-0000-4000-b200-000000000007';
const LOW = '00000000-0000-4000-b200-000000000011';
const HIGH = '00000000-0000-4000-b200-000000000012';
const ENTRY_IDS = [ENTRY, FOREIGN, MANUAL];
const ACTIVITY = { id: 123456789, resource_state: 3, calories: 300 };

type Detail = {
  id: string;
  exercise_entry_id: string | null;
  exercise_preset_entry_id: string | null;
  provider_name: string;
  detail_type: string;
  detail_data: unknown;
  created_by_user_id: string | null;
  created_at: string | null;
  updated_at: string;
};

const SURVIVOR_CASES: [string, Partial<Detail>, Partial<Detail>, 0 | 1][] = [
  [
    'complete detail over a newer summary',
    {},
    { detail_data: { ...ACTIVITY, resource_state: 2 } },
    0,
  ],
  [
    'latest detail despite metadata edits',
    { updated_at: '2026-09-09' },
    { detail_data: { ...ACTIVITY, calories: 325 } },
    1,
  ],
  [
    'latest summary',
    { detail_data: { ...ACTIVITY, resource_state: 2 } },
    { detail_data: { ...ACTIVITY, resource_state: 2 } },
    1,
  ],
  [
    'UUID tie-break',
    { created_at: '2026-09-02', updated_at: '2026-09-09' },
    {},
    1,
  ],
  ['dated detail over an undated snapshot', { created_at: null }, {}, 1],
  [
    'UUID tie-break with no timestamps',
    { created_at: null },
    { created_at: null, detail_data: { ...ACTIVITY, id: String(ACTIVITY.id) } },
    1,
  ],
];

describe.runIf(RUN)('Strava activity detail cleanup migration', () => {
  let sys: pg.PoolClient;

  async function clearFixtures() {
    await sys.query(
      'DELETE FROM public.exercise_entries WHERE id = ANY($1::uuid[])',
      [ENTRY_IDS]
    );
    await sys.query(
      'DELETE FROM public.exercise_preset_entries WHERE id = $1',
      [PRESET]
    );
    await sys.query('DELETE FROM public.exercises WHERE id = $1', [EXERCISE]);
    await sys.query('DELETE FROM public."user" WHERE id = ANY($1::uuid[])', [
      [OWNER, OTHER],
    ]);
  }

  beforeAll(async () => {
    sys = await getSystemClient();
    await clearFixtures();
    for (const id of [OWNER, OTHER]) {
      await sys.query(
        'INSERT INTO public."user" (id, email, email_verified) VALUES ($1, $2, true)',
        [id, `strava-cleanup-${id}@example.test`]
      );
    }
    await sys.query(
      "INSERT INTO public.exercises (id, name, source, user_id, is_custom) VALUES ($1, 'Cleanup fixture', 'test', $2, true)",
      [EXERCISE, OWNER]
    );
    for (const [id, user, source] of [
      [ENTRY, OWNER, 'Strava'],
      [FOREIGN, OTHER, 'Strava'],
      [MANUAL, OWNER, 'manual'],
    ]) {
      await sys.query(
        `INSERT INTO public.exercise_entries
        (id, user_id, exercise_id, duration_minutes, calories_burned, source, source_id, entry_date)
        VALUES ($1, $2, $3, 30, 300, $4, '123456789', '2026-09-01')`,
        [id, user, EXERCISE, source]
      );
    }
    await sys.query(
      "INSERT INTO public.exercise_preset_entries (id, user_id, name, entry_date) VALUES ($1, $2, 'Cleanup fixture', '2026-09-01')",
      [PRESET, OWNER]
    );
    await sys.query(
      'INSERT INTO public.exercise_entry_sets (exercise_entry_id, set_number, duration) VALUES ($1, 1, 1800)',
      [ENTRY]
    );
    await sys.query(
      `INSERT INTO public.exercise_entry_laps (user_id, exercise_entry_id, entry_date, lap_index, start_time, end_time, duration_seconds, calories)
      VALUES ($1, $2, '2026-09-01', 1, '2026-09-01T01:00:00Z', '2026-09-01T01:30:00Z', 1800, 300)`,
      [OWNER, ENTRY]
    );
    await sys.query(
      `INSERT INTO public.exercise_entry_gps_points (user_id, exercise_entry_id, entry_date, points)
      VALUES ($1, $2, '2026-09-01', '[{"lat":1,"lng":2}]')`,
      [OWNER, ENTRY]
    );
  });

  afterEach(async () => {
    await sys.query('ROLLBACK');
    await sys.query(
      'DELETE FROM public.exercise_entry_activity_details WHERE exercise_entry_id = ANY($1::uuid[]) OR exercise_preset_entry_id = $2',
      [ENTRY_IDS, PRESET]
    );
  });
  afterAll(async () => {
    try {
      await clearFixtures();
    } finally {
      sys.release();
      await endPool();
    }
  });

  async function insertDetails(overrides: Partial<Detail>[], client = sys) {
    const ids: string[] = [];
    for (const override of overrides) {
      const row: Detail = {
        id: randomUUID(),
        exercise_entry_id: ENTRY,
        exercise_preset_entry_id: null,
        provider_name: 'Strava',
        detail_type: 'full_activity_data',
        detail_data: ACTIVITY,
        created_by_user_id: OWNER,
        created_at: '2026-09-01',
        updated_at: '2026-09-01',
        ...override,
      };
      await client.query(
        `INSERT INTO public.exercise_entry_activity_details
        (id, exercise_entry_id, exercise_preset_entry_id, provider_name, detail_type, detail_data, created_by_user_id, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)`,
        [
          row.id,
          row.exercise_entry_id,
          row.exercise_preset_entry_id,
          row.provider_name,
          row.detail_type,
          JSON.stringify(row.detail_data),
          row.created_by_user_id,
          row.created_at,
          row.updated_at,
        ]
      );
      ids.push(row.id);
    }
    return ids;
  }

  async function readRows(client = sys) {
    return (
      await client.query<{ id: string; row: Record<string, unknown> }>(
        'SELECT id, to_jsonb(d) AS row FROM public.exercise_entry_activity_details d WHERE exercise_entry_id = ANY($1::uuid[]) OR exercise_preset_entry_id = $2 ORDER BY id',
        [ENTRY_IDS, PRESET]
      )
    ).rows;
  }

  it.each(SURVIVOR_CASES)(
    'keeps %s and is idempotent',
    async (_name, first, second, keep) => {
      const ids = await insertDetails([
        { id: LOW, ...first },
        { id: HIGH, created_at: '2026-09-02', ...second },
      ]);
      const expected = (await readRows()).filter((row) => row.id === ids[keep]);
      await sys.query(MIGRATION_SQL);
      expect(await readRows()).toEqual(expected);
      await sys.query(MIGRATION_SQL);
      expect(await readRows()).toEqual(expected);
    }
  );

  it.each([
    ['wrapped JSON', JSON.stringify(ACTIVITY)],
    ['null', null],
    ['array', []],
    ['scalar', 42],
    ['missing ID', { resource_state: 3 }],
    ['zero ID', { ...ACTIVITY, id: 0 }],
    ['unknown ID', { ...ACTIVITY, id: 'unknown' }],
    ['mismatched ID', { ...ACTIVITY, id: 987654321 }],
    ['missing state', { id: ACTIVITY.id }],
    ['null state', { ...ACTIVITY, resource_state: null }],
    ['unknown state', { ...ACTIVITY, resource_state: 1 }],
    ['string state', { ...ACTIVITY, resource_state: '3' }],
  ])('preserves the whole group for %s', async (_name, detail_data) => {
    await insertDetails([{}, {}, { detail_data }]);
    const before = await readRows();
    await sys.query(MIGRATION_SQL);
    expect(await readRows()).toEqual(before);
  });

  it('preserves creator boundaries, other attachments, workout data and account visibility', async () => {
    const survivors: string[] = [];
    for (const [row, keep] of [
      [{}, 1],
      [{ created_by_user_id: OTHER }, 1],
      [{ exercise_entry_id: FOREIGN, created_by_user_id: OTHER }, 1],
      [{ created_by_user_id: null }, 2],
      [{ provider_name: 'Other' }, 2],
      [{ detail_type: 'other_detail' }, 2],
      [{ exercise_entry_id: MANUAL }, 2],
      [{ exercise_entry_id: null, exercise_preset_entry_id: PRESET }, 2],
    ] as const) {
      const ids = await insertDetails([
        row,
        { ...row, created_at: '2026-09-02' },
      ]);
      survivors.push(...ids.slice(-keep));
    }
    const before = await readRows();
    async function readWorkouts() {
      const result = [];
      for (const table of [
        'exercise_entries',
        'exercise_entry_sets',
        'exercise_entry_laps',
        'exercise_entry_gps_points',
      ] as const) {
        const key = table === 'exercise_entries' ? 'id' : 'exercise_entry_id';
        result.push(
          (
            await sys.query(
              `SELECT to_jsonb(r) FROM public.${table} r WHERE ${key} = ANY($1::uuid[]) ORDER BY id`,
              [ENTRY_IDS]
            )
          ).rows
        );
      }
      return result;
    }
    const workouts = await readWorkouts();
    const clients: pg.PoolClient[] = await Promise.all([
      getClient(OWNER),
      getClient(OTHER),
    ]);
    try {
      const visible = await Promise.all(
        clients.map((client) => readRows(client))
      );
      expect(
        visible[0].some((row) => row.row.exercise_entry_id === FOREIGN)
      ).toBe(false);
      await sys.query(MIGRATION_SQL);
      expect(await readRows()).toEqual(
        before.filter((row) => survivors.includes(row.id))
      );
      expect(await readWorkouts()).toEqual(workouts);
      for (const [index, client] of clients.entries()) {
        expect(await readRows(client)).toEqual(
          visible[index].filter((row) => survivors.includes(row.id))
        );
      }
    } finally {
      clients.forEach((client) => client.release());
    }
  });

  it('rolls back all deletions if the migration fails', async () => {
    await insertDetails([{}, {}]);
    const before = await readRows();
    const name = `strava_cleanup_${randomUUID().replaceAll('-', '')}`;
    await sys.query(
      `CREATE FUNCTION public.${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic cleanup rejection'; END $$`
    );
    try {
      await sys.query(
        `CREATE TRIGGER ${name} AFTER DELETE ON public.exercise_entry_activity_details FOR EACH ROW WHEN (OLD.exercise_entry_id = '${ENTRY}'::uuid) EXECUTE FUNCTION public.${name}()`
      );
      await expect(sys.query(MIGRATION_SQL)).rejects.toThrow(
        'synthetic cleanup rejection'
      );
      await sys.query('ROLLBACK');
      expect(await readRows()).toEqual(before);
    } finally {
      await sys.query('ROLLBACK');
      await sys.query(
        `DROP TRIGGER IF EXISTS ${name} ON public.exercise_entry_activity_details`
      );
      await sys.query(`DROP FUNCTION public.${name}()`);
    }
  });

  it('waits for an in-flight import and serializes cleanup without blocking readers', async () => {
    await insertDetails([{}, {}]);
    const writer: pg.PoolClient = await getSystemClient();
    const cleaners: pg.PoolClient[] = await Promise.all([
      getSystemClient(),
      getSystemClient(),
    ]);
    const pending: Promise<pg.QueryResult>[] = [];
    try {
      for (const client of [writer, ...cleaners])
        await client.query("SET statement_timeout = '10s'");
      const backends = await Promise.all(
        cleaners.map((client) =>
          client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
        )
      );
      const pids = backends.map((result) => result.rows[0].pid);
      await writer.query('BEGIN');
      await writer.query(
        'UPDATE public.exercise_entries SET notes = $1 WHERE id = $2',
        ['Concurrent import', ENTRY]
      );
      const newest = await insertDetails(
        [{ created_at: '2026-09-03' }],
        writer
      );
      pending.push(...cleaners.map((client) => client.query(MIGRATION_SQL)));
      // Handle query rejections even if the lock assertion fails first.
      const finished = Promise.allSettled(pending);
      await vi.waitFor(
        async () => {
          const result = await sys.query(
            'SELECT pid FROM pg_stat_activity WHERE pid = ANY($1::int[]) AND wait_event_type = $2',
            [pids, 'Lock']
          );
          expect(result.rowCount).toBe(2);
        },
        { timeout: 3000, interval: 20 }
      );
      expect(await readRows()).toHaveLength(2);
      await writer.query('COMMIT');
      expect(
        (await finished).every((result) => result.status === 'fulfilled')
      ).toBe(true);
      expect((await readRows()).map((row) => row.id)).toEqual(newest);
    } finally {
      await writer.query('ROLLBACK');
      await Promise.allSettled(pending);
      for (const client of [writer, ...cleaners]) {
        await client.query('ROLLBACK');
        await client.query('RESET statement_timeout');
        client.release();
      }
    }
  });
});
