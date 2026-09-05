import express from 'express';
import foodEntryService from '../services/foodEntryService.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { log } from '../config/logging.js';
import { canAccessUserData } from '../utils/permissionUtils.js';
import { clearUserTdeeCache } from '../services/AdaptiveTdeeService.js';
import {
  isEntryTimeString,
  foodPhotoLogRequestSchema,
  foodPhotoLogResponseSchema,
} from '@workspace/shared';
import checkPermissionMiddleware from '../middleware/checkPermissionMiddleware.js';
import foodPhotoLogService, {
  PhotoLogError,
} from '../services/foodPhotoLogService.js';
import mealService from '../services/mealService.js';
import foodEntryMealRepository from '../models/foodEntryMealRepository.js';
import {
  uploadImages,
  applyImageOrder,
  parseImageOrder,
  finalizeUploadedImages,
  cleanupStagedImages,
  stagedFilesFrom,
  removeOrphanedImages,
} from '../middleware/imageUpload.js';
const router = express.Router();

// Middleware to protect routes
router.use(authenticate); // Use the authenticate middleware function
/**
 * @swagger
 * /food-entry-meals:
 *   post:
 *     summary: Create a new FoodEntryMeal
 *     tags: [Nutrition & Meals]
 *     description: Creates a new food entry meal for the authenticated user.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/FoodEntryMeal'
 *     responses:
 *       201:
 *         description: The FoodEntryMeal was created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FoodEntryMeal'
 *       403:
 *         description: User does not have permission to create a food entry meal.
 */
