const express = require("express");
const router = express.Router();
const {
  createMealType,
  getAllMealTypes,
  getMealTypeById,
  updateMealType,
  deleteMealType,
} = require("../models/mealType");
const { log } = require("../config/logging");
const { authenticate } = require("../middleware/authMiddleware");

router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Nutrition & Meals
 *   description: Food database, meal planning, meal types, and nutritional tracking.
 */

/**
 * @swagger
 * /meal-types:
 *   get:
 *     summary: Retrieve all meal types
 *     tags: [Nutrition & Meals]
 *     description: Retrieves all meal types available to the user, including system defaults and custom meal types.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of meal types.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/MealType'
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       500:
 *         description: Failed to fetch meal types.
 */
router.get("/", async (req, res) => {
  try {
    const userId = req.userId;
    const mealTypes = await getAllMealTypes(userId);
    res.status(200).json(mealTypes);
  } catch (error) {
    log("error", "Route GET /meal-types error:", error);
    res.status(500).json({ error: "Failed to fetch meal types" });
  }
});

/**
 * @swagger
 * /meal-types/{id}:
 *   get:
 *     summary: Retrieve a single meal type by ID
 *     tags: [Nutrition & Meals]
 *     description: Retrieves a single meal type by its ID.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the meal type to retrieve.
 *     responses:
 *       200:
 *         description: The requested meal type.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MealType'
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       404:
 *         description: Meal type not found.
 *       500:
 *         description: Failed to fetch meal type.
 */
router.get("/:id", async (req, res) => {
  try {
    const userId = req.userId;
    const { id } = req.params;

    const mealType = await getMealTypeById(id, userId);

    if (!mealType) {
      return res.status(404).json({ error: "Meal type not found" });
    }

    res.status(200).json(mealType);
  } catch (error) {
    log("error", `Route GET /meal-types/${req.params.id} error:`, error);
    res.status(500).json({ error: "Failed to fetch meal type" });
  }
});

/**
 * @swagger
 * /meal-types:
 *   post:
 *     summary: Create a new custom meal type
 *     tags: [Nutrition & Meals]
 *     description: Creates a new custom meal type for the authenticated user.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 description: The name of the new meal type (e.g., "Pre-Workout").
 *               sort_order:
 *                 type: integer
 *                 description: The sort order for the meal type.
 *                 nullable: true
 *     responses:
 *       201:
 *         description: The new meal type was created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MealType'
 *       400:
 *         description: Invalid request body, name is required.
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       409:
 *         description: A meal type with the given name already exists.
 *       500:
 *         description: Failed to create meal type.
 */
router.post("/", async (req, res) => {
  try {
    const userId = req.userId;
    const { name, sort_order } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Name is required" });
    }

    const newMealType = await createMealType(
      { name, sort_order },
      userId
    );
    res.status(201).json(newMealType);
  } catch (error) {
    log("error", "Route POST /meal-types error:", error);

    if (error.message.includes("already exists")) {
      return res.status(409).json({ error: error.message });
    }

    res.status(500).json({ error: "Failed to create meal type" });
  }
});

/**
 * @swagger
 * /meal-types/{id}:
 *   put:
 *     summary: Update a meal type
 *     tags: [Nutrition & Meals]
 *     description: Updates an existing custom meal type. System default meal types cannot be updated.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the meal type to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: The new name for the meal type.
 *               sort_order:
 *                 type: integer
 *                 description: The new sort order for the meal type.
 *                 nullable: true
 *               is_visible:
 *                 type: boolean
 *                 description: Whether this meal type is visible in the diary view.
 *               show_in_quick_log:
 *                 type: boolean
 *                 description: Whether this meal type appears in the quick food log menu.
 *     responses:
 *       200:
 *         description: The meal type was updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MealType'
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       403:
 *         description: Forbidden, system default meal types cannot be updated.
 *       404:
 *         description: Meal type not found.
 *       500:
 *         description: Failed to update meal type.
 */
router.put("/:id", async (req, res) => {
  try {
    const userId = req.userId;
    const { id } = req.params;
    const { name, sort_order, is_visible, show_in_quick_log } = req.body;

    const updatedMealType = await updateMealType(
      id,
      { name, sort_order, is_visible, show_in_quick_log },
      userId
    );

    res.status(200).json(updatedMealType);
  } catch (error) {
    log("error", `Route PUT /meal-types/${req.params.id} error:`, error);

    if (error.message.includes("system default")) {
      return res.status(403).json({ error: error.message });
    }
    if (error.message.includes("not found")) {
      return res.status(404).json({ error: error.message });
    }

    res.status(500).json({ error: "Failed to update meal type" });
  }
});

/**
 * @swagger
 * /meal-types/{id}:
 *   delete:
 *     summary: Delete a custom meal type
 *     tags: [Nutrition & Meals]
 *     description: Deletes a custom meal type. System default meal types cannot be deleted.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the meal type to delete.
 *     responses:
 *       200:
 *         description: Meal type deleted successfully.
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       403:
 *         description: Forbidden, system default meal types cannot be deleted.
 *       404:
 *         description: Meal type not found or cannot be deleted.
 *       409:
 *         description: Conflict, meal type contains food entries and cannot be deleted.
 *       500:
 *         description: Failed to delete meal type.
 */
router.delete("/:id", async (req, res) => {
  try {
    const userId = req.userId;
    const { id } = req.params;

    const deleted = await deleteMealType(id, userId);

    if (!deleted) {
      return res
        .status(404)
        .json({ error: "Meal type not found or cannot be deleted" });
    }

    res.status(200).json({ message: "Meal type deleted successfully" });
  } catch (error) {
    log("error", `Route DELETE /meal-types/${req.params.id} error:`, error);

    if (error.message.includes("system default")) {
      return res.status(403).json({ error: error.message });
    }
    if (error.message.includes("contains food entries")) {
      return res.status(409).json({ error: error.message });
    }

    res.status(500).json({ error: "Failed to delete meal type" });
  }
});

module.exports = router;
