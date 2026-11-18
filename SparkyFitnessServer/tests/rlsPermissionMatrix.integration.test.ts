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
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import exerciseDb from '../models/exercise.js';
import exerciseEntryDb from '../models/exerciseEntry.js';
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from 'vitest';
import { getClient, getSystemClient, endPool } from '../db/poolManager.js';
import challengeRepository, {
  type QueuedMemberDays,
} from '../models/challengeRepository.js';
import {
  isPlannedEntryRow,
  rulesForDay,
  toChallengeEntry,
} from '../services/challengeService.js';
import {
  challengeTypedCalories,
  challengeRulesSchema,
} from '@workspace/shared';

// Probe the app role RLS actually needs, with a short timeout, using a
// standalone client. Returns false on any failure so the suite skips rather
// than erroring when no DB is reachable.
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
  symptoms: '00000000-0000-4000-a000-000000000008',
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
  symptoms: { can_manage_symptoms: true },
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
    | 'symptom'
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
    custom_run_programs: 'owner',
    cycles: 'owner',
    fitness_tests: 'owner',
    recipe_imports: 'owner',
    recipe_food_mappings: 'owner',
    intervals_nutrition_pushes: 'owner',
    health_appointments: 'owner',
    openfoodfacts_sync_queue: 'owner',
    pregnancies: 'owner',
    pregnancy_checklist_state: 'owner',
    pregnancy_contractions: 'owner',
    pregnancy_kick_sessions: 'owner',
    pregnancy_photos: 'owner',
    run_programs: 'owner',
    run_goals: 'owner',
    routes: 'owner',
    user_cycle_display_preferences: 'owner',
    user_fasting_preferences: 'owner',
    user_mood_display_preferences: 'owner',
    food_assistant_preferences: 'owner',
    food_assistant_tasks: 'owner',
    food_assistant_operations: 'owner',
    plate_inventories: 'owner',
    action_tags: 'owner',
    // diary
    exercise_entries: 'diary',
    exercise_preset_entries: 'diary',
    workout_feedback: 'diary',
    food_entry_meals: 'diary',
    food_favorites: 'diary',
    goal_presets: 'diary',
    meal_plans: 'diary',
    shoes: 'diary',
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
    daily_health_metrics: 'checkin',
    daily_sleep_need: 'checkin',
    day_classification_cache: 'checkin',
    fasting_logs: 'checkin',
    health_metric_samples: 'checkin',
    lab_markers: 'checkin',
    lab_reports: 'checkin',
    lab_results: 'checkin',
    mindfulness_sessions: 'checkin',
    mood_entries: 'checkin',
    oral_care_sessions: 'checkin',
    user_custom_moods: 'checkin',
    sleep_entries: 'checkin',
    sleep_entry_stages: 'checkin',
    sleep_need_calculations: 'checkin',
    vitals_entries: 'checkin',
    // medication
    injection_entries: 'medication',
    medication_entries: 'medication',
    medication_pens: 'medication',
    medication_schedules: 'medication',
    medication_titration_steps: 'medication',
    medications: 'medication',
    // symptom (own permission; see the symptom_entries pins below for the
    // cycle-row carve-out)
    symptom_entry_photos: 'symptom',
    symptom_entry_treatments: 'symptom',
    symptom_free_days: 'symptom',
    user_custom_symptoms: 'symptom',
    user_symptom_options: 'symptom',
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
    exercise_entry_gps_points: 'custom',
    exercise_entry_hr_zones: 'custom',
    exercise_entry_distance_series: 'custom',
    exercise_entry_laps: 'custom',
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
    // symptom_entries: symptom helpers plus a cycle-source carve-out, so it has
    // bespoke (pinned) policies rather than the generic generator's.
    symptom_entries: 'custom',
    user_calorie_rule_history: 'custom',
    user_dashboard_layouts: 'custom',
    user_medication_display_preferences: 'custom',
    user_nutrient_display_preferences: 'custom',
    user_preferences: 'custom',
    workout_plan_assignment_sets: 'custom',
    workout_plan_template_assignments: 'custom',
    workout_preset_exercise_sets: 'custom',
    workout_preset_exercises: 'custom',
    // system/internal: RLS-enabled with an explicit deny-all policy; only
    // owner-pool/getSystemClient paths (which bypass RLS) touch them.
    jwks: 'custom',
    oauth_access_token: 'custom',
    oauth_authorization_revocation: 'custom',
    oauth_client: 'custom',
    oauth_client_assertion: 'custom',
    oauth_client_resource: 'custom',
    oauth_consent: 'custom',
    oauth_refresh_token: 'custom',
    oauth_resource: 'custom',
    openfoodfacts_product_read_rate_limit: 'custom',
    passkey_registration_tickets: 'custom',
    rate_limit: 'custom',
    // Challenges: members read (is_challenge_member, the signed-in person
    // only, never a delegate); only the server's owner pool writes. The score
    // queue is internal to the score job and denied to the app role.
    challenges: 'custom',
    challenge_members: 'custom',
    challenge_daily_scores: 'custom',
    challenge_activity_cards: 'custom',
    challenge_results: 'custom',
    challenge_rule_changes: 'custom',
    challenge_score_queue: 'custom',
  };

  // Expected helper substrings for the generic-policy domains.
  const HELPER: Record<
    'diary' | 'checkin' | 'medication' | 'symptom' | 'library',
    { read: string; write: string }
  > = {
    diary: { read: 'has_diary_read_access', write: 'has_diary_access' },
    checkin: { read: 'has_checkin_read_access', write: 'can_manage_checkin' },
    medication: {
      read: 'has_medication_read_access',
      write: 'has_medication_access',
    },
    symptom: {
      read: 'has_symptom_read_access',
      write: 'has_symptom_access',
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

  describe('unlinked diary nutrition snapshots', () => {
    let mealTypeId: string;
    let variantId: string;
    beforeAll(async () => {
      const sys = await getSystemClient();
      try {
        const mealType = await sys.query(
          'INSERT INTO meal_types (user_id, name, sort_order) VALUES ($1, $2, 999) RETURNING id',
          [OWNER, 'RLS snapshot fixture']
        );
        mealTypeId = mealType.rows[0].id;
        const food = await sys.query(
          'INSERT INTO foods (user_id, name) VALUES ($1, $2) RETURNING id',
          [OWNER, 'RLS snapshot source']
        );
        const variant = await sys.query(
          'INSERT INTO food_variants (food_id, serving_size, serving_unit, calories) VALUES ($1, 100, $2, 165) RETURNING id',
          [food.rows[0].id, 'g']
        );
        variantId = variant.rows[0].id;
      } finally {
        sys.release();
      }
    });

    it.each([
      ['owner', (): string => OWNER, true],
      ['diary delegate', (): string => D.diary, true],
      ['read-only reports delegate', (): string => D.reports, false],
      ['unpermitted delegate', (): string => D.none, false],
    ] as const)(
      'allows snapshot inserts only with diary write access: %s',
      async (_label, actorId, allowed) => {
        const actor = actorId();
        const client = await getClient(OWNER, actor);
        try {
          const insert = client.query(
            `INSERT INTO food_entries (user_id, meal_type_id, quantity, unit, entry_date, food_name,
            serving_size, serving_unit, calories, food_id, meal_id, variant_id, created_by_user_id)
           VALUES ($1, $2, 150, 'g', '2026-10-14', 'Stored snapshot', 100, 'g', 165, NULL, NULL, NULL, $3)
           RETURNING food_id, variant_id, calories`,
            [OWNER, mealTypeId, actor]
          );
          if (allowed) {
            const result = await insert;
            expect(result.rows).toEqual([
              { food_id: null, variant_id: null, calories: 165 },
            ]);
          } else {
            await expect(insert).rejects.toMatchObject({ code: '42501' });
          }
        } finally {
          client.release();
        }
      }
    );

    it('rejects an independent variant pointer even for the diary owner', async () => {
      const client = await getClient(OWNER);
      try {
        await expect(
          client.query(
            `INSERT INTO food_entries (user_id, meal_type_id, quantity, unit, entry_date, food_name,
            serving_size, serving_unit, calories, food_id, meal_id, variant_id)
           VALUES ($1, $2, 150, 'g', '2026-10-14', 'Stored snapshot', 100, 'g', 165, NULL, NULL, $3)`,
            [OWNER, mealTypeId, variantId]
          )
        ).rejects.toMatchObject({ code: '42501' });
      } finally {
        client.release();
      }
    });
  });

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
    it.each(tablesIn('diary', 'checkin', 'medication', 'symptom', 'library'))(
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
      // Symptom entries: symptom helpers, and cycle-hub rows stay owner-only
      // (Tier 1) even for a delegate that holds the symptoms permission.
      {
        table: 'symptom_entries',
        policy: 'select_policy',
        col: 'qual',
        mustContain: 'has_symptom_read_access',
      },
      {
        table: 'symptom_entries',
        policy: 'select_policy',
        col: 'qual',
        mustContain: "'cycle'::text",
      },
      {
        table: 'symptom_entries',
        policy: 'modify_policy',
        col: 'with_check',
        mustContain: 'has_symptom_access',
      },
      {
        table: 'symptom_entries',
        policy: 'modify_policy',
        col: 'with_check',
        mustContain: "'cycle'::text",
      },
      // Delegate-readable (any meaningful perm), owner-only write — profile-style.
      {
        table: 'user_preferences',
        policy: 'select_policy',
        col: 'qual',
        mustContain: 'has_profile_read_access',
      },
      {
        table: 'user_calorie_rule_history',
        policy: 'select_policy',
        col: 'qual',
        mustContain: 'has_profile_read_access',
      },
      {
        table: 'user_calorie_rule_history',
        policy: 'modify_policy',
        col: 'with_check',
        mustContain: 'authenticated_user_id() = user_id',
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
      // Challenges: member read, server write.
      {
        table: 'challenges',
        policy: 'select_policy',
        col: 'qual',
        mustContain: 'is_challenge_member(id)',
      },
      {
        table: 'challenge_members',
        policy: 'select_policy',
        col: 'qual',
        mustContain: 'is_challenge_member(challenge_id)',
      },
      {
        table: 'challenge_daily_scores',
        policy: 'select_policy',
        col: 'qual',
        mustContain: 'is_challenge_member(challenge_id)',
      },
      {
        table: 'challenge_activity_cards',
        policy: 'select_policy',
        col: 'qual',
        mustContain: 'is_challenge_member(challenge_id)',
      },
      {
        table: 'challenge_results',
        policy: 'select_policy',
        col: 'qual',
        mustContain: 'is_challenge_member(challenge_id)',
      },
      {
        table: 'challenge_rule_changes',
        policy: 'select_policy',
        col: 'qual',
        mustContain: 'is_challenge_member(challenge_id)',
      },
      {
        table: 'challenge_score_queue',
        policy: 'deny_all_policy',
        col: 'qual',
        mustContain: 'false',
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
      {
        table: 'external_data_providers',
        policy: 'select_policy',
        col: 'qual',
        mustContain: 'authenticated_user_id() = user_id',
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
    //           medRead, profileRead, libFood, libExercise, symptomWrite,
    //           symptomRead]
    const EXPECTED: Record<DelegateKey, boolean[]> = {
      //          d_w   d_r   c_r   c_w   m_w   m_r   p_r   lib_f lib_e s_w   s_r
      diary: [
        true,
        true,
        false,
        false,
        false,
        false,
        true,
        true,
        true,
        false,
        false,
      ],
      checkin: [
        false,
        false,
        true,
        true,
        false,
        false,
        true,
        false,
        false,
        false,
        false,
      ],
      meds: [
        false,
        false,
        false,
        false,
        true,
        true,
        true,
        false,
        false,
        false,
        false,
      ],
      reports: [
        false,
        true,
        true,
        false,
        false,
        true,
        true,
        true,
        true,
        false,
        true,
      ],
      foodlib: [
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        true,
        false,
        false,
        false,
      ],
      exlib: [
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        true,
        false,
        false,
      ],
      none: [
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
      ],
      symptoms: [
        false,
        false,
        false,
        false,
        false,
        false,
        true,
        false,
        false,
        true,
        true,
      ],
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
               has_library_access_with_public($1, false, ARRAY['can_view_exercise_library','can_manage_diary']) AS lib_e,
               has_symptom_access($1)                                                                     AS s_w,
               has_symptom_read_access($1)                                                                AS s_r`,
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
            r.s_w,
            r.s_r,
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

    // -- symptom domain: its own permission, and cycle rows are owner-only ----
    describe('symptom_entries (symptom domain, cycle rows owner-only)', () => {
      let manualId = '';
      let cycleId = '';
      beforeAll(async () => {
        const sys = await getSystemClient();
        try {
          const manual = await sys.query(
            "INSERT INTO public.symptom_entries (user_id, symptom_name_snapshot, source) VALUES ($1, 'rls-matrix', 'manual') RETURNING id",
            [OWNER]
          );
          manualId = manual.rows[0].id;
          const cycle = await sys.query(
            "INSERT INTO public.symptom_entries (user_id, symptom_name_snapshot, source) VALUES ($1, 'rls-matrix-cycle', 'cycle') RETURNING id",
            [OWNER]
          );
          cycleId = cycle.rows[0].id;
        } finally {
          sys.release();
        }
      });
      afterAll(async () => {
        const sys = await getSystemClient();
        try {
          await sys.query(
            'DELETE FROM public.symptom_entries WHERE id = ANY($1::uuid[])',
            [[manualId, cycleId]]
          );
        } finally {
          sys.release();
        }
      });

      // Manual rows: the symptoms delegate reads + writes; a reports delegate is
      // read-only; medications and every other domain get nothing.
      crudSuite({
        table: 'symptom_entries',
        read: ['symptoms', 'reports'],
        write: ['symptoms'],
        insert: () => ({
          sql: "INSERT INTO public.symptom_entries (user_id, symptom_name_snapshot, source) VALUES ($1, 'rls-matrix-w', 'manual')",
          params: [OWNER],
        }),
        touchColumn: 'symptom_name_snapshot',
        rowId: () => manualId,
      });

      // Cycle-hub rows are reproductive-health data: no delegate may read,
      // change, delete or create them, whatever permissions they hold.
      it.each(KEYS)('cycle row SELECT is denied to "%s"', async (key) => {
        expect(await canSelect(key, 'symptom_entries', cycleId)).toBe(false);
      });
      it.each(KEYS)('cycle row UPDATE is denied to "%s"', async (key) => {
        expect(
          await canAffect(
            key,
            'UPDATE public.symptom_entries SET symptom_name_snapshot = symptom_name_snapshot WHERE id = $1',
            [cycleId]
          )
        ).toBe(false);
      });
      it.each(KEYS)('cycle row DELETE is denied to "%s"', async (key) => {
        expect(
          await canAffect(
            key,
            'DELETE FROM public.symptom_entries WHERE id = $1',
            [cycleId]
          )
        ).toBe(false);
      });
      it.each(KEYS)('cycle row INSERT is denied to "%s"', async (key) => {
        expect(
          await canInsert(
            key,
            "INSERT INTO public.symptom_entries (user_id, symptom_name_snapshot, source) VALUES ($1, 'rls-matrix-cycle-w', 'cycle')",
            [OWNER]
          )
        ).toBe(false);
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

describe.runIf(RUN)('Active calorie imports with shared exercises', () => {
  const users = [
    '00000000-0000-4000-b300-000000000001',
    '00000000-0000-4000-b300-000000000002',
  ];
  let sys: pg.PoolClient;

  beforeAll(async () => {
    sys = await getSystemClient();
    for (const id of users) {
      await sys.query(
        'INSERT INTO public."user" (id, email, email_verified) VALUES ($1, $2, true)',
        [id, `active-calories-${id}@example.test`]
      );
    }
  });

  beforeEach(async () => {
    await sys.query(
      'DELETE FROM exercise_entries WHERE user_id = ANY($1::uuid[])',
      [users]
    );
    await sys.query(
      'DELETE FROM exercise_preset_entries WHERE user_id = ANY($1::uuid[])',
      [users]
    );
    await sys.query('DELETE FROM exercises WHERE user_id = ANY($1::uuid[])', [
      users,
    ]);
    await sys.query('DELETE FROM family_access WHERE owner_user_id = $1', [
      users[0],
    ]);
  });

  afterAll(async () => {
    try {
      await sys.query(
        'DELETE FROM exercise_entries WHERE user_id = ANY($1::uuid[])',
        [users]
      );
      await sys.query('DELETE FROM exercises WHERE user_id = ANY($1::uuid[])', [
        users,
      ]);
      await sys.query('DELETE FROM public."user" WHERE id = ANY($1::uuid[])', [
        users,
      ]);
    } finally {
      sys.release();
      await endPool();
    }
  });

  /** Imports the same daily HealthKit total through the production repositories. */
  async function sync(calories: number) {
    const exerciseId = await exerciseDb.getOrCreateActiveCaloriesExercise(
      users[1],
      'HealthKit'
    );
    return exerciseEntryDb.upsertExerciseEntryData(
      users[1],
      users[1],
      exerciseId,
      calories,
      '2026-09-10',
      'HealthKit'
    );
  }

  it.each(['family', 'public'])(
    'keeps one owned entry when %s sharing changes',
    async (sharing) => {
      await sys.query('DELETE FROM exercises WHERE user_id = ANY($1::uuid[])', [
        users,
      ]);
      const sharedId = await exerciseDb.getOrCreateActiveCaloriesExercise(
        users[0],
        'HealthKit'
      );
      if (sharing === 'public') {
        await sys.query(
          'UPDATE exercises SET shared_with_public = true WHERE id = $1',
          [sharedId]
        );
      } else {
        await sys.query(
          `INSERT INTO family_access (owner_user_id, family_user_id, family_email, access_permissions, is_active, status)
         VALUES ($1, $2, $3, '{"can_view_exercise_library":true}', true, 'active')`,
          [users[0], users[1], `active-calories-${users[1]}@example.test`]
        );
      }
      expect((await exerciseDb.getExerciseById(sharedId, users[1])).id).toBe(
        sharedId
      );
      const first = await sync(300);
      const firstExercise = await exerciseDb.getExerciseById(
        first.exercise_id,
        users[1]
      );
      await sys.query(
        'UPDATE family_access SET is_active = false WHERE owner_user_id = $1',
        [users[0]]
      );
      await sys.query(
        'UPDATE exercises SET shared_with_public = false WHERE id = $1',
        [sharedId]
      );
      const second = await sync(350);
      const rows = await sys.query(
        `SELECT ee.id, ee.calories_burned, e.user_id AS exercise_owner
       FROM exercise_entries ee JOIN exercises e ON e.id = ee.exercise_id
       WHERE ee.user_id = $1`,
        [users[1]]
      );
      expect(second.id).toBe(first.id);
      expect(firstExercise.user_id).toBe(users[1]);
      expect(rows.rows).toEqual([
        { id: first.id, calories_burned: 350, exercise_owner: users[1] },
      ]);
    }
  );

  it('reuses an old import after its shared exercise becomes inaccessible', async () => {
    const sharedId = await exerciseDb.getOrCreateActiveCaloriesExercise(
      users[0],
      'HealthKit'
    );
    const oldId = randomUUID();
    await sys.query(
      `INSERT INTO exercise_entries (id, user_id, exercise_id, entry_date, calories_burned, duration_minutes, exercise_name, source)
       VALUES ($1, $2, $3, '2026-09-10', 300, 0, 'Active Calories', 'HealthKit')`,
      [oldId, users[1], sharedId]
    );
    expect(
      await exerciseDb.getExerciseById(sharedId, users[1])
    ).toBeUndefined();
    const updated = await sync(350);
    const repeated = await sync(400);
    expect(updated.id).toBe(oldId);
    expect(repeated.id).toBe(oldId);
    expect(repeated.exercise_id).not.toBe(sharedId);
    expect(repeated.calories_burned).toBe(400);
    expect(repeated.updated_by_user_id).toBe(users[1]);
    expect(repeated.notes).toBe(
      'Active calories logged from Apple Health (updated).'
    );
    const rows = await sys.query(
      'SELECT id FROM exercise_entries WHERE user_id = $1',
      [users[1]]
    );
    expect(rows.rows).toEqual([{ id: oldId }]);
  });

  it('updates the exact exercise match without altering an existing legacy duplicate', async () => {
    const sharedId = await exerciseDb.getOrCreateActiveCaloriesExercise(
      users[0],
      'HealthKit'
    );
    const ownedId = await exerciseDb.getOrCreateActiveCaloriesExercise(
      users[1],
      'HealthKit'
    );
    const legacyId = randomUUID();
    const exactId = randomUUID();
    await sys.query(
      `INSERT INTO exercise_entries (id, user_id, exercise_id, entry_date, calories_burned, duration_minutes, exercise_name, source, created_at)
       VALUES ($1, $3, $4, '2026-09-10', 100, 0, 'Active Calories', 'HealthKit', '2026-09-09'),
              ($2, $3, $5, '2026-09-10', 200, 0, 'Active Calories', 'HealthKit', '2026-09-10')`,
      [legacyId, exactId, users[1], sharedId, ownedId]
    );
    const before = await sys.query(
      'SELECT * FROM exercise_entries WHERE id = $1',
      [legacyId]
    );
    const updated = await sync(350);
    expect(updated.id).toBe(exactId);
    expect(updated.calories_burned).toBe(350);
    const after = await sys.query(
      'SELECT * FROM exercise_entries WHERE id = $1',
      [legacyId]
    );
    expect(after.rows).toEqual(before.rows);
  });

  it.each([
    ['another user', { otherUser: true }],
    ['another source', { source: 'Health Connect' }],
    ['another date', { date: '2026-09-09' }],
    ['a workout', { duration: 30 }],
    ['a preset exercise', { preset: true }],
    ['a provider activity', { sourceId: 'activity-1' }],
    ['another exercise name', { name: 'Running' }],
  ])('preserves %s when finding a legacy import', async (_label, change) => {
    const sharedId = await exerciseDb.getOrCreateActiveCaloriesExercise(
      users[0],
      'HealthKit'
    );
    const untouchedId = randomUUID();
    const values = {
      otherUser: false,
      preset: false,
      source: 'HealthKit',
      date: '2026-09-10',
      duration: 0,
      sourceId: null,
      name: 'Active Calories',
      ...change,
    };
    const presetId = values.preset ? randomUUID() : null;
    if (presetId) {
      await sys.query(
        "INSERT INTO exercise_preset_entries (id, user_id, name, entry_date) VALUES ($1, $2, 'Active calorie fixture', '2026-09-10')",
        [presetId, users[1]]
      );
    }
    await sys.query(
      `INSERT INTO exercise_entries (id, user_id, exercise_id, entry_date, calories_burned, duration_minutes, exercise_name, source, source_id, exercise_preset_entry_id)
       VALUES ($1, $2, $3, $4, 123, $5, $6, $7, $8, $9)`,
      [
        untouchedId,
        values.otherUser ? users[0] : users[1],
        sharedId,
        values.date,
        values.duration,
        values.name,
        values.source,
        values.sourceId,
        presetId,
      ]
    );
    const before = await sys.query(
      'SELECT * FROM exercise_entries WHERE id = $1',
      [untouchedId]
    );
    const imported = await sync(350);
    expect(imported.id).not.toBe(untouchedId);
    const after = await sys.query(
      'SELECT * FROM exercise_entries WHERE id = $1',
      [untouchedId]
    );
    expect(after.rows).toEqual(before.rows);
  });

  // This migration is unscoped; namespaced fixture IDs alone cannot protect a normal DB.
  describe.runIf(
    /(^|[_-])test([_-]|$)/i.test(process.env.SPARKY_FITNESS_DB_NAME ?? '')
  )('historical cleanup', () => {
    const migration = readFileSync(
      new URL(
        '../db/migrations/20260910180000_deduplicate_shared_active_calories.sql',
        import.meta.url
      ),
      'utf8'
    );
    let legacyId: string;
    let ownedId: string;

    beforeEach(async () => {
      const sharedExercise = await exerciseDb.getOrCreateActiveCaloriesExercise(
        users[0],
        'HealthKit'
      );
      const owned = await sync(300);
      ownedId = owned.id;
      legacyId = randomUUID();
      await sys.query(
        `INSERT INTO exercise_entries (id, user_id, exercise_id, entry_date, calories_burned, duration_minutes, notes, created_by_user_id, exercise_name, source)
         VALUES ($1, $2, $3, '2026-09-10', 350, 0, 'Active calories logged from Apple Health.', $2, 'Active Calories', 'HealthKit')`,
        [legacyId, users[1], sharedExercise]
      );
    });

    /** Reads complete fixture rows so preservation checks include all metadata. */
    async function entries() {
      return (
        await sys.query(
          'SELECT * FROM exercise_entries WHERE user_id = ANY($1::uuid[]) ORDER BY id',
          [users]
        )
      ).rows;
    }

    it.each([
      ['a newer shared import', 400, '2026-09-09', '2026-09-10', false],
      ['a newer lower owned import', 250, '2026-09-11', '2026-09-10', true],
      [
        'the higher total on tied timestamps',
        300,
        '2026-09-10',
        '2026-09-10',
        false,
      ],
      [
        'the owned exercise on tied timestamps and totals',
        350,
        '2026-09-10',
        '2026-09-10',
        true,
      ],
    ] as const)(
      'keeps %s',
      async (_label, calories, ownedUpdated, legacyUpdated, keepOwned) => {
        await sys.query(
          'UPDATE exercise_entries SET calories_burned = $1, updated_at = $2 WHERE id = $3',
          [calories, ownedUpdated, ownedId]
        );
        await sys.query(
          'UPDATE exercise_entries SET updated_at = $1 WHERE id = $2',
          [legacyUpdated, legacyId]
        );
        const before = await entries();
        const survivor = before.find(
          (row) => row.id === (keepOwned ? ownedId : legacyId)
        );
        await sys.query(migration);
        expect(await entries()).toEqual([survivor]);
        await sys.query(migration);
        expect(await entries()).toEqual([survivor]);
        const corrected = await sync(200);
        expect(corrected.id).toBe(survivor.id);
        expect(corrected.calories_burned).toBe(200);
        expect((await entries()).map((row) => row.id)).toEqual([survivor.id]);
      }
    );

    it.each([
      ['manual notes', "notes = 'Evening walk'"],
      ['missing creator', 'created_by_user_id = NULL'],
      ['different creator', 'created_by_user_id = $2'],
      ['different editor', 'updated_by_user_id = $2'],
      ['workout duration', 'duration_minutes = 30'],
      ['provider identity', "source_id = 'activity-1'"],
      ['entry time', "entry_time = '12:00'"],
      ['snapshot metadata', "image_url = 'https://example.test/workout.png'"],
      ['telemetry', 'steps = 100'],
      ['sort order', 'sort_order = 2'],
      ['negative calories', 'calories_burned = -1'],
      ['nonfinite calories', "calories_burned = 'NaN'::numeric"],
      ['infinite calories', "calories_burned = 'Infinity'::numeric"],
      ['another date', "entry_date = '2026-09-09'"],
      [
        'another source',
        "source = 'Health Connect', notes = 'Active calories logged from Health Connect.'",
      ],
      ['another user', 'user_id = $2, created_by_user_id = $2'],
    ])('preserves groups containing %s', async (_label, change) => {
      await sys.query(
        `UPDATE exercise_entries SET ${change} WHERE id = $1`,
        change.includes('$2') ? [legacyId, users[0]] : [legacyId]
      );
      const before = await entries();
      await sys.query(migration);
      expect(await entries()).toEqual(before);
    });

    it.each([
      [
        'activity_details',
        "INSERT INTO exercise_entry_activity_details (exercise_entry_id, provider_name, detail_type, detail_data) VALUES ($1, 'HealthKit', 'workout', '{}')",
      ],
      [
        'sets',
        'INSERT INTO exercise_entry_sets (exercise_entry_id, set_number) VALUES ($1, 1)',
      ],
      [
        'laps',
        "INSERT INTO exercise_entry_laps (exercise_entry_id, user_id, entry_date, lap_index, start_time, end_time, duration_seconds) VALUES ($1, $2, '2026-09-10', 1, now(), now(), 0)",
      ],
      [
        'gps_points',
        "INSERT INTO exercise_entry_gps_points (exercise_entry_id, user_id, entry_date) VALUES ($1, $2, '2026-09-10')",
      ],
      [
        'hr_zones',
        "INSERT INTO exercise_entry_hr_zones (exercise_entry_id, user_id, entry_date, zone_index, seconds_in_zone) VALUES ($1, $2, '2026-09-10', 1, 60)",
      ],
    ])(
      'preserves attached %s even when its owner differs',
      async (table, insert) => {
        await sys.query(
          insert,
          insert.includes('$2') ? [ownedId, users[0]] : [ownedId]
        );
        const before = await entries();
        const children = await sys.query(
          `SELECT * FROM exercise_entry_${table} WHERE exercise_entry_id = $1`,
          [ownedId]
        );
        await sys.query(migration);
        expect(await entries()).toEqual(before);
        expect(
          (
            await sys.query(
              `SELECT * FROM exercise_entry_${table} WHERE exercise_entry_id = $1`,
              [ownedId]
            )
          ).rows
        ).toEqual(children.rows);
      }
    );

    it('preserves duplicates without evidence of a shared exercise', async () => {
      await sys.query(
        'UPDATE exercise_entries SET exercise_id = (SELECT exercise_id FROM exercise_entries WHERE id = $1) WHERE id = $2',
        [ownedId, legacyId]
      );
      const before = await entries();
      await sys.query(migration);
      expect(await entries()).toEqual(before);
    });
  });
});

// Challenges: joining is the consent. A member reads the challenge's rows; a
// non-member, and a family delegate acting for a member, read nothing; the app
// role cannot write any of it; the exercise-entry trigger queues the changed
// day; deleting an account removes that person's challenge rows.
describe.runIf(RUN)('Challenge membership RLS', () => {
  const HOST = '00000000-0000-4000-b400-000000000001';
  const AMY = '00000000-0000-4000-b400-000000000002';
  const OUTSIDER = '00000000-0000-4000-b400-000000000003';
  const USERS = [HOST, AMY, OUTSIDER];
  let challengeId = '';
  let sys: pg.PoolClient;

  const rules = JSON.stringify({ version: 1, metric: 'steps' });

  beforeAll(async () => {
    sys = await getSystemClient();
    await sys.query('DELETE FROM public."user" WHERE id = ANY($1::uuid[])', [
      USERS,
    ]);
    for (const id of USERS) {
      await sys.query(
        'INSERT INTO public."user" (id, email, email_verified) VALUES ($1, $2, true)',
        [id, `rls-challenge-${id}@example.test`]
      );
    }
    // The outsider holds full diary access to the host's account.
    await sys.query(
      `INSERT INTO public.family_access
         (owner_user_id, family_user_id, family_email, access_permissions, is_active, status)
       VALUES ($1, $2, 'rls-challenge-delegate@example.test', '{"can_manage_diary": true, "can_view_reports": true}'::jsonb, true, 'active')`,
      [HOST, OUTSIDER]
    );
    const c = await sys.query(
      `INSERT INTO public.challenges (owner_user_id, name, rules, start_date, end_date)
       VALUES ($1, 'rls-challenge', $2::jsonb, '2026-11-09', '2026-11-30') RETURNING id`,
      [HOST, rules]
    );
    challengeId = c.rows[0].id;
    await sys.query(
      `INSERT INTO public.challenge_members (challenge_id, user_id, role, display_name)
       VALUES ($1, $2, 'host', 'Host'), ($1, $3, 'member', 'Amy')`,
      [challengeId, HOST, AMY]
    );
    await sys.query(
      `INSERT INTO public.challenge_daily_scores (challenge_id, user_id, day, total)
       VALUES ($1, $2, '2026-11-10', 9000), ($1, $3, '2026-11-10', 12000)`,
      [challengeId, HOST, AMY]
    );
    await sys.query(
      `INSERT INTO public.challenge_rule_changes (challenge_id, changed_by_user_id, effective_from, rules)
       VALUES ($1, $2, '2026-11-09', $3::jsonb)`,
      [challengeId, HOST, rules]
    );
    await sys.query(
      `INSERT INTO public.challenge_results (challenge_id, period_start, period_end, user_id, display_name, rank, total)
       VALUES ($1, '2026-11-09', '2026-11-15', $2, 'Amy', 1, 12000)`,
      [challengeId, AMY]
    );
  });

  afterAll(async () => {
    try {
      await sys.query('DELETE FROM public.challenges WHERE id = $1', [
        challengeId,
      ]);
      await sys.query('DELETE FROM public."user" WHERE id = ANY($1::uuid[])', [
        USERS,
      ]);
    } finally {
      sys.release();
    }
  });

  const count = async (
    userId: string,
    actor: string,
    table: string
  ): Promise<number> => {
    const client = await getClient(userId, actor);
    try {
      const { rows } = await client.query(
        `SELECT COUNT(*)::int AS n FROM public.${table} WHERE ${
          table === 'challenges' ? 'id' : 'challenge_id'
        } = $1`,
        [challengeId]
      );
      return rows[0].n;
    } finally {
      client.release();
    }
  };

  it('a member reads the challenge, its members, scores, results and rules log', async () => {
    expect(await count(AMY, AMY, 'challenges')).toBe(1);
    expect(await count(AMY, AMY, 'challenge_members')).toBe(2);
    expect(await count(AMY, AMY, 'challenge_daily_scores')).toBe(2);
    expect(await count(AMY, AMY, 'challenge_results')).toBe(1);
    expect(await count(AMY, AMY, 'challenge_rule_changes')).toBe(1);
  });

  it("the list's rules log read returns only the member's own challenges", async () => {
    const mine = await challengeRepository.getRuleLogsForMember(AMY, [
      challengeId,
    ]);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.challenge_id).toBe(challengeId);
    // An id the caller is not a member of reads nothing
    expect(
      await challengeRepository.getRuleLogsForMember(OUTSIDER, [challengeId])
    ).toEqual([]);
    expect(await challengeRepository.getRuleLogsForMember(AMY, [])).toEqual([]);
  });

  it.each([
    ['a non-member', OUTSIDER, OUTSIDER],
    ['a diary delegate acting for the host', HOST, OUTSIDER],
  ])('%s reads nothing', async (_label, userId, actor) => {
    for (const table of [
      'challenges',
      'challenge_members',
      'challenge_daily_scores',
      'challenge_activity_cards',
      'challenge_results',
      'challenge_rule_changes',
    ]) {
      expect(await count(userId, actor, table), table).toBe(0);
    }
  });

  it('the app role cannot write challenge rows, even as the host', async () => {
    const client = await getClient(HOST, HOST);
    try {
      await expect(
        client.query(
          `INSERT INTO public.challenge_daily_scores (challenge_id, user_id, day, total)
           VALUES ($1, $2, '2026-11-11', 99999)`,
          [challengeId, HOST]
        )
      ).rejects.toMatchObject({ code: '42501' });
      const updated = await client.query(
        "UPDATE public.challenges SET name = 'hijacked' WHERE id = $1",
        [challengeId]
      );
      expect(updated.rowCount).toBe(0);
      const deleted = await client.query(
        'DELETE FROM public.challenge_members WHERE challenge_id = $1',
        [challengeId]
      );
      expect(deleted.rowCount).toBe(0);
      expect(await count(HOST, HOST, 'challenge_score_queue')).toBe(0);
    } finally {
      client.release();
    }
  });

  it('an exercise entry on a challenge day queues that member-day; one outside it does not', async () => {
    const client = await getClient(AMY, AMY);
    try {
      await client.query(
        `INSERT INTO exercise_entries (user_id, entry_date, calories_burned, duration_minutes, exercise_name)
         VALUES ($1, '2026-11-12', 100, 30, 'rls-challenge run'),
                ($1, '2026-12-05', 100, 30, 'rls-challenge late run')`,
        [AMY]
      );
    } finally {
      client.release();
    }
    const { rows } = await sys.query(
      `SELECT TO_CHAR(day, 'YYYY-MM-DD') AS day FROM public.challenge_score_queue
        WHERE challenge_id = $1 AND user_id = $2 ORDER BY day`,
      [challengeId, AMY]
    );
    expect(rows.map((r: { day: string }) => r.day)).toEqual(['2026-11-12']);
  });

  it('a taken queue day stays queued until it is acked, and a day queued again since survives the ack', async () => {
    const mine = (batches: QueuedMemberDays[]) =>
      batches.filter(
        (b) => b.challenge_id === challengeId && b.user_id === AMY
      );
    const [batch] = mine(await challengeRepository.takeQueuedDays(500, 0, 600));
    expect(batch?.days).toEqual(['2026-11-12']);
    // Leased: still in the table, but not taken again
    expect(mine(await challengeRepository.takeQueuedDays(500, 0, 600))).toEqual(
      []
    );
    // A new edit re-queues the day while it is being scored; the ack keeps it
    await challengeRepository.enqueueDays(challengeId, AMY, ['2026-11-12']);
    await challengeRepository.ackQueuedDays(batch!);
    const [again] = mine(await challengeRepository.takeQueuedDays(500, 0, 600));
    expect(again?.days).toEqual(['2026-11-12']);
    await challengeRepository.ackQueuedDays(again!);
    const left = await sys.query(
      'SELECT COUNT(*)::int AS n FROM public.challenge_score_queue WHERE challenge_id = $1',
      [challengeId]
    );
    expect(left.rows[0].n).toBe(0);
  });

  it('two overlapping rules changes: the one written last wins, not the one that started first', async () => {
    const steps = { version: 1, metric: 'steps' };
    const a = await getSystemClient();
    try {
      await a.query('BEGIN');
      await a.query('SELECT now()'); // A's transaction (and created_at) starts here
      await new Promise((r) => setTimeout(r, 20));
      await challengeRepository.updateRules(
        challengeId,
        HOST,
        { ...steps, dailyCap: 5000 },
        '2026-11-16',
        1
      );
      await a.query(
        'UPDATE public.challenges SET rules = $2::jsonb WHERE id = $1',
        [challengeId, JSON.stringify({ ...steps, dailyCap: 7000 })]
      );
      await a.query(
        `INSERT INTO public.challenge_rule_changes (challenge_id, changed_by_user_id, effective_from, rules)
         VALUES ($1, $2, '2026-11-16', $3::jsonb)`,
        [challengeId, HOST, JSON.stringify({ ...steps, dailyCap: 7000 })]
      );
      await a.query('COMMIT');
    } finally {
      a.release();
    }
    const changes = await challengeRepository.getRuleChanges(challengeId);
    const late = changes.filter((c) => c.effective_from === '2026-11-16');
    // A started first, so its created_at is earlier, but it was written last
    expect(late.map((c) => (c.rules as { dailyCap: number }).dailyCap)).toEqual(
      [5000, 7000]
    );
    expect(new Date(late[1]!.created_at).getTime()).toBeLessThan(
      new Date(late[0]!.created_at).getTime()
    );
    expect(rulesForDay(changes, '2026-11-16').dailyCap).toBe(7000);
  });

  it('scoring runs for one member and challenge do not overlap', async () => {
    const order: string[] = [];
    let release!: () => void;
    const held = new Promise<void>((r) => {
      release = r;
    });
    let firstStarted!: () => void;
    const started = new Promise<void>((r) => {
      firstStarted = r;
    });
    const tasks: Promise<unknown>[] = [];
    try {
      tasks.push(
        challengeRepository.withScoringLock(challengeId, AMY, async () => {
          order.push('first:start');
          firstStarted(); // the lock is held from here until release()
          await held;
          order.push('first:end');
        })
      );
      await Promise.race([started, tasks[0]]);
      expect(order).toEqual(['first:start']);
      tasks.push(
        challengeRepository.withScoringLock(challengeId, AMY, async () => {
          order.push('second:start');
        })
      );
      // Wait until the second run is queued behind the advisory lock
      const deadline = Date.now() + 5000;
      let waiting = 0;
      while (waiting === 0 && Date.now() < deadline) {
        // Only this member's scoring lock (the key withScoringLock takes:
        // a bigint split into classid and objid), so another test's
        // advisory waiter cannot change the count
        const r = await sys.query(
          `SELECT COUNT(*)::int AS n FROM pg_locks
            WHERE locktype = 'advisory' AND NOT granted AND objsubid = 1
              AND ((classid::bigint << 32) | objid::bigint) = hashtext($1)::bigint
              AND database = (
                SELECT oid FROM pg_database WHERE datname = current_database())`,
          [`challenge-score:${challengeId}:${AMY}`]
        );
        waiting = r.rows[0].n;
        if (waiting === 0) await new Promise((r) => setImmediate(r));
      }
      expect(waiting).toBe(1);
      expect(order).toEqual(['first:start']);
    } finally {
      release();
      await Promise.allSettled(tasks);
    }
    await Promise.all(tasks);
    expect(order).toEqual(['first:start', 'first:end', 'second:start']);
  });

  const clearQueue = () =>
    sys.query(
      'DELETE FROM public.challenge_score_queue WHERE challenge_id = $1',
      [challengeId]
    );
  const queued = async (): Promise<string[]> => {
    const { rows } = await sys.query(
      `SELECT user_id || ' ' || TO_CHAR(day, 'YYYY-MM-DD') AS k
         FROM public.challenge_score_queue WHERE challenge_id = $1 ORDER BY k`,
      [challengeId]
    );
    return rows.map((r: { k: string }) =>
      r.k.replace(AMY, 'amy').replace(HOST, 'host')
    );
  };

  it('steps from a check-in or a synced daily summary queue the day; a weight-only check-in does not', async () => {
    await clearQueue();
    await sys.query(
      `INSERT INTO public.check_in_measurements (user_id, entry_date, weight)
       VALUES ($1, '2026-11-18', 70)`,
      [AMY]
    );
    expect(await queued()).toEqual([]);
    await sys.query(
      `UPDATE public.check_in_measurements SET steps = 8000
        WHERE user_id = $1 AND entry_date = '2026-11-18'`,
      [AMY]
    );
    expect(await queued()).toEqual(['amy 2026-11-18']);
    await clearQueue();
    // Same steps again: nothing changed, nothing queued
    await sys.query(
      `UPDATE public.check_in_measurements SET steps = 8000, weight = 71
        WHERE user_id = $1 AND entry_date = '2026-11-18'`,
      [AMY]
    );
    expect(await queued()).toEqual([]);
    await sys.query(
      `INSERT INTO public.daily_health_metrics (user_id, entry_date, source_provider, total_steps)
       VALUES ($1, '2026-11-19', 'rls-challenge', 4000)`,
      [AMY]
    );
    await sys.query(
      `UPDATE public.daily_health_metrics SET total_steps = 9000
        WHERE user_id = $1 AND entry_date = '2026-11-19' AND source_provider = 'rls-challenge'`,
      [AMY]
    );
    // Outside the challenge's dates: not queued
    await sys.query(
      `INSERT INTO public.daily_health_metrics (user_id, entry_date, source_provider, total_steps)
       VALUES ($1, '2026-12-05', 'rls-challenge', 4000)`,
      [AMY]
    );
    expect(await queued()).toEqual(['amy 2026-11-19']);
    await clearQueue();
    // Moved to another day: both days
    await sys.query(
      `UPDATE public.check_in_measurements SET entry_date = '2026-11-17'
        WHERE user_id = $1 AND entry_date = '2026-11-18'`,
      [AMY]
    );
    expect(await queued()).toEqual(['amy 2026-11-17', 'amy 2026-11-18']);
    await clearQueue();
    await sys.query(
      "DELETE FROM public.daily_health_metrics WHERE user_id = $1 AND source_provider = 'rls-challenge'",
      [AMY]
    );
    await sys.query(
      'DELETE FROM public.check_in_measurements WHERE user_id = $1',
      [AMY]
    );
    expect(await queued()).toEqual(['amy 2026-11-17', 'amy 2026-11-19']);
    await clearQueue();
  });

  it("a calorie link's resolution reaches the scorer, so a custom 0 keeps the SparkyFitness side's own figure under cap", async () => {
    const linkId = randomUUID();
    const inserted = await sys.query(
      `INSERT INTO public.exercise_entries
         (user_id, entry_date, entry_time, calories_burned, calories_applied, duration_minutes,
          exercise_name, source, source_id, calorie_link_id, calorie_link_resolution)
       VALUES ($1, '2026-11-24', '07:00', 280, 0, 30, 'rls-challenge live run', 'sparky', NULL, $2, 'custom'),
              ($1, '2026-11-24', '07:30', 300, 0, 30, 'rls-challenge watch run', 'garmin', 'rls-link-1', $2, 'custom')
       RETURNING id`,
      [AMY, linkId]
    );
    try {
      const rows = await challengeRepository.getMemberEntries(
        AMY,
        '2026-11-24',
        '2026-11-24'
      );
      expect(rows.map((r) => r.calorie_link_resolution)).toEqual([
        'custom',
        'custom',
      ]);
      const rules = challengeRulesSchema.parse({
        version: 1,
        metric: 'active_calories',
        activities: { manualEntries: 'cap' },
      });
      const scored = challengeTypedCalories(rows.map(toChallengeEntry), rules);
      expect(
        Object.fromEntries(scored.map((e) => [e.source, e.activeCalories]))
      ).toEqual({ sparky: 280, garmin: 0 });
    } finally {
      await sys.query(
        'DELETE FROM public.exercise_entries WHERE id = ANY($1::uuid[])',
        [inserted.rows.map((r) => r.id)]
      );
    }
  });

  it("a calorie link's other side on another date is read by its source only, from the member's own rows", async () => {
    const linkId = randomUUID();
    const inserted = await sys.query(
      `INSERT INTO public.exercise_entries
         (user_id, entry_date, entry_time, calories_burned, calories_applied, duration_minutes,
          exercise_name, source, source_id, calorie_link_id, calorie_link_resolution)
       VALUES ($1, '2026-11-25', '07:00', 300, 0, 30, 'rls-challenge watch run', 'garmin', 'rls-link-2', $2, 'custom'),
              ($1, '2026-11-26', '07:00', 250, 800, 30, 'rls-challenge typed run', 'Manual', NULL, $2, 'custom'),
              ($3, '2026-11-25', '07:00', 100, 0, 30, 'rls-challenge other run', 'polar', 'rls-link-3', $2, 'custom')
       RETURNING id`,
      [AMY, linkId, OUTSIDER]
    );
    try {
      const rows = await challengeRepository.getMemberEntries(
        AMY,
        '2026-11-25',
        '2026-11-25'
      );
      // Only the watch run is read; its partner is known by source alone,
      // and another user's row under the same id is not seen
      expect(rows.map((r) => [r.source, r.calorie_link_sources])).toEqual([
        ['garmin', ['Manual']],
      ]);
      const rules = challengeRulesSchema.parse({
        version: 1,
        metric: 'active_calories',
        activities: { manualEntries: 'cap' },
      });
      const scored = challengeTypedCalories(rows.map(toChallengeEntry), rules);
      expect(scored.map((e) => e.activeCalories)).toEqual([300]);
    } finally {
      await sys.query(
        'DELETE FROM public.exercise_entries WHERE id = ANY($1::uuid[])',
        [inserted.rows.map((r) => r.id)]
      );
    }
  });
  it('a planned session from a plan: scoring sees it as planned until a set is checked off, and checking off or finishing queues the day', async () => {
    await clearQueue();
    const session = await sys.query(
      `INSERT INTO public.exercise_preset_entries (user_id, name, entry_date, source)
       VALUES ($1, 'rls-challenge plan day', '2026-11-20', 'Workout Plan') RETURNING id`,
      [AMY]
    );
    const sessionId = session.rows[0].id as string;
    const entry = await sys.query(
      `INSERT INTO public.exercise_entries
         (user_id, entry_date, calories_burned, duration_minutes, exercise_name, source, exercise_preset_entry_id)
       VALUES ($1, '2026-11-20', 100, 45, 'rls-challenge bench', 'Workout Plan', $2) RETURNING id`,
      [AMY, sessionId]
    );
    const entryId = entry.rows[0].id as string;
    const set = await sys.query(
      `INSERT INTO public.exercise_entry_sets (exercise_entry_id, set_number, reps, weight)
       VALUES ($1, 1, 8, 60) RETURNING id`,
      [entryId]
    );
    const setId = set.rows[0].id as number;
    await clearQueue();

    const [planned] = await challengeRepository.getMemberEntries(
      AMY,
      '2026-11-20',
      '2026-11-20'
    );
    expect(planned?.session).toMatchObject({
      source: 'Workout Plan',
      finished_at: null,
      edited: false,
      has_plan_assignment: false,
      sets: [{ completed_at: null }],
    });
    expect(planned?.edited).toBe(false);
    expect(isPlannedEntryRow(planned!)).toBe(true);

    // A note added to the untouched session: it is the member's workout now,
    // and the day is queued once (a second save queues nothing more)
    const plain = await sys.query(
      `INSERT INTO public.exercise_preset_entries (user_id, name, entry_date, source)
       VALUES ($1, 'rls-challenge plan note', '2026-11-21', 'Workout Plan') RETURNING id`,
      [AMY]
    );
    await sys.query(
      `INSERT INTO public.exercise_entries
         (user_id, entry_date, calories_burned, duration_minutes, exercise_name, source, exercise_preset_entry_id)
       VALUES ($1, '2026-11-21', 100, 30, 'rls-challenge squat', 'Workout Plan', $2)`,
      [AMY, plain.rows[0].id]
    );
    await clearQueue();
    await sys.query(
      `UPDATE public.exercise_preset_entries
          SET notes = 'felt good', updated_at = created_at + interval '1 minute'
        WHERE id = $1`,
      [plain.rows[0].id]
    );
    expect(await queued()).toEqual(['amy 2026-11-21']);
    const [noted] = await challengeRepository.getMemberEntries(
      AMY,
      '2026-11-21',
      '2026-11-21'
    );
    expect(noted?.session?.edited).toBe(true);
    expect(isPlannedEntryRow(noted!)).toBe(false);
    await clearQueue();
    await sys.query(
      `UPDATE public.exercise_preset_entries
          SET notes = 'felt great', updated_at = created_at + interval '2 minutes'
        WHERE id = $1`,
      [plain.rows[0].id]
    );
    expect(await queued()).toEqual([]);
    await sys.query(
      'DELETE FROM public.exercise_preset_entries WHERE id = $1',
      [plain.rows[0].id]
    );
    await clearQueue();

    // Editing reps alone changes no status: nothing queued by the set
    await sys.query(
      'UPDATE public.exercise_entry_sets SET reps = 9 WHERE id = $1',
      [setId]
    );
    expect(await queued()).toEqual([]);
    await sys.query(
      'UPDATE public.exercise_entry_sets SET completed_at = now() WHERE id = $1',
      [setId]
    );
    expect(await queued()).toEqual(['amy 2026-11-20']);
    const [started] = await challengeRepository.getMemberEntries(
      AMY,
      '2026-11-20',
      '2026-11-20'
    );
    expect(isPlannedEntryRow(started!)).toBe(false);

    await clearQueue();
    await sys.query(
      'UPDATE public.exercise_preset_entries SET finished_at = now() WHERE id = $1',
      [sessionId]
    );
    expect(await queued()).toEqual(['amy 2026-11-20']);
    await clearQueue();
    // A set added already started, then removed: the day is queued each time
    const extra = await sys.query(
      `INSERT INTO public.exercise_entry_sets (exercise_entry_id, set_number, reps, weight, started_at)
       VALUES ($1, 2, 8, 60, now()) RETURNING id`,
      [entryId]
    );
    expect(await queued()).toEqual(['amy 2026-11-20']);
    await clearQueue();
    await sys.query('DELETE FROM public.exercise_entry_sets WHERE id = $1', [
      extra.rows[0].id,
    ]);
    expect(await queued()).toEqual(['amy 2026-11-20']);
    await sys.query(
      'DELETE FROM public.exercise_preset_entries WHERE id = $1',
      [sessionId]
    );
    await clearQueue();
  });

  it('the app role cannot queue days through the queue helper', async () => {
    const client = await getClient(AMY, AMY);
    try {
      await expect(
        client.query('SELECT public.queue_challenge_member_day($1, $2::date)', [
          AMY,
          '2026-11-21',
        ])
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      client.release();
    }
    expect(await queued()).toEqual([]);
  });

  it('a workout moved out of a frozen period takes its card along', async () => {
    const entry = await sys.query(
      `INSERT INTO public.exercise_entries (user_id, entry_date, calories_burned, duration_minutes, exercise_name)
       VALUES ($1, '2026-11-17', 100, 30, 'rls-challenge moved run') RETURNING id`,
      [AMY]
    );
    const entryId = entry.rows[0].id as string;
    // Its card from when it sat on 11-10, in the frozen first week
    await sys.query(
      `INSERT INTO public.challenge_activity_cards
         (challenge_id, user_id, exercise_entry_id, day, activity_type, minutes, points)
       VALUES ($1, $2, $3, '2026-11-10', 'run', 30, 30)`,
      [challengeId, AMY, entryId]
    );
    await challengeRepository.saveMemberDays(
      challengeId,
      AMY,
      '2026-11-16',
      '2026-11-22',
      [],
      [
        {
          exercise_entry_id: entryId,
          day: '2026-11-17',
          activity_type: 'run',
          name: 'rls-challenge moved run',
          minutes: 30,
          distance_meters: null,
          pace_seconds_per_km: null,
          avg_heart_rate: null,
          max_heart_rate: null,
          points: 45,
        },
      ]
    );
    const { rows } = await sys.query(
      `SELECT TO_CHAR(day, 'YYYY-MM-DD') AS day, points
         FROM public.challenge_activity_cards WHERE exercise_entry_id = $1`,
      [entryId]
    );
    expect(rows).toEqual([{ day: '2026-11-17', points: 45 }]);
    await sys.query('DELETE FROM public.exercise_entries WHERE id = $1', [
      entryId,
    ]);
    await clearQueue();
  });

  it('a rules change queues its first day for every member, so days scored from it on are rescored', async () => {
    await clearQueue();
    await challengeRepository.updateRules(
      challengeId,
      HOST,
      { version: 1, metric: 'steps', dailyCap: 6000 },
      '2026-11-23',
      1
    );
    expect(await queued()).toEqual(['host 2026-11-23', 'amy 2026-11-23']);
    // A run that took the day before the change keeps it queued: its ack no
    // longer matches the requeued row
    await clearQueue();
    await challengeRepository.enqueueDays(challengeId, AMY, ['2026-11-23']);
    const [taken] = (
      await challengeRepository.takeQueuedDays(500, 0, 600)
    ).filter((b) => b.challenge_id === challengeId && b.user_id === AMY);
    await challengeRepository.updateRules(
      challengeId,
      HOST,
      { version: 1, metric: 'steps', dailyCap: 6500 },
      '2026-11-23',
      1
    );
    await challengeRepository.ackQueuedDays(taken!);
    // The log records what each change replaced, read under the row lock
    const log = await sys.query(
      `SELECT rules->>'dailyCap' AS cap, previous_rules->>'dailyCap' AS prev
         FROM public.challenge_rule_changes
        WHERE challenge_id = $1 AND effective_from = '2026-11-23' ORDER BY seq`,
      [challengeId]
    );
    expect(log.rows).toEqual([
      { cap: '6000', prev: '7000' },
      { cap: '6500', prev: '6000' },
    ]);
    expect(await queued()).toEqual(['host 2026-11-23', 'amy 2026-11-23']);
    await clearQueue();
  });

  it('only the current host writes rules; results freeze only for the current members; zone rows queue their day', async () => {
    // Not the host (a member, someone outside): nothing written
    const before = await challengeRepository.getRuleChanges(challengeId);
    expect(
      await challengeRepository.updateRules(
        challengeId,
        AMY,
        { version: 1, metric: 'steps', dailyCap: 1 },
        '2026-11-30',
        1
      )
    ).toBe(false);
    expect(await challengeRepository.getRuleChanges(challengeId)).toHaveLength(
      before.length
    );

    // Standings worked out for other members than the current ones (someone
    // left or joined since) freeze nothing; the current members' do
    const result = (user_id: string, i: number) => ({
      user_id,
      display_name: 'X',
      rank: i + 1,
      total: 10 - i,
      minutes: 0,
      is_winner: i === 0,
      reached_on: null,
      detail: {},
    });
    expect(
      await challengeRepository.insertResults(
        challengeId,
        '2026-11-30',
        '2026-11-30',
        () => [AMY, OUTSIDER].map(result)
      )
    ).toBe(false);
    expect(
      await challengeRepository.insertResults(
        challengeId,
        '2026-11-30',
        '2026-11-30',
        () => [AMY].map(result)
      )
    ).toBe(false);
    expect(
      await challengeRepository.insertResults(
        challengeId,
        '2026-11-30',
        '2026-11-30',
        () => [AMY, HOST].map(result)
      )
    ).toBe(true);
    const { rows } = await sys.query(
      `SELECT COUNT(*)::int AS n FROM public.challenge_results
        WHERE challenge_id = $1 AND period_start = '2026-11-30'`,
      [challengeId]
    );
    expect(rows[0].n).toBe(2);
    // The period stays frozen when its result rows go (an account deletion
    // removes that member's), so it is never worked out again
    await sys.query(
      "DELETE FROM public.challenge_results WHERE challenge_id = $1 AND period_start = '2026-11-30'",
      [challengeId]
    );
    expect(await challengeRepository.frozenPeriodStarts(challengeId)).toContain(
      '2026-11-30'
    );
    expect(
      await challengeRepository.insertResults(
        challengeId,
        '2026-11-30',
        '2026-11-30',
        () => [AMY, HOST].map(result)
      )
    ).toBe(false);
    await sys.query(
      "UPDATE public.challenges SET frozen_period_starts = '{}' WHERE id = $1",
      [challengeId]
    );

    // Zone rows written after the workout queue its day again
    const entry = await sys.query(
      `INSERT INTO public.exercise_entries (user_id, entry_date, calories_burned, duration_minutes, exercise_name)
       VALUES ($1, '2026-11-24', 100, 30, 'rls-challenge zoned run') RETURNING id`,
      [AMY]
    );
    await clearQueue();
    await sys.query(
      `INSERT INTO public.exercise_entry_hr_zones
         (user_id, exercise_entry_id, entry_date, zone_index, seconds_in_zone)
       VALUES ($1, $2, '2026-11-24', 3, 1200)`,
      [AMY, entry.rows[0].id]
    );
    expect(await queued()).toEqual(['amy 2026-11-24']);
    await sys.query('DELETE FROM public.exercise_entries WHERE id = $1', [
      entry.rows[0].id,
    ]);
    await clearQueue();
  });

  it('a freeze waits for a score save in flight and freezes what it saved', async () => {
    const day = '2026-12-07';
    const result = (user_id: string, i: number) => ({
      user_id,
      display_name: 'X',
      rank: i + 1,
      total: 10 - i,
      minutes: 0,
      is_winner: i === 0,
      reached_on: null,
      detail: {},
    });
    // A rescore's save, mid-transaction: saveMemberDays holds its member row
    // FOR SHARE and has written the day, not yet committed
    const save = await getSystemClient();
    let seen: number | null = null;
    let freezing: Promise<boolean> | undefined;
    try {
      await save.query('BEGIN');
      await save.query(
        'SELECT 1 FROM public.challenge_members WHERE challenge_id = $1 AND user_id = $2 FOR SHARE',
        [challengeId, AMY]
      );
      await save.query(
        `INSERT INTO public.challenge_daily_scores
           (challenge_id, user_id, day, total, effort, step_points, pr_bonus, streak_bonus,
            beat_average_bonus, minutes, steps, workouts, eligible, detail)
         VALUES ($1, $2, $3, 77, 77, 0, 0, 0, 0, 30, 0, 1, true, '{}')`,
        [challengeId, AMY, day]
      );
      freezing = challengeRepository.insertResults(
        challengeId,
        day,
        day,
        (scores) => {
          seen = Number(scores.find((r) => r.user_id === AMY)?.total ?? 0);
          return [AMY, HOST].map(result);
        }
      );
      // The freeze waits on the save's row lock instead of reading around it
      const savePid = (await save.query('SELECT pg_backend_pid() AS pid'))
        .rows[0].pid;
      const saveXid = (
        await save.query('SELECT txid_current()::text::xid AS xid')
      ).rows[0].xid;
      await vi.waitFor(
        async () => {
          const waiting = await sys.query(
            `SELECT count(*)::int AS n FROM pg_locks
              WHERE NOT granted AND locktype = 'transactionid'
                AND transactionid = $1::xid AND pid <> $2`,
            [saveXid, savePid]
          );
          expect(waiting.rows[0].n).toBeGreaterThanOrEqual(1);
        },
        { timeout: 10000, interval: 50 }
      );
      expect(seen).toBeNull();
    } finally {
      await save.query('COMMIT');
      save.release();
    }
    expect(await freezing).toBe(true);
    expect(seen).toBe(77);
    await sys.query(
      'DELETE FROM public.challenge_results WHERE challenge_id = $1 AND period_start = $2',
      [challengeId, day]
    );
    await sys.query(
      'DELETE FROM public.challenge_daily_scores WHERE challenge_id = $1 AND day = $2',
      [challengeId, day]
    );
    await sys.query(
      "UPDATE public.challenges SET frozen_period_starts = '{}' WHERE id = $1",
      [challengeId]
    );
  });

  it('a score save that waits on a freeze skips only the period it froze', async () => {
    const frozenDay = '2026-12-14';
    const openDay = '2026-12-21';
    const periods = [
      { start: '2026-12-14', end: '2026-12-20' },
      { start: '2026-12-21', end: '2026-12-27' },
    ];
    const score = (day: string, total: number) => ({
      day,
      total,
      effort: total,
      step_points: 0,
      pr_bonus: 0,
      streak_bonus: 0,
      beat_average_bonus: 0,
      minutes: 30,
      steps: 0,
      workouts: 1,
      eligible: true,
      detail: {},
    });
    const entry = await sys.query(
      `INSERT INTO public.exercise_entries (user_id, entry_date, calories_burned, duration_minutes, exercise_name)
       VALUES ($1, $2, 100, 30, 'rls-challenge frozen run') RETURNING id`,
      [AMY, frozenDay]
    );
    const entryId = entry.rows[0].id as string;
    // What the period held when the finaliser read it
    await sys.query(
      `INSERT INTO public.challenge_daily_scores
         (challenge_id, user_id, day, total, effort, step_points, pr_bonus, streak_bonus,
          beat_average_bonus, minutes, steps, workouts, eligible, detail)
       VALUES ($1, $2, $3, 5, 5, 0, 0, 0, 0, 30, 0, 1, true, '{}')`,
      [challengeId, AMY, frozenDay]
    );
    await sys.query(
      `INSERT INTO public.challenge_activity_cards
         (challenge_id, user_id, exercise_entry_id, day, activity_type, minutes, points)
       VALUES ($1, $2, $3, $4, 'run', 30, 5)`,
      [challengeId, AMY, entryId, frozenDay]
    );
    // The freeze, mid-transaction: it holds the challenge row FOR UPDATE
    const freeze = await getSystemClient();
    let saving: Promise<void> | undefined;
    try {
      await freeze.query('BEGIN');
      await freeze.query(
        'SELECT id FROM public.challenges WHERE id = $1 FOR UPDATE',
        [challengeId]
      );
      // A queue run that read the period as open saves now
      saving = challengeRepository.saveMemberDays(
        challengeId,
        AMY,
        frozenDay,
        openDay,
        [score(frozenDay, 99), score(openDay, 42)],
        [],
        undefined,
        periods
      );
      const freezePid = (await freeze.query('SELECT pg_backend_pid() AS pid'))
        .rows[0].pid;
      const freezeXid = (
        await freeze.query('SELECT txid_current()::text::xid AS xid')
      ).rows[0].xid;
      await vi.waitFor(
        async () => {
          const waiting = await sys.query(
            `SELECT count(*)::int AS n FROM pg_locks
              WHERE NOT granted AND locktype = 'transactionid'
                AND transactionid = $1::xid AND pid <> $2`,
            [freezeXid, freezePid]
          );
          expect(waiting.rows[0].n).toBeGreaterThanOrEqual(1);
        },
        { timeout: 10000, interval: 50 }
      );
      await freeze.query(
        `UPDATE public.challenges
            SET frozen_period_starts = array_append(frozen_period_starts, $2::date)
          WHERE id = $1`,
        [challengeId, frozenDay]
      );
    } finally {
      await freeze.query('COMMIT');
      freeze.release();
    }
    await saving;
    try {
      const days = await sys.query(
        `SELECT TO_CHAR(day, 'YYYY-MM-DD') AS day, total FROM public.challenge_daily_scores
          WHERE challenge_id = $1 AND user_id = $2 AND day BETWEEN $3 AND $4 ORDER BY day`,
        [challengeId, AMY, frozenDay, openDay]
      );
      expect(days.rows).toEqual([
        { day: frozenDay, total: 5 },
        { day: openDay, total: 42 },
      ]);
      const cards = await sys.query(
        'SELECT points FROM public.challenge_activity_cards WHERE exercise_entry_id = $1',
        [entryId]
      );
      expect(cards.rows).toEqual([{ points: 5 }]);
    } finally {
      await sys.query(
        'DELETE FROM public.challenge_daily_scores WHERE challenge_id = $1 AND day BETWEEN $2 AND $3',
        [challengeId, frozenDay, openDay]
      );
      await sys.query('DELETE FROM public.exercise_entries WHERE id = $1', [
        entryId,
      ]);
      await sys.query(
        "UPDATE public.challenges SET frozen_period_starts = '{}' WHERE id = $1",
        [challengeId]
      );
      await clearQueue();
    }
  });

  it('a rules change takes effect from the day the recheck decides under the row lock', async () => {
    await clearQueue();
    let lockedStart = '';
    expect(
      await challengeRepository.updateRules(
        challengeId,
        HOST,
        { version: 1, metric: 'steps', dailyCap: 6200 },
        '2026-12-07',
        1,
        (locked) => {
          lockedStart = locked.start_date;
          return '2026-12-14';
        }
      )
    ).toBe(true);
    expect(lockedStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const log = await sys.query(
      `SELECT TO_CHAR(effective_from, 'YYYY-MM-DD') AS d FROM public.challenge_rule_changes
        WHERE challenge_id = $1 AND rules->>'dailyCap' = '6200'`,
      [challengeId]
    );
    expect(log.rows).toEqual([{ d: '2026-12-14' }]);
    expect(await queued()).toEqual(['host 2026-12-14', 'amy 2026-12-14']);
    // A recheck that refuses writes nothing
    await expect(
      challengeRepository.updateRules(
        challengeId,
        HOST,
        { version: 1, metric: 'steps', dailyCap: 6300 },
        '2026-12-07',
        1,
        () => {
          throw new Error('refused under the lock');
        }
      )
    ).rejects.toThrow('refused under the lock');
    const none = await sys.query(
      `SELECT 1 FROM public.challenge_rule_changes
        WHERE challenge_id = $1 AND rules->>'dailyCap' = '6300'`,
      [challengeId]
    );
    expect(none.rowCount).toBe(0);
    await sys.query(
      `DELETE FROM public.challenge_rule_changes
        WHERE challenge_id = $1 AND rules->>'dailyCap' = '6200'`,
      [challengeId]
    );
    await clearQueue();
  });

  it("deleting an account removes that person's challenge rows", async () => {
    await sys.query('DELETE FROM public."user" WHERE id = $1', [AMY]);
    const left = await sys.query(
      `SELECT
         (SELECT COUNT(*)::int FROM public.challenge_members WHERE user_id = $1) AS members,
         (SELECT COUNT(*)::int FROM public.challenge_daily_scores WHERE user_id = $1) AS scores,
         (SELECT COUNT(*)::int FROM public.challenge_results WHERE user_id = $1) AS results,
         (SELECT COUNT(*)::int FROM public.challenge_score_queue WHERE user_id = $1) AS queued`,
      [AMY]
    );
    expect(left.rows[0]).toEqual({
      members: 0,
      scores: 0,
      results: 0,
      queued: 0,
    });
  });
});