router.post('/', async (req, res, next) => {
  try {
    const {
      meal_template_id,
      meal_type,
      meal_type_id,
      entry_date,
      entry_time,
      name,
      description,
      notes,
      foods,
      quantity,
      unit,
      entry_total_servings,
    } = req.body;

    if (
      entry_time !== null &&
      entry_time !== undefined &&
      !isEntryTimeString(entry_time)
    ) {
      return res.status(400).json({
        error: 'entry_time must be in HH:MM (24h) format.',
      });
    }

    if (
      entry_total_servings !== null &&
      entry_total_servings !== undefined &&
      (!Number.isFinite(Number(entry_total_servings)) ||
        Number(entry_total_servings) <= 0)
    ) {
      return res.status(400).json({
        error: 'entry_total_servings must be a positive number.',
      });
    }

    const userId = req.userId; // From authMiddleware
    // Determine target user
    const targetUserId = req.body.user_id || userId;
    if (targetUserId !== userId) {
      const hasPermission = await { canAccessUserData }.canAccessUserData(
        targetUserId,
        'diary',
        userId
      );
      if (!hasPermission) return res.status(403).json({ error: 'Forbidden' });
    }
    // Backwards compatibility (issue #1023): clients on the new serving model
    // send X-Meal-Model-Version: 2 (or higher). Older clients omit the header
    // and expect the legacy "unit === 'serving' → multiplier = quantity" math.
    const clientMealModelVersion =
      Number(req.header('x-meal-model-version')) || 1;
    const newFoodEntryMeal = await foodEntryService.createFoodEntryMeal(
      targetUserId, // Use targetUserId
      userId, // actingUserId is the authenticated user
      {
        user_id: targetUserId, // Ensure this is passed
        meal_template_id,
        meal_type,
        meal_type_id,
        entry_date,
        entry_time,
        name,
        description,
        notes,
        foods,
        quantity,
        unit,
        entry_total_servings:
          entry_total_servings !== undefined
            ? entry_total_servings !== null
              ? Number(entry_total_servings)
              : null
            : undefined,
        _clientMealModelVersion: clientMealModelVersion,
      } // mealData
    );
    log('info', `User ${userId} created FoodEntryMeal ${newFoodEntryMeal.id}`);
    clearUserTdeeCache(targetUserId);
    res.status(201).json(newFoodEntryMeal);
  } catch (err) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    log('error', `Error creating FoodEntryMeal: ${err.message}`, err);
    next(err);
  }
});
/**
 * @swagger
 * /food-entry-meals/from-photo-estimate:
 *   post:
 *     summary: Log a reviewed AI food-photo estimate
 *     tags: [Nutrition & Meals]
 *     description: >
 *       Creates the diary rows for a reviewed photo estimate in one
 *       transaction. In `grouped` mode this is an ad-hoc food_entry_meals
 *       parent plus one component food_entries row per ingredient; in
 *       `combined` mode it is a single food and a single entry. Ingredients
 *       that matched an existing food reuse it; the rest are created as normal
 *       reusable foods.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [mode, entry_date, meal_type, name, items]
 *             properties:
 *               mode:
 *                 type: string
 *                 enum: [grouped, combined]
 *                 description: >
 *                   `grouped` creates an ad-hoc food_entry_meals parent with one
 *                   component entry per ingredient. `combined` logs a single
 *                   food and requires exactly one `new` item.
 *               user_id:
 *                 type: string
 *                 format: uuid
 *                 description: Log on behalf of another user; requires `diary` permission.
 *               entry_date:
 *                 type: string
 *                 format: date
 *                 description: Calendar day (YYYY-MM-DD).
 *               entry_time:
 *                 type: string
 *                 nullable: true
 *               meal_type:
 *                 type: string
 *               meal_type_id:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *                 nullable: true
 *               save_as_meal:
 *                 type: object
 *                 description: Also save this plate as a reusable meal template (grouped mode only).
 *                 required: [name]
 *                 properties:
 *                   name: { type: string }
 *               items:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 25
 *                 items:
 *                   oneOf:
 *                     - type: object
 *                       required: [source, food_id, variant_id, quantity, unit]
 *                       properties:
 *                         source: { type: string, enum: [existing] }
 *                         food_id: { type: string, format: uuid }
 *                         variant_id: { type: string, format: uuid }
 *                         quantity: { type: number }
 *                         unit: { type: string }
 *                     - type: object
 *                       required: [source, food, quantity, unit]
 *                       properties:
 *                         source: { type: string, enum: [new] }
 *                         quantity:
 *                           type: number
 *                           description: Amount eaten, in `unit` (grams).
 *                         unit: { type: string }
 *                         food:
 *                           type: object
 *                           description: >
 *                             Nutrition is always per 100 g (serving_size 100,
 *                             serving_unit "g"); the amount eaten travels on
 *                             `quantity`. The server owns provider_type and
 *                             shared_with_public. Ingredients are created as
 *                             normal reusable foods, so a later photo can
 *                             match them.
 *                           required: [name, serving_size, serving_unit, calories, protein, carbs, fat]
 *                           properties:
 *                             name: { type: string }
 *                             brand: { type: string, nullable: true }
 *                             serving_size: { type: number }
 *                             serving_unit: { type: string }
 *                             calories: { type: number }
 *                             protein: { type: number }
 *                             carbs: { type: number }
 *                             fat: { type: number }
 *                             dietary_fiber: { type: number }
 *                             sugars: { type: number }
 *     responses:
 *       201:
 *         description: The estimate was logged.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [mode, food_entry_meal_id, food_entry_ids, created_food_ids]
 *               properties:
 *                 mode:
 *                   type: string
 *                   enum: [grouped, combined]
 *                 food_entry_meal_id:
 *                   type: string
 *                   format: uuid
 *                   nullable: true
 *                   description: Null in combined mode; there is no parent meal.
 *                 meal_template_id:
 *                   type: string
 *                   format: uuid
 *                   nullable: true
 *                   description: The created meal template id, or null if not requested or creation failed.
 *                 food_entry_ids:
 *                   type: array
 *                   items: { type: string, format: uuid }
 *                 created_food_ids:
 *                   type: array
 *                   items: { type: string, format: uuid }
 *                   description: Only foods this request created; matched foods are not listed.
 *       400:
 *         description: Invalid payload or meal type.
 *       403:
 *         description: User does not have permission to log for this user.
 *       404:
 *         description: A referenced food or variant was not found.
 */
