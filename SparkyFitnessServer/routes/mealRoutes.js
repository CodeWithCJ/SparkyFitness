const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const mealService = require('../services/mealService');
const { log } = require('../config/logging');

router.use(express.json());

// --- Meal Plan Routes ---

/**
 * @swagger
 * /meals/plan:
 *   post:
 *     summary: Create a new meal plan entry
 *     tags: [Nutrition & Meals]
 *     description: Creates a new meal plan entry for the authenticated user.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               meal_plan_template_id:
 *                 type: string
 *                 format: uuid
 *                 description: The ID of the meal plan template to use.
 *               plan_date:
 *                 type: string
 *                 format: date
 *                 description: The date for which the meal plan is created.
 *               meals:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     meal_type:
 *                       type: string
 *                       description: The type of meal (e.g., "Breakfast").
 *                     food_ids:
 *                       type: array
 *                       items:
 *                         type: string
 *                         format: uuid
 *                       description: List of food IDs included in this meal.
 *             required:
 *               - meal_plan_template_id
 *               - plan_date
 *               - meals
 *     responses:
 *       201:
 *         description: The meal plan entry was created successfully.
 *       400:
 *         description: Invalid request body.
 *       403:
 *         description: User does not have permission to create a meal plan entry.
 */
router.post('/plan', authenticate, async (req, res, next) => {
  try {
    const newMealPlanEntry = await mealService.createMealPlanEntry(req.userId, req.body);
    res.status(201).json(newMealPlanEntry);
  } catch (error) {
    log('error', `Error creating meal plan entry:`, error);
    next(error);
  }
});

/**
 * @swagger
 * /meals/plan:
 *   get:
 *     summary: Get meal plan entries for a specific date or date range
 *     tags: [Nutrition & Meals]
 *     description: Retrieves meal plan entries for the authenticated user within a specified date range.
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         required: true
 *         description: The start date of the range (YYYY-MM-DD).
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         required: true
 *         description: The end date of the range (YYYY-MM-DD).
 *     responses:
 *       200:
 *         description: A list of meal plan entries.
 *       400:
 *         description: startDate and endDate are required.
 *       403:
 *         description: User does not have permission to access this resource.
 */
router.get('/plan', authenticate, async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required for meal plan retrieval.' });
    }
    const mealPlanEntries = await mealService.getMealPlanEntries(req.userId, startDate, endDate);
    res.status(200).json(mealPlanEntries);
  } catch (error) {
    log('error', `Error getting meal plan entries:`, error);
    next(error);
  }
});

/**
 * @swagger
 * /meals/plan/{id}:
 *   put:
 *     summary: Update a meal plan entry
 *     tags: [Nutrition & Meals]
 *     description: Updates an existing meal plan entry.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the meal plan entry to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               meal_plan_template_id:
 *                 type: string
 *                 format: uuid
 *                 description: The ID of the meal plan template to use.
 *               plan_date:
 *                 type: string
 *                 format: date
 *                 description: The date for which the meal plan is created.
 *               meals:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     meal_type:
 *                       type: string
 *                       description: The type of meal (e.g., "Breakfast").
 *                     food_ids:
 *                       type: array
 *                       items:
 *                         type: string
 *                         format: uuid
 *                       description: List of food IDs included in this meal.
 *             required:
 *               - meal_plan_template_id
 *               - plan_date
 *               - meals
 *     responses:
 *       200:
 *         description: The meal plan entry was updated successfully.
 *       403:
 *         description: User does not have permission to update this meal plan entry.
 *       404:
 *         description: Meal plan entry not found.
 */
