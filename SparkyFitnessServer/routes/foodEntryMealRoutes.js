const express = require("express");
const router = express.Router();
const foodEntryService = require("../services/foodEntryService");
const { authenticate } = require("../middleware/authMiddleware"); // Import authenticate function
const { log } = require("../config/logging");

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
router.post("/", async (req, res, next) => {
  try {
    const {
      meal_template_id,
      meal_type,
      meal_type_id,
      entry_date,
      name,
      description,
      foods,
      quantity,
      unit,
    } = req.body;
    const userId = req.userId; // From authMiddleware

    // Determine target user
    const targetUserId = req.body.user_id || userId;

    if (targetUserId !== userId) {
      const hasPermission = await require('../utils/permissionUtils').canAccessUserData(targetUserId, 'diary', userId);
      if (!hasPermission) return res.status(403).json({ error: 'Forbidden' });
    }

    const newFoodEntryMeal = await foodEntryService.createFoodEntryMeal(
      targetUserId, // Use targetUserId
      userId, // actingUserId is the authenticated user
      {
        user_id: targetUserId, // Ensure this is passed
        meal_template_id,
        meal_type,
        meal_type_id,
        entry_date,
        name,
        description,
        foods,
        quantity,
        unit,
      } // mealData
    );
    log("info", `User ${userId} created FoodEntryMeal ${newFoodEntryMeal.id}`);
    res.status(201).json(newFoodEntryMeal);
  } catch (err) {
    log("error", `Error creating FoodEntryMeal: ${err.message}`, err);
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
router.get("/by-date/:date", async (req, res, next) => {
  try {
    const { date } = req.params;
    const { userId } = req.query; // Check query param

    // Determine target user
    const targetUserId = userId || req.userId;

    // We rely on getFoodEntryMealsByDate to potentially filter or just fetch. 
    // Ideally we check permission here too.
    if (targetUserId !== req.userId) {
      const hasPermission = await require('../utils/permissionUtils').canAccessUserData(targetUserId, 'diary', req.userId);
      if (!hasPermission) return res.status(403).json({ error: 'Forbidden' });
    }

    const foodEntryMeals = await foodEntryService.getFoodEntryMealsByDate(
      req.userId,
      targetUserId,
      date
    ); // Corrected arguments
    res.status(200).json(foodEntryMeals);
  } catch (err) {
    log("error", `Error getting FoodEntryMeals by date: ${err.message}`, err);
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
router.get("/:id", async (req, res, next) => {
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
      log("warn", `FoodEntryMeal with ID ${id} not found for user ${userId}`);
      res.status(404).json({ message: "FoodEntryMeal not found" });
    }
  } catch (err) {
    log("error", `Error getting FoodEntryMeal by ID: ${err.message}`, err);
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
router.put("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, meal_type, meal_type_id, entry_date, foods, quantity, unit, meal_template_id } =
      req.body;
    log("info", `[DEBUG] PUT /food-entry-meals/${id} Body:`, {
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

    const existingMeal = await foodEntryService.getFoodEntryMealWithComponents(userId, id);
    if (!existingMeal) {
      return res.status(404).json({ message: "FoodEntryMeal not found or permission denied." });
    }

    const targetUserId = existingMeal.user_id;

    // Check write permission if target is not self
    if (targetUserId !== userId) {
      const hasPermission = await require('../utils/permissionUtils').canAccessUserData(targetUserId, 'diary', userId);
      if (!hasPermission) return res.status(403).json({ error: 'Forbidden' });
    }

    const updatedFoodEntryMeal = await foodEntryService.updateFoodEntryMeal(
      targetUserId, // owner ID
      userId, // actingUserId
      id, // foodEntryMealId
      { name, description, meal_type, meal_type_id, entry_date, foods, quantity, unit, meal_template_id } // updatedMealData
    );
    log("info", `User ${userId} updated FoodEntryMeal ${id}`);
    res.status(200).json(updatedFoodEntryMeal);
  } catch (err) {
    log("error", `Error updating FoodEntryMeal ${id}: ${err.message}`, err);
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
router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.userId; // From authMiddleware
    await foodEntryService.deleteFoodEntryMeal(userId, id);
    log("info", `User ${userId} deleted FoodEntryMeal ${id}`);
    res.status(204).send(); // No content
  } catch (err) {
    log("error", `Error deleting FoodEntryMeal ${id}: ${err.message}`, err);
    next(err);
  }
});

module.exports = router;