router.post(
  '/from-photo-estimate',
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    // The router mounts `authenticate` but not the diary permission check, so
    // this route asks for it explicitly.
    const parsed = foodPhotoLogRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid food photo log payload.',
        code: 'INVALID_REQUEST',
        issues: parsed.error.issues,
      });
    }

    const userId = req.userId;
    const targetUserId = req.body?.user_id || userId;
    if (targetUserId !== userId) {
      const hasPermission = await canAccessUserData(
        targetUserId,
        'diary',
        userId
      );
      if (!hasPermission) {
        return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
      }
    }

    try {
      const result = await foodPhotoLogService.createPhotoLoggedMeal(
        targetUserId,
        userId,
        parsed.data
      );
      log(
        'info',
        `User ${userId} logged a ${parsed.data.mode} photo estimate with ${parsed.data.items.length} item(s)`
      );
      clearUserTdeeCache(targetUserId);

      // The reusable template is built AFTER the log commits, deliberately.
      //
      // It reads the entries back out of the diary, so it cannot see them while
      // they are still uncommitted. More importantly the diary rows are the
      // thing the user asked for and the template is a convenience on top: if
      // template creation fails, losing a correctly logged meal to roll it back
      // would be the worse outcome. The response reports meal_template_id as
      // null instead, and "convert to meal" remains available.
      let mealTemplateId: string | null = null;
      const saveAsMeal = parsed.data.save_as_meal;
      if (saveAsMeal && result.food_entry_meal_id) {
        try {
          const meal = await mealService.createMealFromDiaryEntries(
            targetUserId,
            parsed.data.entry_date,
            parsed.data.meal_type,
            saveAsMeal.name,
            parsed.data.description,
            false,
            result.food_entry_meal_id,
            // The diary holds the portion that was eaten; the template should
            // hold the whole dish, so scale the entries back up by the
            // reciprocal of the multiplier the log applied, and record the
            // serving model that reproduces that portion from the template.
            (parsed.data.serving_size * parsed.data.total_servings) /
              parsed.data.consumed_quantity,
            parsed.data.total_servings,
            parsed.data.serving_size,
            parsed.data.serving_unit
          );
          mealTemplateId = meal?.id ?? null;
        } catch (mealError) {
          log(
            'warn',
            `Photo estimate logged for user ${userId} but the meal template could not be saved: ${
              mealError instanceof Error ? mealError.message : String(mealError)
            }`
          );
        }
      }

      return res.status(201).json(
        foodPhotoLogResponseSchema.parse({
          ...result,
          meal_template_id: mealTemplateId,
        })
      );
    } catch (err) {
      if (err instanceof PhotoLogError) {
        const status =
          err.code === 'FOOD_NOT_FOUND' || err.code === 'VARIANT_NOT_FOUND'
            ? 404
            : err.code === 'FORBIDDEN'
              ? 403
              : 400;
        return res.status(status).json({ error: err.message, code: err.code });
      }
      return next(err);
    }
  }
);

/**
 * @swagger
 * /food-entry-meals/by-date/{date}:
 *   get:
 *     summary: Get FoodEntryMeals by date
 *     tags: [Nutrition & Meals]
 *     description: Retrieves a list of all food entry meals for a specific date.
 *     parameters:
 *       - in: path
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: The date to retrieve food entry meals for (YYYY-MM-DD).
 *     responses:
 *       200:
 *         description: A list of food entry meals for the specified date.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/FoodEntryMeal'
 *       403:
 *         description: User does not have permission to access this resource.
 */
