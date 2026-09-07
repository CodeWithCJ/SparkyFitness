import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import cron from 'node-cron';
import type { PoolClient } from 'pg';
import { getSystemClient } from '../db/poolManager.js';
import userRepository from '../models/userRepository.js';
import { log } from '../config/logging.js';
import { todayInZone, addDays } from '@workspace/shared';
import { getDemoEmail, isDemoMode } from '../middleware/demoGuardMiddleware.js';

import { createDefaultNutrientPreferencesForUser } from './nutrientDisplayPreferenceService.js';

import crypto from 'crypto';

function getRuntimeFallbackPassword(): string {
  const secretKey =
    process.env.BETTER_AUTH_SECRET ||
    process.env.SPARKY_FITNESS_API_ENCRYPTION_KEY ||
    'sparky-demo-isolated-seed';
  return (
    crypto
      .createHmac('sha256', secretKey)
      .update('sparky-demo-user-key:' + getDemoEmail())
      .digest('hex') + '!1Aa'
  );
}

export function getDemoCredentials(): {
  email: string;
  fullName: string;
  password: string;
} {
  return {
    email: getDemoEmail(),
    fullName: 'Demo User',
    password:
      process.env.SPARKY_FITNESS_DEMO_PASSWORD?.trim() ||
      getRuntimeFallbackPassword(),
  };
}

interface GpsPoint {
  t: string;
  lat: number;
  lon: number;
  alt: number;
  speed: number;
  hr: number;
  dist: number;
}

/**
 * Generates realistic GPS trackpoints for a 5K outdoor run.
 */
function generateSampleGpsPoints(startTimeStr: string): GpsPoint[] {
  const points: GpsPoint[] = [];
  const start = new Date(startTimeStr).getTime();
  const baseLat = 40.785091;
  const baseLon = -73.968285;
  const numPoints = 35;
  const totalSeconds = 1920; // 32 minutes
  const stepSeconds = Math.floor(totalSeconds / numPoints);

  for (let i = 0; i < numPoints; i++) {
    const t = new Date(start + i * stepSeconds * 1000).toISOString();
    const angle = (i / numPoints) * 2 * Math.PI;
    const lat = Number(
      (
        baseLat +
        Math.sin(angle) * 0.008 +
        (Math.random() - 0.5) * 0.0002
      ).toFixed(6)
    );
    const lon = Number(
      (
        baseLon +
        Math.cos(angle) * 0.008 +
        (Math.random() - 0.5) * 0.0002
      ).toFixed(6)
    );
    const dist = Math.round((i / numPoints) * 5120);
    const speed = Number(
      (2.6 + Math.sin(angle) * 0.3 + (Math.random() - 0.5) * 0.2).toFixed(2)
    );
    const hr = Math.round(
      138 + (i / numPoints) * 22 + (Math.random() - 0.5) * 4
    );
    const alt = Math.round(24 + Math.sin(angle * 2) * 6);

    points.push({
      t,
      lat,
      lon,
      alt,
      speed,
      hr,
      dist,
    });
  }
  return points;
}

/**
 * Safely removes any uploaded files on disk associated with the demo user.
 */
