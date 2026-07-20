/**
 * RLS permission matrix — integration test.
 *
 * WHY THIS EXISTS
 * ---------------
 * Row-Level Security is enforced *inside Postgres*, so it cannot be unit-tested
 * with a mocked pool (the rest of the suite mocks `db/poolManager.js`, which
 * bypasses RLS entirely). This test runs against a REAL Postgres, connecting as
 * the non-superuser app role via `getClient(...)` (RLS enforced) and seeding via
 * `getSystemClient()` (superuser, RLS bypassed). It pins the two layers that
 * historically drifted:
 *
 *   Part A — policy wiring: every table's policy references the EXPECTED helper
 *            (catches "checkin table wired to the diary policy" misclassification).
 *   Part B — helper behavior: each RLS helper returns the EXPECTED allow/deny per
 *            permission (catches logic regressions, e.g. removing dead key variants).
 *
 * HOW TO RUN
 * ----------
 * It runs automatically whenever a database is actually reachable — locally as
 * part of `pnpm test` (creds from ../.env) and in the CI migration-check job —
 * so RLS regressions are caught before a PR. It uses the same DB env the server
 * uses (SPARKY_FITNESS_DB_* and SPARKY_FITNESS_APP_DB_*), pointed at a database
 * with the schema + `db/rls_policies.sql` applied (the server applies these on
 * boot). It seeds and deletes only its own synthetic `@example.test` users, but
 * still — do NOT point it at production data.
 *
 * The gate below does a real, short-timeout connection probe (not just an env
 * check), so it SKIPS cleanly when the database is missing OR not running — the
 * mocked unit suite, a contributor without a DB, or a stopped local Postgres —
 * instead of failing to connect. Set SKIP_RLS_MATRIX=1 to force-skip even when
 * a database is up.
 */
import pg from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getClient, getSystemClient, endPool } from '../db/poolManager.js';

// Probe the app role RLS actually needs, with a short timeout, using a
// standalone client (NOT the shared pools, whose error handler calls
// process.exit). Returns false on any failure so the suite skips rather than
// erroring when no DB is reachable.
async function rlsTestDbReachable(): Promise<boolean> {
  if (process.env.SKIP_RLS_MATRIX === '1') return false;
  if (
    !process.env.SPARKY_FITNESS_APP_DB_USER ||
    !process.env.SPARKY_FITNESS_DB_HOST
  ) {
    return false;
  }
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
    await probe.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => {});
  }
}

const RUN = await rlsTestDbReachable();

// Stable, namespaced UUIDs so cleanup is unambiguous.
const OWNER = '00000000-0000-4000-a000-0000000000ff';
const D = {
  diary: '00000000-0000-4000-a000-000000000001',
  checkin: '00000000-0000-4000-a000-000000000002',
  meds: '00000000-0000-4000-a000-000000000003',
  reports: '00000000-0000-4000-a000-000000000004',
  foodlib: '00000000-0000-4000-a000-000000000005',
  exlib: '00000000-0000-4000-a000-000000000006',
  none: '00000000-0000-4000-a000-000000000007',
} as const;

type DelegateKey = keyof typeof D;

const PERMS: Record<DelegateKey, Record<string, boolean>> = {
  diary: { can_manage_diary: true },
  checkin: { can_manage_checkin: true },
  meds: { can_manage_medications: true },
  reports: { can_view_reports: true },
  foodlib: { can_view_food_library: true },
  exlib: { can_view_exercise_library: true },
  none: {},
};

const ALL_IDS = [OWNER, ...Object.values(D)];