router.get('/by-date/:date', async (req, res, next) => {
  try {
    const { date } = req.params;
    const { userId } = req.query; // Check query param
    // Determine target user

    const targetUserId = userId ? String(userId) : req.userId;
    // We rely on getFoodEntryMealsByDate to potentially filter or just fetch.
    // Ideally we check permission here too.

    if (targetUserId !== req.userId) {
      const hasPermission = await { canAccessUserData }.canAccessUserData(
        targetUserId,
        'diary',

        req.userId
      );
      if (!hasPermission) return res.status(403).json({ error: 'Forbidden' });
    }
    const foodEntryMeals = await foodEntryService.getFoodEntryMealsByDate(
      req.userId,
      targetUserId,
      String(date)
    ); // Corrected arguments
    res.status(200).json(foodEntryMeals);
  } catch (err) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    log('error', `Error getting FoodEntryMeals by date: ${err.message}`, err);
    next(err);
  }
});
/**
 * @swagger
 * /food-entry-meals/{id}:
 *   get:
 *     summary: Get a specific FoodEntryMeal with its components
 *     tags: [Nutrition & Meals]
 *     description: Retrieves a specific food entry meal by its ID, including its associated food components.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the food entry meal to retrieve.
 *     responses:
 *       200:
 *         description: The requested FoodEntryMeal with components.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FoodEntryMeal'
 *       403:
 *         description: User does not have permission to access this resource.
 *       404:
 *         description: FoodEntryMeal not found.
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const userId = req.userId; // From authMiddleware
    const foodEntryMeal = await foodEntryService.getFoodEntryMealWithComponents(
      userId,
      id
    );
    if (foodEntryMeal) {
      res.status(200).json(foodEntryMeal);
    } else {
      log('warn', `FoodEntryMeal with ID ${id} not found for user ${userId}`);
      res.status(404).json({ message: 'FoodEntryMeal not found' });
    }
  } catch (err) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    log('error', `Error getting FoodEntryMeal by ID: ${err.message}`, err);
    next(err);
  }
});
/**
 * @swagger
 * /food-entry-meals/{id}:
 *   put:
 *     summary: Update an existing FoodEntryMeal
 *     tags: [Nutrition & Meals]
 *     description: Updates an existing food entry meal with new information.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the food entry meal to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/FoodEntryMeal'
 *     responses:
 *       200:
 *         description: The FoodEntryMeal was updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FoodEntryMeal'
 *       403:
 *         description: User does not have permission to update this food entry meal.
 *       404:
 *         description: FoodEntryMeal not found.
 */
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      notes,
      meal_type,
      meal_type_id,
      entry_date,
      entry_time,
      foods,
      quantity,
      unit,
      meal_template_id,
      entry_total_servings,
    } = req.body;

    if (
      entry_time !== null &&
      entry_time !== undefined &&
      !isEntryTimeString(entry_time)
    ) {
      return res.status(400).json({
        error: 'entry_time must be in HH:MM (24h) format.',
      });
    }

    if (
      entry_total_servings !== null &&
      entry_total_servings !== undefined &&
      (!Number.isFinite(Number(entry_total_servings)) ||
        Number(entry_total_servings) <= 0)
    ) {
      return res.status(400).json({
        error: 'entry_total_servings must be a positive number.',
      });
    }

    log('info', `[DEBUG] PUT /food-entry-meals/${id} Body:`, {
      quantity,
      unit,
      name,
      meal_template_id,
      entry_total_servings,
    }); // DEBUG LOG

    const userId = req.userId; // From authMiddleware
    // We need to find the owner of this meal to update it properly
    // Use the service to get the meal (it might return null if no access, or we check access after)
    // Actually, simple update: The repository likely filters by owner_id = $ownerId.
    // If we pass userId (User A) as owner, it won't find User B's meal.
    // So we MUST know the owner.
    // Let's rely on the frontend passing 'user_id' in the body if it knows it? Or fetch it.
    // Frontend likely doesn't pass user_id in PUT body.
    // Correct approach: Fetch the meal first using a system/admin or shared scope if possible, OR
    // if we added `getFoodEntryMealById` that doesn't check owner yet?
    // Let's assume we can fetch it via `getFoodEntryMealWithComponents(userId, id)` because we likely have read access.
    const existingMeal = await foodEntryService.getFoodEntryMealWithComponents(
      userId,
      id
    );
    if (!existingMeal) {
      return res
        .status(404)
        .json({ message: 'FoodEntryMeal not found or permission denied.' });
    }
    const targetUserId = existingMeal.user_id;
    // Check write permission if target is not self
    if (targetUserId !== userId) {
      const hasPermission = await { canAccessUserData }.canAccessUserData(
        targetUserId,
        'diary',
        userId
      );
      if (!hasPermission) return res.status(403).json({ error: 'Forbidden' });
    }
    const updatedFoodEntryMeal = await foodEntryService.updateFoodEntryMeal(
      targetUserId, // owner ID
      userId, // actingUserId
      id, // foodEntryMealId
      {
        name,
        description,
        notes,
        meal_type,
        meal_type_id,
        entry_date,
        entry_time,
        foods,
        quantity,
        unit,
        meal_template_id,
        entry_total_servings:
          entry_total_servings !== undefined
            ? entry_total_servings !== null
              ? Number(entry_total_servings)
              : null
            : undefined,
      } // updatedMealData
    );
    log('info', `User ${userId} updated FoodEntryMeal`);
    clearUserTdeeCache(targetUserId);
    res.status(200).json(updatedFoodEntryMeal);
  } catch (err) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    log('error', `Error updating FoodEntryMeal: ${err.message}`, err);
    next(err);
  }
});
/**
 * @swagger
 * /food-entry-meals/{id}:
 *   delete:
 *     summary: Delete a FoodEntryMeal
 *     tags: [Nutrition & Meals]
 *     description: Deletes a specific food entry meal.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the food entry meal to delete.
 *     responses:
 *       204:
 *         description: FoodEntryMeal deleted successfully.
 *       403:
 *         description: User does not have permission to delete this food entry meal.
 *       404:
 *         description: FoodEntryMeal not found.
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const userId = req.userId; // From authMiddleware
    await foodEntryService.deleteFoodEntryMeal(userId, id);
    log('info', `User ${userId} deleted FoodEntryMeal ${id}`);
    clearUserTdeeCache(userId);
    res.status(204).send(); // No content
  } catch (err) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    log('error', `Error deleting FoodEntryMeal: ${err.message}`, err);
    next(err);
  }
});
/**
 * @swagger
 * /food-entry-meals/{id}/image:
 *   post:
 *     summary: Set a logged meal's override photo
 *     tags: [Nutrition & Meals]
 *     description: >
 *       Attaches a photo to this diary entry only. It never modifies the meal
 *       template's own images; entries without an override fall back to those.
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               images:
 *                 description: >
 *                   Repeated file parts for newly uploaded photos, plus a JSON
 *                   string field of the same name holding the desired final
 *                   order. Entries in that array are either existing image
 *                   paths being kept, or `__new__<n>` placeholders marking
 *                   where the n-th uploaded file belongs.
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       200:
 *         description: The updated logged meal.
 *       400:
 *         description: No image supplied.
 *       404:
 *         description: FoodEntryMeal not found.
 */