async function removeDemoUploadedFiles(
  client: PoolClient,
  userId: string
): Promise<void> {
  try {
    const baseUploadsDir = process.env.SPARKY_FITNESS_CUSTOM_UPLOADS_DIRECTORY
      ? path.resolve(process.env.SPARKY_FITNESS_CUSTOM_UPLOADS_DIRECTORY)
      : path.resolve(process.cwd(), 'uploads');

    // Clean food entries image folders for demo user
    const foodEntryRes = await client.query(
      'SELECT id FROM food_entries WHERE user_id = $1',
      [userId]
    );
    for (const row of foodEntryRes.rows) {
      const entryDir = path.join(baseUploadsDir, 'food_entries', row.id);
      if (fs.existsSync(entryDir)) {
        await fs.promises
          .rm(entryDir, { recursive: true, force: true })
          .catch(() => {});
      }
    }

    // Clean custom foods image folders for demo user
    const foodsRes = await client.query(
      'SELECT id FROM foods WHERE user_id = $1',
      [userId]
    );
    for (const row of foodsRes.rows) {
      const foodDir = path.join(baseUploadsDir, 'foods', row.id);
      if (fs.existsSync(foodDir)) {
        await fs.promises
          .rm(foodDir, { recursive: true, force: true })
          .catch(() => {});
      }
    }

    // Clean check-in photos for demo user
    const checkInDir = path.join(baseUploadsDir, 'check-in', userId);
    if (fs.existsSync(checkInDir)) {
      await fs.promises
        .rm(checkInDir, { recursive: true, force: true })
        .catch(() => {});
    }

    // Clean exercise entry image files for demo user safely constrained to exercise_entries directory
    const allowedExerciseDir = path.resolve(baseUploadsDir, 'exercise_entries');
    const exerciseRes = await client.query(
      'SELECT image_url FROM exercise_entries WHERE user_id = $1 AND image_url IS NOT NULL',
      [userId]
    );
    for (const row of exerciseRes.rows) {
      if (
        typeof row.image_url === 'string' &&
        row.image_url.startsWith('/uploads/exercise_entries/')
      ) {
        const relativePath = row.image_url.replace(/^\/uploads\//, '');
        const resolvedPath = path.resolve(baseUploadsDir, relativePath);
        if (
          resolvedPath.startsWith(allowedExerciseDir + path.sep) &&
          fs.existsSync(resolvedPath)
        ) {
          await fs.promises.unlink(resolvedPath).catch(() => {});
        }
      }
    }
  } catch (error) {
    log('warn', '[DEMO] Error cleaning up demo user upload files:', error);
  }
}

/**
 * Helper to wipe prior demo user records before re-populating.
 * Scoped strictly to the demo user's ID.
 */
async function cleanDemoUserData(
  client: PoolClient,
  userId: string
): Promise<void> {
  // Clean filesystem upload directories for demo user first
  await removeDemoUploadedFiles(client, userId);

  await client.query('DELETE FROM cycle_daily_entries WHERE user_id = $1', [
    userId,
  ]);
  await client.query('DELETE FROM cycles WHERE user_id = $1', [userId]);
  await client.query('DELETE FROM cycle_settings WHERE user_id = $1', [userId]);
  await client.query(
    'DELETE FROM user_cycle_display_preferences WHERE user_id = $1',
    [userId]
  );
  await client.query('DELETE FROM medication_entries WHERE user_id = $1', [
    userId,
  ]);
  await client.query('DELETE FROM medication_schedules WHERE user_id = $1', [
    userId,
  ]);
  await client.query('DELETE FROM medications WHERE user_id = $1', [userId]);
  await client.query(
    'DELETE FROM user_medication_display_preferences WHERE user_id = $1',
    [userId]
  );
  await client.query(
    'DELETE FROM sleep_entry_stages WHERE entry_id IN (SELECT id FROM sleep_entries WHERE user_id = $1)',
    [userId]
  );
  await client.query('DELETE FROM sleep_entries WHERE user_id = $1', [userId]);
  await client.query('DELETE FROM exercise_entry_hr_zones WHERE user_id = $1', [
    userId,
  ]);
  await client.query('DELETE FROM exercise_entry_laps WHERE user_id = $1', [
    userId,
  ]);
  await client.query(
    'DELETE FROM exercise_entry_gps_points WHERE user_id = $1',
    [userId]
  );
  await client.query(
    'DELETE FROM exercise_entry_activity_details WHERE exercise_entry_id IN (SELECT id FROM exercise_entries WHERE user_id = $1)',
    [userId]
  );
  await client.query(
    'DELETE FROM exercise_entry_sets WHERE exercise_entry_id IN (SELECT id FROM exercise_entries WHERE user_id = $1)',
    [userId]
  );
  await client.query('DELETE FROM exercise_entries WHERE user_id = $1', [
    userId,
  ]);
  await client.query('DELETE FROM exercises WHERE user_id = $1', [userId]);
  await client.query('DELETE FROM water_intake_entries WHERE user_id = $1', [
    userId,
  ]);
  await client.query('DELETE FROM water_intake WHERE user_id = $1', [userId]);
  await client.query('DELETE FROM user_water_containers WHERE user_id = $1', [
    userId,
  ]);
  await client.query('DELETE FROM food_entries WHERE user_id = $1', [userId]);
  await client.query(
    'DELETE FROM food_variants WHERE food_id IN (SELECT id FROM foods WHERE user_id = $1)',
    [userId]
  );
  await client.query('DELETE FROM foods WHERE user_id = $1', [userId]);
  await client.query('DELETE FROM check_in_measurements WHERE user_id = $1', [
    userId,
  ]);
  await client.query('DELETE FROM fasting_logs WHERE user_id = $1', [userId]);
}

/**
 * Creates a custom food record and its matching default food variant.
 */
async function createCustomFoodWithVariant(
  client: PoolClient,
  userId: string,
  data: {
    name: string;
    servingSize: number;
    servingUnit: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    dietaryFiber: number;
    sugars: number;
  }
): Promise<string> {
  const foodRes = await client.query(
    `INSERT INTO foods (id, user_id, name, is_custom, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, true, NOW(), NOW())
     RETURNING id`,
    [userId, data.name]
  );
  const foodId = foodRes.rows[0].id;

  await client.query(
    `INSERT INTO food_variants (
       id, food_id, serving_size, serving_unit, calories, protein, carbs, fat,
       dietary_fiber, sugars, is_default, source, created_at, updated_at
     )
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, true, 'manual', NOW(), NOW())`,
    [
      foodId,
      data.servingSize,
      data.servingUnit,
      data.calories,
      data.protein,
      data.carbs,
      data.fat,
      data.dietaryFiber,
      data.sugars,
    ]
  );

  return foodId;
}

/**
 * Ensures the demo user exists and is populated with rich sample data.
 */
export async function seedDemoUser(): Promise<string> {
  const { email, fullName, password } = getDemoCredentials();
  const client = await getSystemClient();

  try {
    const user = await userRepository.findUserByEmail(email);
    let userId: string;

    const hashedPassword = await bcrypt.hash(password, 10);

    if (!user) {
      log('info', `[DEMO] Creating demo user account: ${email}`);
      userId = uuidv4();
      await userRepository.createUser(userId, email, hashedPassword, fullName);
      log('info', `[DEMO] Demo user account created with ID: ${userId}`);
    } else {
      userId = user.id;
      // Ensure the password hash matches the configured demo password in account table
      const updateRes = await client.query(
        'UPDATE "account" SET password = $1, updated_at = NOW() WHERE user_id = $2 AND provider_id = \'credential\'',
        [hashedPassword, userId]
      );
      if ((updateRes?.rowCount ?? 0) === 0) {
        await client.query(
          'INSERT INTO "account" (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW(), NOW())',
          [email, 'credential', userId, hashedPassword]
        );
      }
      // Scoped clean of prior records before re-populating fresh daily data
      await cleanDemoUserData(client, userId);
    }

    // 1. Update profile with realistic demo user details (valid columns in `profiles`)
    await client.query(
      `UPDATE profiles
       SET full_name = $2,
           date_of_birth = '1995-05-15',
           gender = 'male',
           bio = 'SparkyFitness Demo Account — Daily sandbox resetting at 00:00 UTC',
           updated_at = NOW()
       WHERE id = $1`,
      [userId, fullName]
    );

    // 2. Mark onboarding complete so demo user jumps straight into the app
    await client.query(
      `INSERT INTO onboarding_status (user_id, onboarding_complete, created_at, updated_at)
       VALUES ($1, true, NOW(), NOW())
       ON CONFLICT (user_id) DO UPDATE SET onboarding_complete = true, updated_at = NOW()`,
      [userId]
    );

    // 3. Ensure user preferences are initialized
    await client.query(
      `INSERT INTO user_preferences (user_id, timezone, water_display_unit, created_at, updated_at)
       VALUES ($1, 'UTC', 'ml', NOW(), NOW())
       ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );

    // 4. Initialize default nutrient display preferences
    await createDefaultNutrientPreferencesForUser(userId);

    // 5. Populate or refresh demo fitness records
    await populateDemoDataForUser(userId, client);

    log('info', `[DEMO] Demo data successfully initialized for ${email}`);
    return userId;
  } catch (error) {
    log('error', '[DEMO] Failed to seed demo user data:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Populates sample data (nutrition, workouts, fasting, measurements, sleep, water) relative to today.
 */
async function populateDemoDataForUser(
  userId: string,
  client: PoolClient
): Promise<void> {
  const today = todayInZone('UTC');
  const yesterday = addDays(today, -1);

  // Fetch standard meal types (Breakfast, Lunch, Dinner, Snack)
  const mealTypesRes = await client.query(
    'SELECT id, name FROM meal_types WHERE user_id IS NULL OR user_id = $1 ORDER BY sort_order ASC',
    [userId]
  );
  const mealTypes = new Map<string, string>();
  for (const row of mealTypesRes.rows) {
    mealTypes.set(row.name.toLowerCase(), row.id);
  }

  const breakfastId =
    mealTypes.get('breakfast') || mealTypesRes.rows[0]?.id || uuidv4();
  const lunchId =
    mealTypes.get('lunch') || mealTypesRes.rows[1]?.id || breakfastId;
  const dinnerId =
    mealTypes.get('dinner') || mealTypesRes.rows[2]?.id || lunchId;
  const snackId =
    mealTypes.get('snack') || mealTypesRes.rows[3]?.id || dinnerId;

  // 1. User Goals Setup
  await client.query(
    `INSERT INTO user_goals (
       id, user_id, goal_date, calories, protein, carbs, fat, water_goal_ml,
       target_exercise_calories_burned, target_exercise_duration_minutes, created_at, updated_at
     )
     VALUES (gen_random_uuid(), $1, $2, 2200, 150, 220, 65, 2500, 400, 45, NOW(), NOW())
     ON CONFLICT DO NOTHING`,
    [userId, today]
  );

  // 2. Water Containers Setup
  const bottleRes = await client.query(
    `INSERT INTO user_water_containers (user_id, name, volume, unit, is_primary, servings_per_container, created_at, updated_at)
     VALUES ($1, 'Hydro Flask', 750, 'ml', true, 1, NOW(), NOW())
     RETURNING id`,
    [userId]
  );
  const bottleId = bottleRes.rows[0].id;

  const glassRes = await client.query(
    `INSERT INTO user_water_containers (user_id, name, volume, unit, is_primary, servings_per_container, created_at, updated_at)
     VALUES ($1, 'Standard Glass', 250, 'ml', false, 1, NOW(), NOW())
     RETURNING id`,
    [userId]
  );
  const glassId = glassRes.rows[0].id;

  // 3. Custom Foods & Food Variants
  const foodOatmealId = await createCustomFoodWithVariant(client, userId, {
    name: 'Oatmeal with Blueberries & Almond Butter',
    servingSize: 80,
    servingUnit: 'g',
    calories: 420,
    protein: 14,
    carbs: 58,
    fat: 16,
    dietaryFiber: 7,
    sugars: 12,
  });

  const foodChickenId = await createCustomFoodWithVariant(client, userId, {
    name: 'Grilled Chicken Breast with Jasmine Rice & Broccoli',
    servingSize: 350,
    servingUnit: 'g',
    calories: 650,
    protein: 52,
    carbs: 68,
    fat: 14,
    dietaryFiber: 5,
    sugars: 2,
  });

  const foodEspressoId = await createCustomFoodWithVariant(client, userId, {
    name: 'Double Espresso & Fresh Apple',
    servingSize: 180,
    servingUnit: 'g',
    calories: 100,
    protein: 1,
    carbs: 25,
    fat: 0.2,
    dietaryFiber: 4,
    sugars: 19,
  });

  const foodAvocadoId = await createCustomFoodWithVariant(client, userId, {
    name: 'Avocado Toast with 2 Poached Eggs',
    servingSize: 220,
    servingUnit: 'g',
    calories: 510,
    protein: 22,
    carbs: 45,
    fat: 28,
    dietaryFiber: 8,
    sugars: 3,
  });

  const foodSalmonId = await createCustomFoodWithVariant(client, userId, {
    name: 'Fresh Salmon Poke Bowl',
    servingSize: 400,
    servingUnit: 'g',
    calories: 720,
    protein: 44,
    carbs: 75,
    fat: 26,
    dietaryFiber: 6,
    sugars: 8,
  });

  const foodSteakId = await createCustomFoodWithVariant(client, userId, {
    name: 'Lean Flank Steak with Roasted Sweet Potatoes',
    servingSize: 380,
    servingUnit: 'g',
    calories: 680,
    protein: 48,
    carbs: 55,
    fat: 22,
    dietaryFiber: 6,
    sugars: 6,
  });

  const foodYogurtId = await createCustomFoodWithVariant(client, userId, {
    name: 'Greek Yogurt with Raw Honey',
    servingSize: 170,
    servingUnit: 'g',
    calories: 220,
    protein: 18,
    carbs: 24,
    fat: 4,
    dietaryFiber: 0,
    sugars: 20,
  });

  // 4. Today's Nutrition & Water
  await client.query(
    `INSERT INTO food_entries (
       id, user_id, food_id, meal_type_id, food_name, calories, protein, carbs, fat,
       dietary_fiber, sugars, caffeine_mg, quantity, serving_size, serving_unit, entry_date, entry_time, images, created_at
     )
     VALUES
     (gen_random_uuid(), $1, $2, $3, 'Oatmeal with Blueberries & Almond Butter', 420, 14, 58, 16, 7, 12, 0, 80, 80, 'g', $6, '08:15', '{}', NOW()),
     (gen_random_uuid(), $1, $4, $5, 'Grilled Chicken Breast with Jasmine Rice & Broccoli', 650, 52, 68, 14, 5, 2, 0, 350, 350, 'g', $6, '12:45', '{}', NOW()),
     (gen_random_uuid(), $1, $7, $8, 'Double Espresso & Fresh Apple', 100, 1, 25, 0.2, 4, 19, 126, 180, 180, 'g', $6, '15:30', '{}', NOW())`,
    [
      userId,
      foodOatmealId,
      breakfastId,
      foodChickenId,
      lunchId,
      today,
      foodEspressoId,
      snackId,
    ]
  );

  // Today's Water log entries (3 drinks = 1750 ml)
  await client.query(
    `INSERT INTO water_intake_entries (
       id, user_id, entry_date, water_ml, container_id, container_name, source, created_at, created_by_user_id, logged_at
     )
     VALUES
     (gen_random_uuid(), $1, $2, 500, $3, 'Hydro Flask', 'manual', NOW(), $1, $4),
     (gen_random_uuid(), $1, $2, 500, $3, 'Hydro Flask', 'manual', NOW(), $1, $5),
     (gen_random_uuid(), $1, $2, 750, $3, 'Hydro Flask', 'manual', NOW(), $1, $6)`,
    [
      userId,
      today,
      bottleId,
      new Date(`${today}T08:30:00Z`),
      new Date(`${today}T12:15:00Z`),
      new Date(`${today}T15:45:00Z`),
    ]
  );

  await client.query(
    `INSERT INTO water_intake (id, user_id, entry_date, water_ml, source, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, 1750, 'manual', NOW(), NOW())
     ON CONFLICT (user_id, entry_date, source) DO UPDATE SET water_ml = EXCLUDED.water_ml, updated_at = NOW()`,
    [userId, today]
  );

  // 5. Yesterday's Nutrition, Water & Workouts
  await client.query(
    `INSERT INTO food_entries (
       id, user_id, food_id, meal_type_id, food_name, calories, protein, carbs, fat,
       dietary_fiber, sugars, caffeine_mg, quantity, serving_size, serving_unit, entry_date, entry_time, images, created_at
     )
     VALUES
     (gen_random_uuid(), $1, $2, $3, 'Avocado Toast with 2 Poached Eggs', 510, 22, 45, 28, 8, 3, 0, 220, 220, 'g', $10, '08:30', '{}', NOW()),
     (gen_random_uuid(), $1, $4, $5, 'Fresh Salmon Poke Bowl', 720, 44, 75, 26, 6, 8, 0, 400, 400, 'g', $10, '13:00', '{}', NOW()),
     (gen_random_uuid(), $1, $6, $7, 'Lean Flank Steak with Roasted Sweet Potatoes', 680, 48, 55, 22, 6, 6, 0, 380, 380, 'g', $10, '19:15', '{}', NOW()),
     (gen_random_uuid(), $1, $8, $9, 'Greek Yogurt with Raw Honey', 220, 18, 24, 4, 0, 20, 0, 170, 170, 'g', $10, '21:00', '{}', NOW())`,
    [
      userId,
      foodAvocadoId,
      breakfastId,
      foodSalmonId,
      lunchId,
      foodSteakId,
      dinnerId,
      foodYogurtId,
      snackId,
      yesterday,
    ]
  );

  // Yesterday's Water log entries (4 drinks = 2600 ml)
  await client.query(
    `INSERT INTO water_intake_entries (
       id, user_id, entry_date, water_ml, container_id, container_name, source, created_at, created_by_user_id, logged_at
     )
     VALUES
     (gen_random_uuid(), $1, $2, 750, $3, 'Hydro Flask', 'manual', NOW(), $1, $5),
     (gen_random_uuid(), $1, $2, 750, $3, 'Hydro Flask', 'manual', NOW(), $1, $6),
     (gen_random_uuid(), $1, $2, 500, $3, 'Hydro Flask', 'manual', NOW(), $1, $7),
     (gen_random_uuid(), $1, $2, 600, $4, 'Standard Glass', 'manual', NOW(), $1, $8)`,
    [
      userId,
      yesterday,
      bottleId,
      glassId,
      new Date(`${yesterday}T08:00:00Z`),
      new Date(`${yesterday}T11:30:00Z`),
      new Date(`${yesterday}T15:00:00Z`),
      new Date(`${yesterday}T19:30:00Z`),
    ]
  );

  await client.query(
    `INSERT INTO water_intake (id, user_id, entry_date, water_ml, source, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, 2600, 'manual', NOW(), NOW())
     ON CONFLICT (user_id, entry_date, source) DO UPDATE SET water_ml = EXCLUDED.water_ml, updated_at = NOW()`,
    [userId, yesterday]
  );

  // 6. Custom Exercises & Workouts (Both Today & Yesterday)
  // Exercises definitions
  const exPushRes = await client.query(
    `INSERT INTO exercises (id, user_id, name, category, source, is_custom, modality, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'Push Workout — Chest & Shoulders', 'Strength', 'custom', true, 'weight_reps', NOW(), NOW())
     RETURNING id`,
    [userId]
  );
  const exPushId = exPushRes.rows[0].id;

  const exPullRes = await client.query(
    `INSERT INTO exercises (id, user_id, name, category, source, is_custom, modality, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'Pull Workout — Back & Biceps', 'Strength', 'custom', true, 'weight_reps', NOW(), NOW())
     RETURNING id`,
    [userId]
  );
  const exPullId = exPullRes.rows[0].id;

  const exRunYesterdayRes = await client.query(
    `INSERT INTO exercises (id, user_id, name, category, source, is_custom, modality, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'Outdoor Evening 5K Run', 'Running', 'garmin', false, 'duration_distance', NOW(), NOW())
     RETURNING id`,
    [userId]
  );
  const exRunYesterdayId = exRunYesterdayRes.rows[0].id;

  const exRunTodayRes = await client.query(
    `INSERT INTO exercises (id, user_id, name, category, source, is_custom, modality, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'Morning 5K Central Park Run', 'Running', 'garmin', false, 'duration_distance', NOW(), NOW())
     RETURNING id`,
    [userId]
  );
  const exRunTodayId = exRunTodayRes.rows[0].id;

  // --- TODAY'S EXERCISE ENTRIES ---
  // 1. Today's Morning Run Entry (30m, 5.25 km, GPS + Laps + HR zones)
  const runTodayEntryRes = await client.query(
    `INSERT INTO exercise_entries (
       id, user_id, exercise_id, exercise_name, duration_minutes, calories_burned,
       entry_date, entry_time, distance, avg_heart_rate, max_heart_rate, avg_speed_mps,
       max_speed_mps, avg_cadence, elevation_gain_meters, elevation_loss_meters,
       avg_respiration_brpm, max_respiration_brpm, training_load,
       aerobic_training_effect, anaerobic_training_effect, moving_time_seconds,
       elapsed_time_seconds, source, source_id, modality, notes, updated_at
     )
     VALUES
     (gen_random_uuid(), $1, $2, 'Morning 5K Central Park Run', 30, 325, $3, '07:15', 5.25, 152, 172, 2.92, 3.65, 164, 42.0, 40.0, 30.0, 38.0, 82.0, 3.6, 1.4, 1800, 1830, 'garmin', 'garmin-demo-run-today', 'duration_distance', 'Energizing morning run around the loop. Felt light on my feet.', NOW())
     RETURNING id`,
    [userId, exRunTodayId, today]
  );
  const runTodayEntryId = runTodayEntryRes.rows[0].id;

  await client.query(
    `INSERT INTO exercise_entry_sets (
       exercise_entry_id, set_number, set_type, duration, distance, created_at, updated_at
     )
     VALUES ($1, 1, 'normal', 1800, 5.25, NOW(), NOW())`,
    [runTodayEntryId]
  );

  const gpsPointsToday = generateSampleGpsPoints(`${today}T07:15:00Z`);
  await client.query(
    `INSERT INTO exercise_entry_gps_points (
       id, user_id, exercise_entry_id, entry_date, points, created_at, updated_at
     )
     VALUES (gen_random_uuid(), $1, $2, $3, $4::jsonb, NOW(), NOW())`,
    [userId, runTodayEntryId, today, JSON.stringify(gpsPointsToday)]
  );

  const lapSplitsToday = [
    {
      lap: 1,
      dur: 360,
      dist: 1000,
      cal: 65,
      hr: 145,
      maxHr: 154,
      spd: 2.78,
      elev: 10,
    },
    {
      lap: 2,
      dur: 355,
      dist: 1000,
      cal: 64,
      hr: 150,
      maxHr: 158,
      spd: 2.82,
      elev: 12,
    },
    {
      lap: 3,
      dur: 365,
      dist: 1000,
      cal: 66,
      hr: 153,
      maxHr: 162,
      spd: 2.74,
      elev: 8,
    },
    {
      lap: 4,
      dur: 360,
      dist: 1000,
      cal: 65,
      hr: 156,
      maxHr: 166,
      spd: 2.78,
      elev: 7,
    },
    {
      lap: 5,
      dur: 360,
      dist: 1250,
      cal: 65,
      hr: 160,
      maxHr: 172,
      spd: 3.47,
      elev: 5,
    },
  ];
  let lapStartToday = new Date(`${today}T07:15:00Z`);
  for (const l of lapSplitsToday) {
    const lapEnd = new Date(lapStartToday.getTime() + l.dur * 1000);
    await client.query(
      `INSERT INTO exercise_entry_laps (
         id, user_id, exercise_entry_id, entry_date, lap_index, start_time, end_time,
         duration_seconds, distance_meters, calories, avg_heart_rate, max_heart_rate,
         avg_speed_mps, elevation_gain_meters, created_at, updated_at
       )
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())`,
      [
        userId,
        runTodayEntryId,
        today,
        l.lap,
        lapStartToday,
        lapEnd,
        l.dur,
        l.dist,
        l.cal,
        l.hr,
        l.maxHr,
        l.spd,
        l.elev,
      ]
    );
    lapStartToday = lapEnd;
  }

  const hrZonesToday = [
    { zone: 1, lower: 100, upper: 120, secs: 120 },
    { zone: 2, lower: 120, upper: 140, secs: 360 },
    { zone: 3, lower: 140, upper: 155, secs: 780 },
    { zone: 4, lower: 155, upper: 168, secs: 420 },
    { zone: 5, lower: 168, upper: 185, secs: 120 },
  ];
  for (const z of hrZonesToday) {
    await client.query(
      `INSERT INTO exercise_entry_hr_zones (
         id, user_id, exercise_entry_id, entry_date, zone_index, zone_lower_bpm, zone_upper_bpm, seconds_in_zone, created_at, updated_at
       )
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
      [userId, runTodayEntryId, today, z.zone, z.lower, z.upper, z.secs]
    );
  }

  await client.query(
    `INSERT INTO exercise_entry_activity_details (
       id, exercise_entry_id, provider_name, detail_type, detail_data, created_at, updated_at
     )
     VALUES (
       gen_random_uuid(), $1, 'garmin', 'full_activity_data',
       $2::jsonb, NOW(), NOW()
     )`,
    [
      runTodayEntryId,
      JSON.stringify({
        activityName: 'Morning 5K Central Park Run',
        activityType: 'RUNNING',
        startTimeLocal: `${today} 07:15:00`,
        distance: 5250,
        duration: 1800,
        elapsedDuration: 1830,
        movingDuration: 1800,
        calories: 325,
        averageHR: 152,
        maxHR: 172,
        averageSpeed: 2.92,
        maxSpeed: 3.65,
        elevationGain: 42.0,
        elevationLoss: 40.0,
        avgCadence: 164,
        steps: 5320,
        aerobicTrainingEffect: 3.6,
        anaerobicTrainingEffect: 1.4,
      }),
    ]
  );

  // 2. Today's Pull Workout Entry
  const pullEntryRes = await client.query(
    `INSERT INTO exercise_entries (
       id, user_id, exercise_id, exercise_name, duration_minutes, calories_burned,
       entry_date, entry_time, distance, avg_heart_rate, max_heart_rate, modality, notes, updated_at
     )
     VALUES
     (gen_random_uuid(), $1, $2, 'Pull Workout — Back & Biceps', 40, 290, $3, '17:00', NULL, 134, 158, 'weight_reps', 'Great lat activation on pullups and bent-over rows.', NOW())
     RETURNING id`,
    [userId, exPullId, today]
  );
  const pullEntryId = pullEntryRes.rows[0].id;

  const pullSets = [
    { num: 1, type: 'warmup', reps: 12, weight: 50, rest: 90, rpe: 6 },
    { num: 2, type: 'normal', reps: 10, weight: 70, rest: 120, rpe: 8 },
    { num: 3, type: 'normal', reps: 8, weight: 80, rest: 120, rpe: 8.5 },
    { num: 4, type: 'normal', reps: 6, weight: 85, rest: 150, rpe: 9 },
  ];
  for (const s of pullSets) {
    await client.query(
      `INSERT INTO exercise_entry_sets (
         exercise_entry_id, set_number, set_type, reps, weight, rest_time, rpe, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
      [pullEntryId, s.num, s.type, s.reps, s.weight, s.rest, s.rpe]
    );
  }

  // --- YESTERDAY'S EXERCISE ENTRIES ---
  // 1. Yesterday's Push Workout Entry
  const pushEntryRes = await client.query(
    `INSERT INTO exercise_entries (
       id, user_id, exercise_id, exercise_name, duration_minutes, calories_burned,
       entry_date, entry_time, distance, avg_heart_rate, max_heart_rate, modality, notes, updated_at
     )
     VALUES
     (gen_random_uuid(), $1, $2, 'Push Workout — Chest & Shoulders', 45, 340, $3, '17:30', NULL, 138, 162, 'weight_reps', 'Felt energetic and strong. Solid bench volume.', NOW())
     RETURNING id`,
    [userId, exPushId, yesterday]
  );
  const pushEntryId = pushEntryRes.rows[0].id;

  const pushSets = [
    { num: 1, type: 'warmup', reps: 12, weight: 60, rest: 90, rpe: 6 },
    { num: 2, type: 'normal', reps: 10, weight: 80, rest: 120, rpe: 8 },
    { num: 3, type: 'normal', reps: 8, weight: 90, rest: 120, rpe: 8.5 },
    { num: 4, type: 'normal', reps: 6, weight: 95, rest: 150, rpe: 9 },
  ];
  for (const s of pushSets) {
    await client.query(
      `INSERT INTO exercise_entry_sets (
         exercise_entry_id, set_number, set_type, reps, weight, rest_time, rpe, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
      [pushEntryId, s.num, s.type, s.reps, s.weight, s.rest, s.rpe]
    );
  }

  // 2. Yesterday's Outdoor Run Workout Entry
  const runYesterdayEntryRes = await client.query(
    `INSERT INTO exercise_entries (
       id, user_id, exercise_id, exercise_name, duration_minutes, calories_burned,
       entry_date, entry_time, distance, avg_heart_rate, max_heart_rate, avg_speed_mps,
       max_speed_mps, avg_cadence, elevation_gain_meters, elevation_loss_meters,
       avg_respiration_brpm, max_respiration_brpm, training_load,
       aerobic_training_effect, anaerobic_training_effect, moving_time_seconds,
       elapsed_time_seconds, source, source_id, modality, notes, updated_at
     )
     VALUES
     (gen_random_uuid(), $1, $2, 'Outdoor Evening 5K Run', 32, 310, $3, '19:15', 5.12, 148, 168, 2.67, 3.45, 162, 38.0, 36.0, 28.0, 36.0, 78.0, 3.4, 1.2, 1920, 1950, 'garmin', 'garmin-demo-run-yesterday', 'duration_distance', 'Great pace around the park loop with brisk weather.', NOW())
     RETURNING id`,
    [userId, exRunYesterdayId, yesterday]
  );
  const runYesterdayEntryId = runYesterdayEntryRes.rows[0].id;

  await client.query(
    `INSERT INTO exercise_entry_sets (
       exercise_entry_id, set_number, set_type, duration, distance, created_at, updated_at
     )
     VALUES ($1, 1, 'normal', 1920, 5.12, NOW(), NOW())`,
    [runYesterdayEntryId]
  );

  const gpsPointsYesterday = generateSampleGpsPoints(`${yesterday}T19:15:00Z`);
  await client.query(
    `INSERT INTO exercise_entry_gps_points (
       id, user_id, exercise_entry_id, entry_date, points, created_at, updated_at
     )
     VALUES (gen_random_uuid(), $1, $2, $3, $4::jsonb, NOW(), NOW())`,
    [userId, runYesterdayEntryId, yesterday, JSON.stringify(gpsPointsYesterday)]
  );

  const lapSplitsYesterday = [
    {
      lap: 1,
      dur: 390,
      dist: 1000,
      cal: 62,
      hr: 142,
      maxHr: 150,
      spd: 2.56,
      elev: 8,
    },
    {
      lap: 2,
      dur: 380,
      dist: 1000,
      cal: 61,
      hr: 146,
      maxHr: 154,
      spd: 2.63,
      elev: 10,
    },
    {
      lap: 3,
      dur: 385,
      dist: 1000,
      cal: 63,
      hr: 149,
      maxHr: 158,
      spd: 2.6,
      elev: 6,
    },
    {
      lap: 4,
      dur: 382,
      dist: 1000,
      cal: 62,
      hr: 152,
      maxHr: 162,
      spd: 2.62,
      elev: 9,
    },
    {
      lap: 5,
      dur: 383,
      dist: 1120,
      cal: 62,
      hr: 156,
      maxHr: 168,
      spd: 2.92,
      elev: 5,
    },
  ];
  let lapStartYesterday = new Date(`${yesterday}T19:15:00Z`);
  for (const l of lapSplitsYesterday) {
    const lapEnd = new Date(lapStartYesterday.getTime() + l.dur * 1000);
    await client.query(
      `INSERT INTO exercise_entry_laps (
         id, user_id, exercise_entry_id, entry_date, lap_index, start_time, end_time,
         duration_seconds, distance_meters, calories, avg_heart_rate, max_heart_rate,
         avg_speed_mps, elevation_gain_meters, created_at, updated_at
       )
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())`,
      [
        userId,
        runYesterdayEntryId,
        yesterday,
        l.lap,
        lapStartYesterday,
        lapEnd,
        l.dur,
        l.dist,
        l.cal,
        l.hr,
        l.maxHr,
        l.spd,
        l.elev,
      ]
    );
    lapStartYesterday = lapEnd;
  }

  const hrZonesYesterday = [
    { zone: 1, lower: 100, upper: 120, secs: 180 },
    { zone: 2, lower: 120, upper: 140, secs: 480 },
    { zone: 3, lower: 140, upper: 155, secs: 840 },
    { zone: 4, lower: 155, upper: 168, secs: 360 },
    { zone: 5, lower: 168, upper: 185, secs: 60 },
  ];
  for (const z of hrZonesYesterday) {
    await client.query(
      `INSERT INTO exercise_entry_hr_zones (
         id, user_id, exercise_entry_id, entry_date, zone_index, zone_lower_bpm, zone_upper_bpm, seconds_in_zone, created_at, updated_at
       )
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
      [userId, runYesterdayEntryId, yesterday, z.zone, z.lower, z.upper, z.secs]
    );
  }

  await client.query(
    `INSERT INTO exercise_entry_activity_details (
       id, exercise_entry_id, provider_name, detail_type, detail_data, created_at, updated_at
     )
     VALUES (
       gen_random_uuid(), $1, 'garmin', 'full_activity_data',
       $2::jsonb, NOW(), NOW()
     )`,
    [
      runYesterdayEntryId,
      JSON.stringify({
        activityName: 'Outdoor Evening 5K Run',
        activityType: 'RUNNING',
        startTimeLocal: `${yesterday} 19:15:00`,
        distance: 5120,
        duration: 1920,
        elapsedDuration: 1950,
        movingDuration: 1920,
        calories: 310,
        averageHR: 148,
        maxHR: 168,
        averageSpeed: 2.67,
        maxSpeed: 3.45,
        elevationGain: 38.0,
        elevationLoss: 36.0,
        avgCadence: 162,
        steps: 5184,
        aerobicTrainingEffect: 3.4,
        anaerobicTrainingEffect: 1.2,
      }),
    ]
  );

  // 7. Fasting Logs (Yesterday completed fast + Today active fast)
  const fastStartYesterday = new Date(`${addDays(today, -2)}T20:00:00Z`);
  const fastEndYesterday = new Date(`${yesterday}T12:00:00Z`);
  await client.query(
    `INSERT INTO fasting_logs (
       id, user_id, start_time, target_end_time, end_time, duration_minutes, fasting_type, status, created_at, updated_at
     )
     VALUES
     (gen_random_uuid(), $1, $2, $3, $3, 960, '16:8 Intermittent Fast', 'COMPLETED', NOW(), NOW())`,
    [userId, fastStartYesterday, fastEndYesterday]
  );

  // Today's active fast (started 14h ago, 16h target)
  const activeFastStart = new Date(Date.now() - 14 * 60 * 60 * 1000);
  const activeFastTarget = new Date(
    activeFastStart.getTime() + 16 * 60 * 60 * 1000
  );
  await client.query(
    `INSERT INTO fasting_logs (
       id, user_id, start_time, target_end_time, end_time, duration_minutes, fasting_type, status, created_at, updated_at
     )
     VALUES
     (gen_random_uuid(), $1, $2, $3, NULL, NULL, '16:8 Intermittent Fast', 'ACTIVE', NOW(), NOW())`,
    [userId, activeFastStart, activeFastTarget]
  );

  // 8. 7 Days of Sleep Data & Stage Breakdowns (Hypnogram)
  for (let i = 7; i >= 1; i--) {
    const sleepDay = addDays(today, -i);
    const bedtime = new Date(`${addDays(sleepDay, -1)}T22:45:00Z`);
    const wakeTime = new Date(`${sleepDay}T06:45:00Z`);
    const durationSeconds = 28800; // 8 hours
    const deepSeconds = 5400; // 1.5h
    const remSeconds = 7200; // 2h
    const lightSeconds = 14400; // 4h
    const awakeSeconds = 1800; // 0.5h
    const timeAsleepSeconds = durationSeconds - awakeSeconds;
    const sleepScore = 80 + (i % 8);

    const sleepRes = await client.query(
      `INSERT INTO sleep_entries (
         id, user_id, entry_date, bedtime, wake_time, duration_in_seconds,
         time_asleep_in_seconds, sleep_score, source, deep_sleep_seconds,
         light_sleep_seconds, rem_sleep_seconds, awake_sleep_seconds,
         average_spo2_value, lowest_spo2_value, highest_spo2_value,
         resting_heart_rate, record_timezone, created_at, updated_at
       )
       VALUES (
         gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, 'Garmin', $8, $9, $10, $11, 96, 91, 99, 52, 'UTC', NOW(), NOW()
       )
       RETURNING id`,
      [
        userId,
        sleepDay,
        bedtime,
        wakeTime,
        durationSeconds,
        timeAsleepSeconds,
        sleepScore,
        deepSeconds,
        lightSeconds,
        remSeconds,
        awakeSeconds,
      ]
    );
    const sleepEntryId = sleepRes.rows[0].id;

    // Sleep stages breakdown for Hypnogram
    const stages = [
      { type: 'light', start: 0, dur: 1800 },
      { type: 'deep', start: 1800, dur: 5400 },
      { type: 'light', start: 7200, dur: 5400 },
      { type: 'rem', start: 12600, dur: 5400 },
      { type: 'awake', start: 18000, dur: 900 },
      { type: 'light', start: 18900, dur: 3600 },
      { type: 'rem', start: 22500, dur: 5400 },
      { type: 'awake', start: 27900, dur: 900 },
    ];

    for (const st of stages) {
      const stageStart = new Date(bedtime.getTime() + st.start * 1000);
      const stageEnd = new Date(stageStart.getTime() + st.dur * 1000);
      await client.query(
        `INSERT INTO sleep_entry_stages (
           id, entry_id, user_id, stage_type, start_time, end_time, duration_in_seconds, created_at, updated_at
         )
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW(), NOW())`,
        [sleepEntryId, userId, st.type, stageStart, stageEnd, st.dur]
      );
    }
  }

  // 9. 30 Days of Realistic Check-in Measurements (Trending 82.5 kg down to 80.2 kg)
  for (let i = 30; i >= 0; i--) {
    const day = addDays(today, -i);
    const baseWeight = 82.5 - (30 - i) * (2.3 / 30);
    const fluctuation = (((i * 7) % 5) - 2) * 0.1;
    const weight = Number((baseWeight + fluctuation).toFixed(1));
    const steps = 8200 + ((i * 313) % 3500);
    const bodyFat = Number((18.8 - (30 - i) * (1.2 / 30)).toFixed(1));

    await client.query(
      `INSERT INTO check_in_measurements (
         id, user_id, entry_date, weight, height, body_fat_percentage, steps, bmr, created_at, updated_at
       )
       VALUES (gen_random_uuid(), $1, $2, $3, 180, $4, $5, 1780, NOW(), NOW())
       ON CONFLICT DO NOTHING`,
      [userId, day, weight, bodyFat, steps]
    );
  }

  // 10. Medications & GLP-1 Tracking (Semaglutide GLP-1, Omega-3, Vitamin D3)
  const medGlp1Res = await client.query(
    `INSERT INTO medications (
       id, user_id, name, display_name, type_id, route_id, strength_value, strength_unit,
       dose_amount, dose_unit, reason_text, is_active, is_glp1, is_supplement, nutrients,
       color, icon, created_at, updated_at
     )
     VALUES (
       gen_random_uuid(), $1, 'Semaglutide (Wegovy / Ozempic)', 'Semaglutide 0.5mg', 'injection', 'subcutaneous',
       0.5, 'mg', 0.5, 'mg', 'GLP-1 Metabolic Weight Management', true, true, false, '{}'::jsonb,
       '#10b981', 'Syringe', NOW(), NOW()
     )
     RETURNING id`,
    [userId]
  );
  const medGlp1Id = medGlp1Res.rows[0].id;

  const medOmegaRes = await client.query(
    `INSERT INTO medications (
       id, user_id, name, display_name, type_id, route_id, strength_value, strength_unit,
       dose_amount, dose_unit, reason_text, is_active, is_glp1, is_supplement, nutrients,
       color, icon, created_at, updated_at
     )
     VALUES (
       gen_random_uuid(), $1, 'Omega-3 Triple Strength Fish Oil', 'Omega-3 Fish Oil', 'capsule', 'oral',
       1000, 'mg', 1, 'capsule', 'Cardiovascular & Joint Recovery', true, false, true,
       '{"fat": 1.0, "omega3": 1000}'::jsonb, '#3b82f6', 'Pill', NOW(), NOW()
     )
     RETURNING id`,
    [userId]
  );
  const medOmegaId = medOmegaRes.rows[0].id;

  const medVitDRes = await client.query(
    `INSERT INTO medications (
       id, user_id, name, display_name, type_id, route_id, strength_value, strength_unit,
       dose_amount, dose_unit, reason_text, is_active, is_glp1, is_supplement, nutrients,
       color, icon, created_at, updated_at
     )
     VALUES (
       gen_random_uuid(), $1, 'Vitamin D3 + K2', 'Vitamin D3 2000 IU', 'capsule', 'oral',
       2000, 'IU', 1, 'capsule', 'Immune & Bone Density Support', true, false, true,
       '{"vitaminD": 50}'::jsonb, '#f59e0b', 'Sun', NOW(), NOW()
     )
     RETURNING id`,
    [userId]
  );
  const medVitDId = medVitDRes.rows[0].id;

  // Medication Schedules
  const schedGlp1Res = await client.query(
    `INSERT INTO medication_schedules (
       id, medication_id, user_id, schedule_type_id, time_of_day, dose_amount, active, created_at, updated_at
     )
     VALUES (gen_random_uuid(), $1, $2, 'weekly', '08:00', 0.5, true, NOW(), NOW())
     RETURNING id`,
    [medGlp1Id, userId]
  );
  const schedGlp1Id = schedGlp1Res.rows[0].id;

  const schedOmegaRes = await client.query(
    `INSERT INTO medication_schedules (
       id, medication_id, user_id, schedule_type_id, time_of_day, dose_amount, active, created_at, updated_at
     )
     VALUES (gen_random_uuid(), $1, $2, 'daily', '08:00', 1, true, NOW(), NOW())
     RETURNING id`,
    [medOmegaId, userId]
  );
  const schedOmegaId = schedOmegaRes.rows[0].id;

  const schedVitDRes = await client.query(
    `INSERT INTO medication_schedules (
       id, medication_id, user_id, schedule_type_id, time_of_day, dose_amount, active, created_at, updated_at
     )
     VALUES (gen_random_uuid(), $1, $2, 'daily', '08:00', 1, true, NOW(), NOW())
     RETURNING id`,
    [medVitDId, userId]
  );
  const schedVitDId = schedVitDRes.rows[0].id;

  // Medication Dose Logs (Today, Yesterday, 3 days ago for weekly GLP-1)
  const threeDaysAgo = addDays(today, -3);
  await client.query(
    `INSERT INTO medication_entries (
       id, medication_id, schedule_id, user_id, status, taken_at, scheduled_for, entry_date,
       med_name_snapshot, dose_amount_snapshot, dose_unit_snapshot, notes, source,
       nutrients_snapshot, created_at, updated_at
     )
     VALUES
     (gen_random_uuid(), $1, $2, $3, 'taken', $4, $4, $5, 'Semaglutide 0.5mg', 0.5, 'mg', 'Weekly GLP-1 injection taken on abdomen site.', 'manual', NULL, NOW(), NOW()),
     (gen_random_uuid(), $6, $7, $3, 'taken', $8, $8, $9, 'Omega-3 Fish Oil', 1, 'capsule', 'Taken with breakfast', 'manual', '{"fat": 1.0, "omega3": 1000}'::jsonb, NOW(), NOW()),
     (gen_random_uuid(), $10, $11, $3, 'taken', $8, $8, $9, 'Vitamin D3 2000 IU', 1, 'capsule', 'Taken with breakfast', 'manual', '{"vitaminD": 50}'::jsonb, NOW(), NOW()),
     (gen_random_uuid(), $6, $7, $3, 'taken', $12, $12, $13, 'Omega-3 Fish Oil', 1, 'capsule', 'Taken with breakfast', 'manual', '{"fat": 1.0, "omega3": 1000}'::jsonb, NOW(), NOW()),
     (gen_random_uuid(), $10, $11, $3, 'taken', $12, $12, $13, 'Vitamin D3 2000 IU', 1, 'capsule', 'Taken with breakfast', 'manual', '{"vitaminD": 50}'::jsonb, NOW(), NOW())`,
    [
      medGlp1Id,
      schedGlp1Id,
      userId,
      new Date(`${threeDaysAgo}T08:00:00Z`),
      threeDaysAgo,
      medOmegaId,
      schedOmegaId,
      new Date(`${yesterday}T08:30:00Z`),
      yesterday,
      medVitDId,
      schedVitDId,
      new Date(`${today}T08:15:00Z`),
      today,
    ]
  );

  // 11. Cycle Tracking & Period Hub
  await client.query(
    `INSERT INTO cycle_settings (
       id, user_id, enabled, mode, avg_cycle_length_override, avg_period_length_override,
       luteal_phase_length, birth_control_method, conditions, show_fertile_window,
       preferred_products, dismissed_prompts, terminology, discreet_mode, onboarded_at, created_at, updated_at
     )
     VALUES (
       gen_random_uuid(), $1, true, 'standard', 28, 5, 14, 'none', '{}', true,
       '{pad,tampon}', '{}', 'default', false, NOW(), NOW(), NOW()
     )
     ON CONFLICT (user_id) DO UPDATE
     SET enabled = true,
         mode = 'standard',
         avg_cycle_length_override = 28,
         avg_period_length_override = 5,
         show_fertile_window = true,
         onboarded_at = COALESCE(cycle_settings.onboarded_at, NOW()),
         updated_at = NOW()`,
    [userId]
  );

  // Seed 2 cycles: Prior cycle (28 days long, 5 days period) + Current cycle (started 7 days ago)
  const priorCycleStart = addDays(today, -35);
  const priorCycleEnd = addDays(today, -8);
  const currentCycleStart = addDays(today, -7);

  await client.query(
    `INSERT INTO cycles (
       id, user_id, start_date, end_date, period_length, cycle_length, is_excluded, source, created_at, updated_at
     )
     VALUES
     (gen_random_uuid(), $1, $2, $3, 5, 28, false, 'manual', NOW(), NOW()),
     (gen_random_uuid(), $1, $4, NULL, 5, NULL, false, 'derived', NOW(), NOW())
     ON CONFLICT (user_id, start_date) DO NOTHING`,
    [userId, priorCycleStart, priorCycleEnd, currentCycleStart]
  );

  // Daily cycle symptoms and flow logs for the current cycle
  const cycleLogs = [
    {
      dayOffset: -7,
      flow: 'medium',
      mucus: null,
      energy: 3,
      libido: 2,
      prod: { pad: 2, tampon: 2 },
    },
    {
      dayOffset: -6,
      flow: 'heavy',
      mucus: null,
      energy: 3,
      libido: 2,
      prod: { tampon: 4 },
    },
    {
      dayOffset: -5,
      flow: 'medium',
      mucus: null,
      energy: 4,
      libido: 3,
      prod: { tampon: 3 },
    },
    {
      dayOffset: -4,
      flow: 'light',
      mucus: 'creamy',
      energy: 4,
      libido: 3,
      prod: { pad: 2 },
    },
    {
      dayOffset: -3,
      flow: 'spotting',
      mucus: 'sticky',
      energy: 4,
      libido: 4,
      prod: { pad: 1 },
    },
    {
      dayOffset: -1,
      flow: 'none',
      mucus: 'watery',
      energy: 5,
      libido: 4,
      prod: {},
    },
    {
      dayOffset: 0,
      flow: 'none',
      mucus: 'egg_white',
      energy: 5,
      libido: 5,
      prod: {},
    },
  ];

  for (const c of cycleLogs) {
    const logDate = addDays(today, c.dayOffset);
    await client.query(
      `INSERT INTO cycle_daily_entries (
         id, user_id, entry_date, flow_level, product_usage, cervical_mucus,
         energy, libido, notes, custom_fields, created_at, updated_at
       )
       VALUES (
         gen_random_uuid(), $1, $2, $3, $4::jsonb, $5, $6, $7,
         'Tracked via SparkyFitness Cycle Hub', '{}'::jsonb, NOW(), NOW()
       )
       ON CONFLICT (user_id, entry_date) DO UPDATE
       SET flow_level = EXCLUDED.flow_level,
           product_usage = EXCLUDED.product_usage,
           cervical_mucus = EXCLUDED.cervical_mucus,
           energy = EXCLUDED.energy,
           libido = EXCLUDED.libido,
           updated_at = NOW()`,
      [
        userId,
        logDate,
        c.flow,
        JSON.stringify(c.prod),
        c.mucus,
        c.energy,
        c.libido,
      ]
    );
  }
}

/**
 * Resets the demo user's records strictly scoped to their user ID (WHERE user_id = demo_id).
 * Does not touch any other users or system tables.
 */
export async function resetDemoUserData(): Promise<void> {
  const email = getDemoEmail();
  const user = await userRepository.findUserByEmail(email);

  if (!user) {
    log(
      'info',
      `[DEMO RESET] Demo user not found for email ${email}. Re-creating...`
    );
    await seedDemoUser();
    return;
  }

  const client = await getSystemClient();
  try {
    const userId = user.id;
    log(
      'info',
      `[DEMO RESET] Performing daily scoped reset for demo user ${userId}...`
    );

    await client.query('BEGIN');

    // Strict scoped deletion for demo user only
    await cleanDemoUserData(client, userId);

    // Re-seed fresh relative entries
    await populateDemoDataForUser(userId, client);

    await client.query('COMMIT');
    log(
      'info',
      `[DEMO RESET] Daily scoped reset completed successfully for demo user ${userId}`
    );
  } catch (error) {
    await client.query('ROLLBACK');
    log('error', '[DEMO RESET] Failed to reset demo user data:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Purges the demo user if present. Called on startup when SPARKY_FITNESS_DEMO_MODE is not true.
 */
export async function purgeDemoUserIfExists(): Promise<void> {
  const email = getDemoEmail();
  try {
    const user = await userRepository.findUserByEmail(email);
    if (user) {
      log(
        'info',
        `[DEMO] Demo mode disabled — purging demo user ${email} (${user.id})...`
      );
      const client = await getSystemClient();
      try {
        await cleanDemoUserData(client, user.id);
      } finally {
        client.release();
      }
      await userRepository.deleteUser(user.id);
      log('info', `[DEMO] Successfully purged demo user ${email}`);
    }
  } catch (error) {
    log('error', '[DEMO] Error during demo user auto-purge:', error);
  }
}

/**
 * Registers an in-process midnight UTC cron job to reset demo user data daily without downtime.
 */
let demoCronTask: ReturnType<typeof cron.schedule> | null = null;

export function scheduleDemoMidnightReset(): void {
  if (!isDemoMode()) return;
  if (demoCronTask) return;

  log('info', '[DEMO] Scheduling in-process daily reset cron at 00:00 UTC');
  demoCronTask = cron.schedule(
    '0 0 * * *',
    async () => {
      try {
        log(
          'info',
          '[DEMO CRON] Executing scheduled midnight demo data reset...'
        );
        await resetDemoUserData();
      } catch (error) {
        log('error', '[DEMO CRON] Scheduled demo reset failed:', error);
      }
    },
    { timezone: 'UTC' }
  );
}