describe.runIf(RUN)('RLS permission matrix', () => {
  beforeAll(async () => {
    const sys = await getSystemClient();
    try {
      // Idempotent clean slate (cascades remove family_access).
      await sys.query('DELETE FROM public."user" WHERE id = ANY($1::uuid[])', [
        ALL_IDS,
      ]);
      for (const id of ALL_IDS) {
        await sys.query(
          'INSERT INTO public."user" (id, email, email_verified) VALUES ($1, $2, true) ON CONFLICT (id) DO NOTHING',
          [id, `rls-matrix-${id}@example.test`]
        );
      }
      for (const key of Object.keys(D) as DelegateKey[]) {
        await sys.query(
          `INSERT INTO public.family_access
             (owner_user_id, family_user_id, family_email, access_permissions, is_active, status)
           VALUES ($1, $2, $3, $4::jsonb, true, 'active')`,
          [
            OWNER,
            D[key],
            `rls-matrix-${key}@example.test`,
            JSON.stringify(PERMS[key]),
          ]
        );
      }
    } finally {
      sys.release();
    }
  });

  afterAll(async () => {
    const sys = await getSystemClient();
    try {
      await sys.query('DELETE FROM public."user" WHERE id = ANY($1::uuid[])', [
        ALL_IDS,
      ]);
    } finally {
      sys.release();
    }
    await endPool();
  });

  // ---------------------------------------------------------------------------
  // Part A — policy wiring. Asserts EVERY RLS-enabled table is classified into a
  // domain, and that each table's policies reference the expected helper.
  //
  // DOMAIN below is the single source of truth: every one of the RLS-enabled
  // tables must appear exactly once. The completeness test fails if the database
  // has an RLS table missing from this map (a new table nobody classified) or a
  // map entry that is no longer RLS-enabled — so this list cannot silently rot.
  //
  // Generic helper-policy domains (diary/checkin/medication/library) get their
  // expected helper asserted automatically. `custom` tables have bespoke,
  // hand-written policies; the well-known ones are pinned explicitly below, the
  // rest are only required to *exist* (no unprotected table).
  // ---------------------------------------------------------------------------
  type Domain =
    | 'owner'
    | 'diary'
    | 'checkin'
    | 'medication'
    | 'library'
    | 'custom';

  const DOMAIN: Record<string, Domain> = {
    // owner-only (no delegation)
    api_key: 'owner',
    sparky_chat_history: 'owner',
    user_ignored_updates: 'owner',
    user_oidc_links: 'owner',
    cycle_daily_entries: 'owner',
    cycle_settings: 'owner',
    cycle_test_entries: 'owner',
    cycles: 'owner',
    health_appointments: 'owner',
    pregnancies: 'owner',
    pregnancy_checklist_state: 'owner',
    pregnancy_contractions: 'owner',
    pregnancy_kick_sessions: 'owner',
    pregnancy_photos: 'owner',
    user_cycle_display_preferences: 'owner',
    user_mood_display_preferences: 'owner',
    // diary
    exercise_entries: 'diary',
    exercise_preset_entries: 'diary',
    food_entry_meals: 'diary',
    food_favorites: 'diary',
    goal_presets: 'diary',
    meal_plans: 'diary',
    user_allergen_preferences: 'diary',
    user_custom_nutrients: 'diary',
    user_goals: 'diary',
    user_nutrient_goal_preferences: 'diary',
    user_meal_visibilities: 'diary',
    user_water_containers: 'diary',
    water_intake: 'diary',
    water_intake_entries: 'diary',
    weekly_goal_plans: 'diary',
    // check-in / wellness
    check_in_measurements: 'checkin',
    check_in_photos: 'checkin',
    custom_categories: 'checkin',
    custom_measurements: 'checkin',
    daily_sleep_need: 'checkin',
    day_classification_cache: 'checkin',
    fasting_logs: 'checkin',
    mood_entries: 'checkin',
    user_custom_moods: 'checkin',
    sleep_entries: 'checkin',
    sleep_entry_stages: 'checkin',
    sleep_need_calculations: 'checkin',
    // medication
    injection_entries: 'medication',
    medication_entries: 'medication',
    medication_pens: 'medication',
    medication_schedules: 'medication',
    medication_titration_steps: 'medication',
    medications: 'medication',
    symptom_entries: 'medication',
    user_custom_symptom_locations: 'medication',
    user_custom_symptoms: 'medication',
    // library (read shared, write owner-only)
    exercises: 'library',
    foods: 'library',
    meal_plan_templates: 'library',
    meals: 'library',
    workout_plan_templates: 'library',
    workout_presets: 'library',
    // bespoke / custom policies
    admin_activity_logs: 'custom',
    ai_service_settings: 'custom',
    exercise_entry_activity_details: 'custom',
    exercise_entry_sets: 'custom',
    external_data_providers: 'custom',
    family_access: 'custom',
    food_entries: 'custom',
    food_variants: 'custom',
    meal_foods: 'custom',
    meal_plan_template_assignments: 'custom',
    meal_types: 'custom',
    onboarding_data: 'custom',
    onboarding_status: 'custom',
    profiles: 'custom',
    user_dashboard_layouts: 'custom',
    user_medication_display_preferences: 'custom',
    user_nutrient_display_preferences: 'custom',
    user_preferences: 'custom',
    workout_plan_assignment_sets: 'custom',
    workout_plan_template_assignments: 'custom',
    workout_preset_exercise_sets: 'custom',
    workout_preset_exercises: 'custom',
    // system/internal: RLS-enabled with an explicit deny-all policy; only
    // getSystemClient (which bypasses RLS) touches it.
    passkey_registration_tickets: 'custom',
  };

  // Expected helper substrings for the generic-policy domains.
  const HELPER: Record<
    'diary' | 'checkin' | 'medication' | 'library',
    { read: string; write: string }
  > = {
    diary: { read: 'has_diary_read_access', write: 'has_diary_access' },
    checkin: { read: 'has_checkin_read_access', write: 'can_manage_checkin' },
    medication: {
      read: 'has_medication_read_access',
      write: 'has_medication_access',
    },
    library: {
      read: 'has_library_access_with_public',
      write: 'authenticated_user_id() = user_id',
    },
  };

  const norm = (s: string) => s.replace(/\s+/g, ' ');

  async function policies(table: string) {
    const sys = await getSystemClient();
    try {
      const { rows } = await sys.query(
        'SELECT policyname, qual, with_check FROM pg_policies WHERE schemaname = $1 AND tablename = $2',
        ['public', table]
      );
      return rows as Array<{
        policyname: string;
        qual: string | null;
        with_check: string | null;
      }>;
    } finally {
      sys.release();
    }
  }

  const tablesIn = (...d: Domain[]) =>
    Object.keys(DOMAIN).filter((t) => d.includes(DOMAIN[t]));

  describe('policy wiring (pg_policies)', () => {
    it('every RLS-enabled table is classified in DOMAIN (completeness guard)', async () => {
      const sys = await getSystemClient();
      let enabled: string[];
      try {
        const { rows } = await sys.query(
          `SELECT c.relname AS t
             FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = true`
        );
        enabled = rows.map((r: { t: string }) => r.t);
      } finally {
        sys.release();
      }
      const declared = new Set(Object.keys(DOMAIN));
      const missing = enabled.filter((t) => !declared.has(t)).sort();
      const stale = [...declared].filter((t) => !enabled.includes(t)).sort();
      expect(
        missing,
        `RLS-enabled tables not classified in DOMAIN: ${missing}`
      ).toEqual([]);
      expect(
        stale,
        `DOMAIN entries that are no longer RLS-enabled: ${stale}`
      ).toEqual([]);
    });

    // Generic helper-policy tables: select_policy uses the read helper,
    // modify_policy's WITH CHECK uses the write helper.
    it.each(tablesIn('diary', 'checkin', 'medication', 'library'))(
      'helper table "%s" wires select+modify to its domain helper',
      async (table) => {
        const exp = HELPER[DOMAIN[table] as keyof typeof HELPER];
        const ps = await policies(table);
        const sel = ps.find((p) => p.policyname === 'select_policy');
        const mod = ps.find((p) => p.policyname === 'modify_policy');
        expect(sel, `${table} has no select_policy`).toBeTruthy();
        expect(mod, `${table} has no modify_policy`).toBeTruthy();
        expect(norm(sel!.qual ?? '')).toContain(exp.read);
        expect(norm(mod!.with_check ?? '')).toContain(exp.write);
      }
    );

    // Owner-only tables: the single ALL policy keys off the authenticated user
    // and must NOT delegate (no family_access / has_* helper).
    it.each(tablesIn('owner'))(
      'owner-only table "%s" has no delegation',
      async (table) => {
        const ps = await policies(table);
        expect(ps.length, `${table} has no policy`).toBeGreaterThan(0);
        const all = norm(
          ps.map((p) => `${p.qual ?? ''} ${p.with_check ?? ''}`).join(' ')
        );
        expect(all).toContain('authenticated_user_id()');
        expect(all).not.toMatch(
          /family_access|has_\w+_access|has_family_access/
        );
      }
    );

    // Custom tables: at minimum, every one must actually have a policy (no
    // RLS-enabled-but-unprotected table).
    it.each(tablesIn('custom'))(
      'custom table "%s" has at least one policy',
      async (table) => {
        const ps = await policies(table);
        expect(
          ps.length,
          `${table} is RLS-enabled but has no policy`
        ).toBeGreaterThan(0);
      }
    );

    // Pinned expectations for the well-known custom tables (the bug-prone ones).
    const customPins: Array<{
      table: string;
      policy: string;
      col: 'qual' | 'with_check';
      mustContain: string;
    }> = [
      {
        table: 'food_entries',
        policy: 'select_policy',
        col: 'qual',
        mustContain: 'has_diary_read_access',
      },
      {
        table: 'food_entries',
        policy: 'insert_policy',
        col: 'with_check',
        mustContain: 'has_diary_access',
      },
      {
        table: 'food_variants',
        policy: 'modify_policy',
        col: 'with_check',
        mustContain: 'authenticated_user_id() = f.user_id',
      },
      {
        table: 'meal_foods',
        policy: 'modify_policy',
        col: 'with_check',
        mustContain: 'authenticated_user_id() = m.user_id',
      },
      {
        table: 'exercise_entry_sets',
        policy: 'modify_policy',
        col: 'with_check',
        mustContain: 'has_diary_access',
      },
      {
        table: 'exercise_entry_activity_details',
        policy: 'modify_policy',
        col: 'with_check',
        mustContain: 'has_diary_access',
      },
      {
        table: 'profiles',
        policy: 'select_policy',
        col: 'qual',
        mustContain: 'has_profile_read_access',
      },
      {
        table: 'user_medication_display_preferences',
        policy: 'select_policy',
        col: 'qual',
        mustContain: 'has_medication_read_access',
      },
      // Delegate-readable (any meaningful perm), owner-only write — profile-style.
      {
        table: 'user_preferences',
        policy: 'select_policy',
        col: 'qual',
        mustContain: 'has_profile_read_access',
      },
      {
        table: 'user_dashboard_layouts',
        policy: 'select_policy',
        col: 'qual',
        mustContain: 'has_profile_read_access',
      },
      {
        table: 'user_nutrient_display_preferences',
        policy: 'select_policy',
        col: 'qual',
        mustContain: 'has_profile_read_access',
      },
      {
        table: 'onboarding_data',
        policy: 'select_policy',
        col: 'qual',
        mustContain: 'has_profile_read_access',
      },
      {
        table: 'onboarding_status',
        policy: 'select_policy',
        col: 'qual',
        mustContain: 'has_profile_read_access',
      },
      // Admin / global / sharing-specific logic.
      {
        table: 'admin_activity_logs',
        policy: 'admin_only_select',
        col: 'qual',
        mustContain: 'is_admin()',
      },
      {
        table: 'ai_service_settings',
        policy: 'ai_service_settings_select_policy',
        col: 'qual',
        mustContain: 'is_public',
      },
      {
        table: 'external_data_providers',
        policy: 'select_policy',
        col: 'qual',
        mustContain: 'share_external_providers',
      },
      // Bidirectional visibility (owner OR the family member sees the grant).
      {
        table: 'family_access',
        policy: 'select_policy',
        col: 'qual',
        mustContain: 'family_user_id',
      },
      // System rows (user_id NULL) readable by all, else diary-read.
      {
        table: 'meal_types',
        policy: 'select_policy',
        col: 'qual',
        mustContain: 'has_diary_read_access',
      },
      // Diary-domain assignments gated through the parent template's owner.
      {
        table: 'meal_plan_template_assignments',
        policy: 'owner_policy',
        col: 'with_check',
        mustContain: 'has_diary_access',
      },
      {
        table: 'workout_plan_template_assignments',
        policy: 'owner_policy',
        col: 'with_check',
        mustContain: 'has_diary_access',
      },
      {
        table: 'workout_plan_assignment_sets',
        policy: 'owner_policy',
        col: 'with_check',
        mustContain: 'workout_plan_template_assignments',
      },
      // Workout-preset children: write gated to the preset owner.
      {
        table: 'workout_preset_exercises',
        policy: 'modify_policy',
        col: 'with_check',
        mustContain: 'authenticated_user_id() = wp.user_id',
      },
      {
        table: 'workout_preset_exercise_sets',
        policy: 'modify_policy',
        col: 'with_check',
        mustContain: 'authenticated_user_id() = wp.user_id',
      },
    ];

    it.each(customPins)(
      'pinned: $table $policy ($col) contains $mustContain',
      async ({ table, policy, col, mustContain }) => {
        const ps = await policies(table);
        const row = ps.find((p) => p.policyname === policy);
        expect(row, `${table}.${policy} not found`).toBeTruthy();
        expect(norm(row![col] ?? '')).toContain(norm(mustContain));
      }
    );
  });

  // ---------------------------------------------------------------------------
  // Part B — helper behavior. For each delegate (switched into OWNER's context
  // via getClient(OWNER, delegate)), assert every RLS helper's verdict.
  // T = access granted, F = denied. This is the contract the policies depend on.
  // ---------------------------------------------------------------------------
  describe('helper behavior (as delegate, switched to owner)', () => {
    // columns: [diaryWrite, diaryRead, checkinRead, checkinWrite, medWrite,
    //           medRead, profileRead, libFood, libExercise]
    const EXPECTED: Record<DelegateKey, boolean[]> = {
      //          d_w   d_r   c_r   c_w   m_w   m_r   p_r   lib_f lib_e
      diary: [true, true, false, false, false, false, true, true, true],
      checkin: [false, false, true, true, false, false, true, false, false],
      meds: [false, false, false, false, true, true, true, false, false],
      reports: [false, true, true, false, false, true, true, true, true],
      foodlib: [false, false, false, false, false, false, false, true, false],
      exlib: [false, false, false, false, false, false, false, false, true],
      none: [false, false, false, false, false, false, false, false, false],
    };

    it.each(Object.keys(D) as DelegateKey[])(
      'delegate "%s" gets the expected verdicts',
      async (key) => {
        // getClient's authenticatedUserId param is typed `null` via its default;
        // at runtime it accepts the actor id. Cast to satisfy the inferred type.
        const client = await getClient(OWNER, D[key] as unknown as null);
        try {
          const { rows } = await client.query(
            `SELECT
               has_diary_access($1)                                                                       AS d_w,
               has_diary_read_access($1)                                                                  AS d_r,
               has_checkin_read_access($1)                                                                AS c_r,
               has_family_access($1, 'can_manage_checkin')                                                AS c_w,
               has_medication_access($1)                                                                  AS m_w,
               has_medication_read_access($1)                                                             AS m_r,
               has_profile_read_access($1)                                                                AS p_r,
               has_library_access_with_public($1, false, ARRAY['can_view_food_library','can_manage_diary'])     AS lib_f,
               has_library_access_with_public($1, false, ARRAY['can_view_exercise_library','can_manage_diary']) AS lib_e`,
            [OWNER]
          );
          const r = rows[0];
          const actual = [
            r.d_w,
            r.d_r,
            r.c_r,
            r.c_w,
            r.m_w,
            r.m_r,
            r.p_r,
            r.lib_f,
            r.lib_e,
          ];
          expect(actual).toEqual(EXPECTED[key]);
        } finally {
          client.release();
        }
      }
    );

    it('F6: a diary delegate that is NOT switched cannot read the owner library', async () => {
      // current_user_id() = delegate (not owner), so the can_manage_diary caveat
      // in has_library_access_with_public fails -> no library access.
      const client = await getClient(D.diary, D.diary as unknown as null);
      try {
        const { rows } = await client.query(
          "SELECT has_library_access_with_public($1, false, ARRAY['can_view_food_library','can_manage_diary']) AS lib_f",
          [OWNER]
        );
        expect(rows[0].lib_f).toBe(false);
      } finally {
        client.release();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Part C — behavioral access (the strongest layer). Seed a real row owned by
  // OWNER, then as each delegate actually attempt SELECT / INSERT / UPDATE /
  // DELETE against live RLS and assert allow/deny. This is what proves a domain
  // grants the operations it should — e.g. a diary delegate gets all four,
  // while a reports delegate is read-only.
  //
  // RLS denial surfaces differently per operation: INSERT raises 42501 on a
  // WITH CHECK violation; UPDATE/DELETE just affect 0 rows when USING hides the
  // row. Every write runs inside a rolled-back transaction so nothing persists.
  // ---------------------------------------------------------------------------
  describe('behavioral access (real DML as delegate)', () => {
    const KEYS = Object.keys(D) as DelegateKey[];
    const RLS_DENIED = '42501';

    async function canSelect(key: DelegateKey, table: string, id: string) {
      const client = await getClient(OWNER, D[key] as unknown as null);
      try {
        const { rows } = await client.query(
          `SELECT 1 FROM public.${table} WHERE id = $1`,
          [id]
        );
        return rows.length > 0;
      } finally {
        client.release();
      }
    }

    // INSERT: allowed unless RLS raises 42501.
    async function canInsert(key: DelegateKey, sql: string, params: unknown[]) {
      const client = await getClient(OWNER, D[key] as unknown as null);
      try {
        await client.query('BEGIN');
        try {
          await client.query(sql, params);
          return true;
        } catch (e) {
          if ((e as { code?: string }).code === RLS_DENIED) return false;
          throw e;
        } finally {
          await client.query('ROLLBACK');
        }
      } finally {
        client.release();
      }
    }

    // UPDATE/DELETE: allowed only if a row was actually affected (USING hides
    // rows the delegate may not write, yielding rowCount 0 with no error).
    async function canAffect(key: DelegateKey, sql: string, params: unknown[]) {
      const client = await getClient(OWNER, D[key] as unknown as null);
      try {
        await client.query('BEGIN');
        try {
          const res = await client.query(sql, params);
          return (res.rowCount ?? 0) > 0;
        } catch (e) {
          if ((e as { code?: string }).code === RLS_DENIED) return false;
          throw e;
        } finally {
          await client.query('ROLLBACK');
        }
      } finally {
        client.release();
      }
    }

    // Runs SELECT/INSERT/UPDATE/DELETE allow-deny assertions for one table.
    function crudSuite(opts: {
      table: string;
      read: DelegateKey[];
      write: DelegateKey[];
      // lazy so it can read seed ids captured in beforeAll
      insert: () => { sql: string; params: unknown[] };
      // a no-op self-assignment column so UPDATE touches nothing real
      touchColumn: string;
      rowId: () => string;
    }) {
      it.each(KEYS)(`${opts.table} SELECT as "%s"`, async (key) => {
        expect(await canSelect(key, opts.table, opts.rowId())).toBe(
          opts.read.includes(key)
        );
      });
      it.each(KEYS)(`${opts.table} INSERT as "%s"`, async (key) => {
        const { sql, params } = opts.insert();
        expect(await canInsert(key, sql, params)).toBe(
          opts.write.includes(key)
        );
      });
      it.each(KEYS)(`${opts.table} UPDATE as "%s"`, async (key) => {
        expect(
          await canAffect(
            key,
            `UPDATE public.${opts.table} SET ${opts.touchColumn} = ${opts.touchColumn} WHERE id = $1`,
            [opts.rowId()]
          )
        ).toBe(opts.write.includes(key));
      });
      it.each(KEYS)(`${opts.table} DELETE as "%s"`, async (key) => {
        expect(
          await canAffect(
            key,
            `DELETE FROM public.${opts.table} WHERE id = $1`,
            [opts.rowId()]
          )
        ).toBe(opts.write.includes(key));
      });
    }

    // -- diary domain: full CRUD for can_manage_diary, read-only for reports ---
    describe('goal_presets (diary)', () => {
      let id = '';
      beforeAll(async () => {
        const sys = await getSystemClient();
        try {
          const r = await sys.query(
            "INSERT INTO public.goal_presets (user_id, preset_name) VALUES ($1, 'rls-matrix') RETURNING id",
            [OWNER]
          );
          id = r.rows[0].id;
        } finally {
          sys.release();
        }
      });
      afterAll(async () => {
        const sys = await getSystemClient();
        try {
          await sys.query('DELETE FROM public.goal_presets WHERE id = $1', [
            id,
          ]);
        } finally {
          sys.release();
        }
      });
      crudSuite({
        table: 'goal_presets',
        read: ['diary', 'reports'],
        write: ['diary'],
        insert: () => ({
          sql: "INSERT INTO public.goal_presets (user_id, preset_name) VALUES ($1, 'rls-matrix-w')",
          params: [OWNER],
        }),
        touchColumn: 'preset_name',
        rowId: () => id,
      });
    });

    // -- check-in domain -----------------------------------------------------
    describe('custom_categories (checkin)', () => {
      let id = '';
      beforeAll(async () => {
        const sys = await getSystemClient();
        try {
          const r = await sys.query(
            "INSERT INTO public.custom_categories (user_id, name, measurement_type, frequency) VALUES ($1, 'rls-matrix', 'numeric', 'Daily') RETURNING id",
            [OWNER]
          );
          id = r.rows[0].id;
        } finally {
          sys.release();
        }
      });
      afterAll(async () => {
        const sys = await getSystemClient();
        try {
          await sys.query(
            'DELETE FROM public.custom_categories WHERE id = $1',
            [id]
          );
        } finally {
          sys.release();
        }
      });
      crudSuite({
        table: 'custom_categories',
        read: ['checkin', 'reports'],
        write: ['checkin'],
        insert: () => ({
          sql: "INSERT INTO public.custom_categories (user_id, name, measurement_type, frequency) VALUES ($1, 'rls-matrix-w', 'numeric', 'Daily')",
          params: [OWNER],
        }),
        touchColumn: 'name',
        rowId: () => id,
      });
    });

    // -- custom/library: delegates read when entitled, only owner writes (F1) -
    describe('food_variants (custom, owner-only write)', () => {
      let foodId = '';
      let variantId = '';
      beforeAll(async () => {
        const sys = await getSystemClient();
        try {
          const f = await sys.query(
            "INSERT INTO public.foods (user_id, name, shared_with_public) VALUES ($1, 'rls-matrix-food', false) RETURNING id",
            [OWNER]
          );
          foodId = f.rows[0].id;
          const v = await sys.query(
            "INSERT INTO public.food_variants (food_id, serving_size, serving_unit) VALUES ($1, 1, 'g') RETURNING id",
            [foodId]
          );
          variantId = v.rows[0].id;
        } finally {
          sys.release();
        }
      });
      afterAll(async () => {
        const sys = await getSystemClient();
        try {
          await sys.query('DELETE FROM public.foods WHERE id = $1', [foodId]);
        } finally {
          sys.release();
        }
      });
      crudSuite({
        table: 'food_variants',
        read: ['diary', 'reports', 'foodlib'],
        write: [], // owner-only; no delegate may write
        insert: () => ({
          sql: "INSERT INTO public.food_variants (food_id, serving_size, serving_unit) VALUES ($1, 2, 'g')",
          params: [foodId],
        }),
        touchColumn: 'serving_size',
        rowId: () => variantId,
      });
    });
  });
});
