import express from 'express';
import foodEntryService from '../services/foodEntryService.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { log } from '../config/logging.js';
import { canAccessUserData } from '../utils/permissionUtils.js';
import { clearUserTdeeCache } from '../services/AdaptiveTdeeService.js';
import { isEntryTimeString } from '@workspace/shared';
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
      foods,
      quantity,
      unit,
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
        foods,
        quantity,
        unit,
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
      meal_type,
      meal_type_id,
      entry_date,
      entry_time,
      foods,
      quantity,
      unit,
      meal_template_id,
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
    log('info', `[DEBUG] PUT /food-entry-meals/${id} Body:`, {
      quantity,
      unit,
      name,
      meal_template_id,
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
        meal_type,
        meal_type_id,
        entry_date,
        entry_time,
        foods,
        quantity,
        unit,
        meal_template_id,
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