router.put('/plan/:id', authenticate, async (req, res, next) => {
  try {
    const updatedMealPlanEntry = await mealService.updateMealPlanEntry(req.userId, req.params.id, req.body);
    res.status(200).json(updatedMealPlanEntry);
  } catch (error) {
    log('error', `Error updating meal plan entry ${req.params.id}:`, error);
    if (error.message === 'Meal plan entry not found or not authorized.') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * @swagger
 * /meals/plan/{id}:
 *   delete:
 *     summary: Delete a meal plan entry
 *     tags: [Nutrition & Meals]
 *     description: Deletes a specific meal plan entry.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the meal plan entry to delete.
 *     responses:
 *       200:
 *         description: Meal plan entry deleted successfully.
 *       403:
 *         description: User does not have permission to delete this meal plan entry.
 *       404:
 *         description: Meal plan entry not found.
 */
router.delete('/plan/:id', authenticate, async (req, res, next) => {
  try {
    await mealService.deleteMealPlanEntry(req.userId, req.params.id);
    res.status(200).json({ message: 'Meal plan entry deleted successfully.' });
  } catch (error) {
    log('error', `Error deleting meal plan entry ${req.params.id}:`, error);
    if (error.message === 'Meal plan entry not found or not authorized.') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

// --- Meal Template Routes ---

/**
 * @swagger
 * /meals:
 *   post:
 *     summary: Create a new meal template
 *     tags: [Nutrition & Meals]
 *     description: Creates a new meal template for the authenticated user.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: The name of the meal.
 *               description:
 *                 type: string
 *                 description: A description of the meal.
 *               is_public:
 *                 type: boolean
 *                 description: Whether the meal is publicly visible.
 *               foods:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     food_id:
 *                       type: string
 *                       format: uuid
 *                     quantity:
 *                       type: number
 *                     unit:
 *                       type: string
 *                   required:
 *                     - food_id
 *                     - quantity
 *                     - unit
 *             required:
 *               - name
 *               - foods
 *     responses:
 *       201:
 *         description: The meal was created successfully.
 *       403:
 *         description: User does not have permission to create a meal.
 */
router.post('/', authenticate, async (req, res, next) => {
  try {
    const newMeal = await mealService.createMeal(req.userId, req.body);
    res.status(201).json(newMeal);
  } catch (error) {
    log('error', `Error creating meal:`, error);
    next(error);
  }
});

/**
 * @swagger
 * /meals:
 *   get:
 *     summary: Get all meal templates for the user
 *     tags: [Nutrition & Meals]
 *     description: Retrieves all meal templates owned by the authenticated user, and public ones.
 *     parameters:
 *       - in: query
 *         name: filter
 *         schema:
 *           type: string
 *         description: Filter meals (e.g., "public", "private").
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term for meal names.
 *     responses:
 *       200:
 *         description: A list of meal templates.
 *       403:
 *         description: User does not have permission to access this resource.
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { filter, search } = req.query;
    const meals = await mealService.getMeals(req.userId, filter, search);
    res.status(200).json(meals);
  } catch (error) {
    log('error', `Error getting meals:`, error);
    next(error);
  }
});

/**
 * @swagger
 * /meals/search:
 *   get:
 *     summary: Search for meal templates
 *     tags: [Nutrition & Meals]
 *     description: Searches for meal templates based on a search term.
 *     parameters:
 *       - in: query
 *         name: searchTerm
 *         schema:
 *           type: string
 *         required: true
 *         description: The term to search for.
 *     responses:
 *       200:
 *         description: A list of meal templates matching the search term.
 *       400:
 *         description: Search term is required.
 */
router.get('/search', authenticate, async (req, res, next) => {
  try {
    const { searchTerm } = req.query;
    if (!searchTerm) {
      return res.status(400).json({ error: 'Search term is required.' });
    }
    const meals = await mealService.searchMeals(req.userId, searchTerm);
    res.status(200).json(meals);
  } catch (error) {
    log('error', `Error searching meals:`, error);
    next(error);
  }
});

/**
 * @swagger
 * /meals/{id}:
 *   get:
 *     summary: Get a specific meal template by ID
 *     tags: [Nutrition & Meals]
 *     description: Retrieves a specific meal template by its ID.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the meal template to retrieve.
 *     responses:
 *       200:
 *         description: The requested meal template.
 *       403:
 *         description: User does not have permission to access this resource.
 *       404:
 *         description: Meal not found.
 */
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const meal = await mealService.getMealById(req.userId, req.params.id);
    res.status(200).json(meal);
  } catch (error) {
    log('error', `Error getting meal by ID ${req.params.id}:`, error);
    if (error.message === 'Meal not found.') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * @swagger
 * /meals/{id}:
 *   put:
 *     summary: Update an existing meal template
 *     tags: [Nutrition & Meals]
 *     description: Updates an existing meal template.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the meal template to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: The name of the meal.
 *               description:
 *                 type: string
 *                 description: A description of the meal.
 *               is_public:
 *                 type: boolean
 *                 description: Whether the meal is publicly visible.
 *               foods:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     food_id:
 *                       type: string
 *                       format: uuid
 *                     quantity:
 *                       type: number
 *                     unit:
 *                       type: string
 *                   required:
 *                     - food_id
 *                     - quantity
 *                     - unit
 *             required:
 *               - name
 *               - foods
 *     responses:
 *       200:
 *         description: The meal template was updated successfully.
 *       403:
 *         description: User does not have permission to update this meal.
 *       404:
 *         description: Meal not found.
 */
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const { confirmationMessage, ...updatedMeal } = await mealService.updateMeal(req.userId, req.params.id, req.body);
    res.status(200).json({ ...updatedMeal, confirmationMessage });
  } catch (error) {
    log('error', `Error updating meal ${req.params.id}:`, error);
    if (error.message === 'Meal not found.') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * @swagger
 * /meals/{id}:
 *   delete:
 *     summary: Delete a meal template
 *     tags: [Nutrition & Meals]
 *     description: Deletes a specific meal template.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the meal template to delete.
 *     responses:
 *       200:
 *         description: Meal deleted successfully.
 *       403:
 *         description: User does not have permission to delete this meal.
 *       404:
 *         description: Meal not found.
 */
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    await mealService.deleteMeal(req.userId, req.params.id);
    res.status(200).json({ message: 'Meal deleted successfully.' });
  } catch (error) {
    log('error', `Error deleting meal ${req.params.id}:`, error);
    if (error.message === 'Meal not found.') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * @swagger
 * /meals/{id}/deletion-impact:
 *   get:
 *     summary: Get the deletion impact for a meal
 *     tags: [Nutrition & Meals]
 *     description: Retrieves the impact of deleting a specific meal template.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the meal to check.
 *     responses:
 *       200:
 *         description: The deletion impact report.
 *       403:
 *         description: User does not have permission to access this resource.
 *       404:
 *         description: Meal not found.
 */
router.get('/:id/deletion-impact', authenticate, async (req, res, next) => {
  try {
    const deletionImpact = await mealService.getMealDeletionImpact(req.userId, req.params.id);
    res.status(200).json(deletionImpact);
  } catch (error) {
    log('error', `Error getting meal deletion impact for meal ${req.params.id}:`, error);
    if (error.message === 'Meal not found.') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

// --- Logging Meal Plan to Food Entries ---

/**
 * @swagger
 * /meals/plan/{id}/log-to-diary:
 *   post:
 *     summary: Log a specific meal plan entry to the food diary
 *     tags: [Nutrition & Meals]
 *     description: Logs a specific meal plan entry to the user's food diary for a target date.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the meal plan entry to log.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               target_date:
 *                 type: string
 *                 format: date
 *                 description: The date to log the meal plan entry to.
 *             required:
 *               - target_date
 *     responses:
 *       201:
 *         description: The food entries were created successfully.
 *       403:
 *         description: User does not have permission to perform this action.
 *       404:
 *         description: Meal plan entry or associated meal template not found.
 */
router.post('/plan/:id/log-to-diary', authenticate, async (req, res, next) => {
  try {
    const { target_date } = req.body;
    const createdFoodEntries = await mealService.logMealPlanEntryToDiary(req.userId, req.params.id, target_date);
    res.status(201).json(createdFoodEntries);
  } catch (error) {
    log('error', `Error logging meal plan entry ${req.params.id} to diary:`, error);
    if (error.message === 'Meal plan entry not found or not authorized.' || error.message === 'Associated meal template not found.') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * @swagger
 * /meals/plan/log-day-to-diary:
 *   post:
 *     summary: Log all meal plan entries for a specific day to the food diary
 *     tags: [Nutrition & Meals]
 *     description: Logs all meal plan entries for a given plan date to the user's food diary for a target date.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               plan_date:
 *                 type: string
 *                 format: date
 *                 description: The date of the meal plan to log.
 *               target_date:
 *                 type: string
 *                 format: date
 *                 description: The date to log the meal plan entries to.
 *             required:
 *               - plan_date
 *               - target_date
 *     responses:
 *       201:
 *         description: The food entries were created successfully.
 *       400:
 *         description: plan_date is required.
 *       403:
 *         description: User does not have permission to perform this action.
 */
router.post('/plan/log-day-to-diary', authenticate, async (req, res, next) => {
  try {
    const { plan_date, target_date } = req.body;
    if (!plan_date) {
      return res.status(400).json({ error: 'plan_date is required.' });
    }
    const createdFoodEntries = await mealService.logDayMealPlanToDiary(req.userId, plan_date, target_date);
    res.status(201).json(createdFoodEntries);
  } catch (error) {
    log('error', `Error logging day meal plan to diary for date ${req.body.plan_date}:`, error);
    next(error);
  }
});

/**
 * @swagger
 * /meals/needs-review:
 *   get:
 *     summary: Get meals needing review
 *     tags: [Nutrition & Meals]
 *     description: Retrieves a list of meals that need to be reviewed.
 *     responses:
 *       200:
 *         description: A list of meals needing review.
 *       403:
 *         description: User does not have permission to access this resource.
 */
router.get(
  "/needs-review",
  authenticate,
  async (req, res, next) => {
    try {
      const mealsNeedingReview = await mealService.getMealsNeedingReview(req.userId);
      res.status(200).json(mealsNeedingReview);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /meals/update-snapshot:
 *   post:
 *     summary: Update meal entries snapshot
 *     tags: [Nutrition & Meals]
 *     description: Updates the snapshot of meal entries.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               mealId:
 *                 type: string
 *                 format: uuid
 *                 description: The ID of the meal to update the snapshot for.
 *             required:
 *               - mealId
 *     responses:
 *       200:
 *         description: The result of the snapshot update.
 *       400:
 *         description: mealId is required.
 *       403:
 *         description: User does not have permission to perform this action.
 */
router.post(
  "/update-snapshot",
  authenticate,
  async (req, res, next) => {
    const { mealId } = req.body;
    if (!mealId) {
      return res.status(400).json({ error: "mealId is required." });
    }
    try {
      const result = await mealService.updateMealEntriesSnapshot(req.userId, mealId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /meals/create-meal-from-diary:
 *   post:
 *     summary: Create a meal from diary entries
 *     tags: [Nutrition & Meals]
 *     description: Creates a new meal template from existing food diary entries for a specific date and meal type.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               date:
 *                 type: string
 *                 format: date
 *                 description: The date of the diary entries to use.
 *               mealType:
 *                 type: string
 *                 description: The meal type of the diary entries to use.
 *               mealName:
 *                 type: string
 *                 description: A name for the new meal template.
 *               description:
 *                 type: string
 *                 description: A description for the new meal template.
 *               isPublic:
 *                 type: boolean
 *                 description: Whether the new meal template should be publicly visible.
 *             required:
 *               - date
 *               - mealType
 *     responses:
 *       201:
 *         description: The new meal template was created successfully.
 *       400:
 *         description: Date and mealType are required, or no food entries found, or cannot create meal.
 *       403:
 *         description: User does not have permission to perform this action.
 */
router.post('/create-meal-from-diary', authenticate, async (req, res, next) => {
  try {
    const { date, mealType, mealName, description, isPublic } = req.body;
    if (!date || !mealType) {
      return res.status(400).json({ error: 'Date and mealType are required to create a meal from diary entries.' });
    }
    const newMeal = await mealService.createMealFromDiaryEntries(req.userId, date, mealType, mealName, description, isPublic);
    res.status(201).json(newMeal);
  } catch (error) {
    log('error', `Error creating meal from diary entries:`, error);
    if (error.message.startsWith('No food entries found') || error.message.startsWith('Cannot create meal')) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

module.exports = router;
