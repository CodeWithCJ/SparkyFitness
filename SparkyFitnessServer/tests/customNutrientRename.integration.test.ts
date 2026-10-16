import pg from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getSystemClient, endPool } from '../db/poolManager.js';
import { initializeDatabase } from '../utils/initializeDatabase.js';
import customNutrientService from '../services/customNutrientService.js';

async function dbReachable(): Promise<boolean> {
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
    try {
      await probe.end();
    } catch {
      // ignore close errors
    }
  }
}

// A custom nutrient's name is the key for every value stored about it, so a
// rename has to move all of them, in one transaction, without touching history.
describe('custom nutrient rename integration test', () => {
  let canRun = false;
  let admin: pg.PoolClient | null = null;
  const email = `nutrient-rename-${Date.now()}@example.test`;
  let userId: string;
  let nutrientId: string;
  let otherNutrientId: string;
  let presetId: string;
  let variantId: string;
  let collidingVariantId: string;
  let medicationId: string;
  let foodEntryId: string;
  const OLD = 'Magnesium';
  const NEW = 'Magnesium Glycinate';

  beforeAll(async () => {
    canRun = await dbReachable();
    if (!canRun) return;
    await initializeDatabase();
    admin = await getSystemClient();
    if (!admin) {
      canRun = false;
      return;
    }

    const user = await admin.query(
      `INSERT INTO "user" (id, email, name, email_verified, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'Rename Test User', true, NOW(), NOW())
       RETURNING id`,
      [email]
    );
    userId = user.rows[0].id;

    const nutrient = await admin.query(
      `INSERT INTO user_custom_nutrients (user_id, name, unit)
       VALUES ($1, $2, 'mg') RETURNING id`,
      [userId, OLD]
    );
    nutrientId = nutrient.rows[0].id;
    // A second nutrient whose rename would collide with a leftover key.
    const other = await admin.query(
      `INSERT INTO user_custom_nutrients (user_id, name, unit)
       VALUES ($1, 'Zinc', 'mg') RETURNING id`,
      [userId]
    );
    otherNutrientId = other.rows[0].id;

    await admin.query(
      `INSERT INTO user_nutrient_goal_preferences (user_id, nutrient_key, goal_type)
       VALUES ($1, $2, 'minimum')`,
      [userId, OLD]
    );
    await admin.query(
      `INSERT INTO user_nutrient_display_preferences (user_id, view_group, platform, visible_nutrients)
       VALUES ($1, 'food_database', 'mobile', $2::jsonb),
              ($1, 'goal', 'mobile', $3::jsonb)`,
      [
        userId,
        JSON.stringify(['calories', OLD, 'protein']),
        // Already holds the new name: the old entry must not be duplicated.
        JSON.stringify([OLD, 'calories', NEW]),
      ]
    );

    await admin.query(
      `INSERT INTO user_goals (user_id, goal_date, custom_nutrients)
       VALUES ($1, '2026-01-01', $2::jsonb), ($1, NULL, $3::jsonb)`,
      [
        userId,
        JSON.stringify({ [OLD]: 300 }),
        // Both keys present: the value already at the new name wins.
        JSON.stringify({ [OLD]: 111, [NEW]: 999 }),
      ]
    );
    const preset = await admin.query(
      `INSERT INTO goal_presets (user_id, preset_name, custom_nutrients)
       VALUES ($1, 'Rename preset', $2::jsonb) RETURNING id`,
      [userId, JSON.stringify({ [OLD]: 400, Zinc: 11 })]
    );
    presetId = preset.rows[0].id;

    const food = await admin.query(
      "INSERT INTO foods (name, user_id) VALUES ('Rename Food', $1) RETURNING id",
      [userId]
    );
    const variant = await admin.query(
      `INSERT INTO food_variants (food_id, custom_nutrients)
       VALUES ($1, $2::jsonb) RETURNING id`,
      [food.rows[0].id, JSON.stringify({ [OLD]: 25 })]
    );
    variantId = variant.rows[0].id;
    const colliding = await admin.query(
      `INSERT INTO food_variants (food_id, custom_nutrients)
       VALUES ($1, $2::jsonb) RETURNING id`,
      [food.rows[0].id, JSON.stringify({ [OLD]: 1, [NEW]: 2 })]
    );
    collidingVariantId = colliding.rows[0].id;

    const medication = await admin.query(
      `INSERT INTO medications (user_id, name, nutrients)
       VALUES ($1, 'Rename Supplement', $2::jsonb) RETURNING id`,
      [userId, JSON.stringify({ calories: 5, custom_nutrients: { [OLD]: 50 } })]
    );
    medicationId = medication.rows[0].id;

    // History: a diary snapshot that must keep the name it was logged under.
    const mealType = await admin.query(
      "INSERT INTO meal_types (user_id, name) VALUES ($1, 'Rename Meal') RETURNING id",
      [userId]
    );
    const entry = await admin.query(
      `INSERT INTO food_entries (user_id, meal_type_id, custom_nutrients)
       VALUES ($1, $2, $3::jsonb) RETURNING id`,
      [userId, mealType.rows[0].id, JSON.stringify({ [OLD]: 70 })]
    );
    foodEntryId = entry.rows[0].id;
  });

  afterAll(async () => {
    try {
      if (admin && userId) {
        await admin.query('DELETE FROM "user" WHERE id = $1', [userId]);
      }
    } finally {
      // Release the client and close the pool however setup or cleanup went,
      // or a checked-out client keeps endPool() waiting.
      admin?.release();
      await endPool();
    }
  });

  it('moves every name-keyed value to the new name and leaves history alone', async (ctx) => {
    if (!canRun) {
      ctx.skip();
      return;
    }

    const updated = await customNutrientService.updateCustomNutrient(
      userId,
      nutrientId,
      { name: NEW, unit: 'mg' }
    );
    expect(updated.name).toBe(NEW);

    const goalPref = await admin!.query(
      'SELECT nutrient_key FROM user_nutrient_goal_preferences WHERE user_id = $1',
      [userId]
    );
    expect(goalPref.rows.map((r) => r.nutrient_key)).toEqual([NEW]);

    const display = await admin!.query(
      `SELECT view_group, visible_nutrients FROM user_nutrient_display_preferences
       WHERE user_id = $1 ORDER BY view_group`,
      [userId]
    );
    const byGroup = Object.fromEntries(
      display.rows.map((r) => [r.view_group, r.visible_nutrients])
    );
    // Position kept.
    expect(byGroup.food_database).toEqual(['calories', NEW, 'protein']);
    // The new name was already there: not duplicated.
    expect(byGroup.goal).toEqual(['calories', NEW]);

    const goals = await admin!.query(
      `SELECT goal_date, custom_nutrients FROM user_goals
       WHERE user_id = $1 ORDER BY goal_date NULLS LAST`,
      [userId]
    );
    expect(goals.rows[0].custom_nutrients).toEqual({ [NEW]: 300 });
    // Collision: the value already at the new name is kept, the old key dropped.
    expect(goals.rows[1].custom_nutrients).toEqual({ [NEW]: 999 });

    const preset = await admin!.query(
      'SELECT custom_nutrients FROM goal_presets WHERE id = $1',
      [presetId]
    );
    expect(preset.rows[0].custom_nutrients).toEqual({ [NEW]: 400, Zinc: 11 });

    const variants = await admin!.query(
      'SELECT id, custom_nutrients FROM food_variants WHERE id = ANY($1)',
      [[variantId, collidingVariantId]]
    );
    const variantById = Object.fromEntries(
      variants.rows.map((r) => [r.id, r.custom_nutrients])
    );
    expect(variantById[variantId]).toEqual({ [NEW]: 25 });
    expect(variantById[collidingVariantId]).toEqual({ [NEW]: 2 });

    const medication = await admin!.query(
      'SELECT nutrients FROM medications WHERE id = $1',
      [medicationId]
    );
    expect(medication.rows[0].nutrients).toEqual({
      calories: 5,
      custom_nutrients: { [NEW]: 50 },
    });

    // History keeps the name it was logged under.
    const entry = await admin!.query(
      'SELECT custom_nutrients FROM food_entries WHERE id = $1',
      [foodEntryId]
    );
    expect(entry.rows[0].custom_nutrients).toEqual({ [OLD]: 70 });
  });

  it('rolls everything back, including the definition, when a step fails', async (ctx) => {
    if (!canRun) {
      ctx.skip();
      return;
    }

    // Renaming Zinc to an existing name violates the per-user unique name
    // constraint on the definition itself, so nothing else may change either.
    await expect(
      customNutrientService.updateCustomNutrient(userId, otherNutrientId, {
        name: NEW,
        unit: 'mg',
      })
    ).rejects.toThrow();

    const preset = await admin!.query(
      'SELECT custom_nutrients FROM goal_presets WHERE id = $1',
      [presetId]
    );
    expect(preset.rows[0].custom_nutrients).toEqual({ [NEW]: 400, Zinc: 11 });
    const zinc = await admin!.query(
      'SELECT name FROM user_custom_nutrients WHERE id = $1',
      [otherNutrientId]
    );
    expect(zinc.rows[0].name).toBe('Zinc');
  });
});