router.post('/:id/image', uploadImages, async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: 'FoodEntryMeal ID is required.' });
  }
  try {
    const existing = await foodEntryMealRepository.getFoodEntryMealById(
      id,
      req.userId
    );
    if (!existing) {
      return res.status(404).json({ error: 'FoodEntryMeal not found.' });
    }

    const uploadedPaths = await finalizeUploadedImages(
      stagedFilesFrom(req),
      'food_entry_meals',
      id
    );

    // `images` is the client's desired final order, with __new__<n>
    // placeholders marking where each uploaded file belongs, so one request
    // can add, remove, and reorder together.
    const requestedOrder = parseImageOrder(req.body?.images);
    if (uploadedPaths.length === 0 && requestedOrder === undefined) {
      // Nothing to apply; drop the files we already moved out of staging.
      await removeOrphanedImages(uploadedPaths, []);
      return res.status(400).json({ error: 'An image file is required.' });
    }
    const nextImages = applyImageOrder(requestedOrder, uploadedPaths);

    let updated;
    try {
      updated = await foodEntryMealRepository.setFoodEntryMealImages(
        id,
        req.userId,
        nextImages
      );
    } catch (persistError) {
      // The files are already out of staging, so cleanupStagedImages can no
      // longer reach them; remove them here or they leak permanently.
      await removeOrphanedImages(uploadedPaths, []);
      throw persistError;
    }
    if (!updated) {
      // Concurrent delete, or the row is no longer the caller's.
      await removeOrphanedImages(uploadedPaths, []);
      return res.status(404).json({ error: 'FoodEntryMeal not found.' });
    }

    // Drop files the client dropped so replacements don't accumulate on disk.
    await removeOrphanedImages(existing.images, nextImages);

    res.status(200).json({ ...existing, ...updated });
  } catch (err) {
    next(err);
  } finally {
    await cleanupStagedImages(req);
  }
});

/**
 * @swagger
 * /food-entry-meals/{id}/image:
 *   delete:
 *     summary: Clear a logged meal's override photo
 *     tags: [Nutrition & Meals]
 *     description: >
 *       Removes the entry-specific photo so the entry falls back to the meal
 *       template's own image. The template is never modified.
 *     responses:
 *       200:
 *         description: The updated logged meal.
 *       404:
 *         description: FoodEntryMeal not found.
 */
router.delete('/:id/image', async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: 'FoodEntryMeal ID is required.' });
  }
  try {
    const existing = await foodEntryMealRepository.getFoodEntryMealById(
      id,
      req.userId
    );
    if (!existing) {
      return res.status(404).json({ error: 'FoodEntryMeal not found.' });
    }

    const updated = await foodEntryMealRepository.setFoodEntryMealImages(
      id,
      req.userId,
      []
    );
    await removeOrphanedImages(existing.images, []);

    res.status(200).json({ ...existing, ...updated });
  } catch (err) {
    next(err);
  }
});

export default router;
