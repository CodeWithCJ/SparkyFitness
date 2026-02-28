const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/authMiddleware");
const checkPermissionMiddleware = require('../middleware/checkPermissionMiddleware');
const foodService = require("../services/foodService");
const { log } = require("../config/logging");

router.use(express.json());

// Apply diary permission check to all food routes
router.use(checkPermissionMiddleware('diary'));

// AI-dedicated food search route to handle /api/foods/search
/**
 * @swagger
 * /food-crud/search:
 *   get:
 *     summary: Search for foods (AI-dedicated)
 *     tags: [Nutrition & Meals]
 *     description: Searches for foods based on a name query. This endpoint is dedicated for AI-powered searches.
 *     parameters:
 *       - in: query
 *         name: name
 *         schema:
 *           type: string
 *         required: true
 *         description: The name of the food to search for.
 *       - in: query
 *         name: exactMatch
 *         schema:
 *           type: boolean
 *         description: If true, performs an exact match search.
 *       - in: query
 *         name: broadMatch
 *         schema:
 *           type: boolean
 *         description: If true, performs a broad match search.
 *       - in: query
 *         name: checkCustom
 *         schema:
 *           type: boolean
 *         description: If true, includes custom foods in the search.
 *     responses:
 *       200:
 *         description: A list of foods matching the search criteria.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Food'
 *       400:
 *         description: Invalid request parameters.
 */
router.get(
  "/search",
  authenticate,
  async (req, res, next) => {
    const { name, exactMatch, broadMatch, checkCustom } = req.query;

    if (!name) {
      return res.status(400).json({ error: "Food name is required." });
    }

    try {
      const foods = await foodService.searchFoods(
        req.userId,
        name,
        req.userId,
        exactMatch === "true",
        broadMatch === "true",
        checkCustom === "true"
      );
      res.status(200).json(foods);
    } catch (error) {
      if (error.message.startsWith("Forbidden")) {
        return res.status(403).json({ error: error.message });
      }
      if (error.message === "Invalid search parameters.") {
        return res.status(400).json({ error: error.message });
      }
      next(error);
    }
  }
);

// General food search route (should come before specific ID routes)
/**
 * @swagger
 * /food-crud:
 *   get:
 *     summary: Search for foods
 *     tags: [Nutrition & Meals]
 *     description: Searches for foods based on various criteria.
 *     parameters:
 *       - in: query
 *         name: name
 *         schema:
 *           type: string
 *         description: The name of the food to search for.
 *       - in: query
 *         name: exactMatch
 *         schema:
 *           type: boolean
 *         description: If true, performs an exact match search.
 *       - in: query
 *         name: broadMatch
 *         schema:
 *           type: boolean
 *         description: If true, performs a broad match search.
 *       - in: query
 *         name: checkCustom
 *         schema:
 *           type: boolean
 *         description: If true, includes custom foods in the search.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: The maximum number of results to return.
 *       - in: query
 *         name: mealType
 *         schema:
 *           type: string
 *         description: The type of meal to filter by.
 *     responses:
 *       200:
 *         description: A list of foods matching the search criteria.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Food'
 *       400:
 *         description: Invalid request parameters.
 */
router.get(
  "/",
  authenticate,
  async (req, res, next) => {
    const { name, exactMatch, broadMatch, checkCustom, limit, mealType } = req.query;

    try {
      const result = await foodService.searchFoods(
        req.userId,
        name,
        req.userId,
        exactMatch === "true",
        broadMatch === "true",
        checkCustom === "true",
        parseInt(limit, 10),
        mealType
      );
      res.status(200).json(result);
    } catch (error) {
      if (error.message.startsWith("Forbidden")) {
        return res.status(403).json({ error: error.message });
      }
      if (error.message === "Invalid search parameters.") {
        return res.status(400).json({ error: error.message });
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /food-crud:
 *   post:
 *     summary: Create a new food
 *     tags: [Nutrition & Meals]
 *     description: Creates a new food item.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Food'
 *     responses:
 *       201:
 *         description: The food was created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Food'
 *       403:
 *         description: User does not have permission to create a food.
 */
router.post(
  "/",
  authenticate,
  async (req, res, next) => {
    try {
      const foodData = { ...req.body, user_id: req.userId }; // Ensure user_id is set for the food
      const newFood = await foodService.createFood(req.userId, foodData);
      res.status(201).json(newFood);
    } catch (error) {
      if (error.message.startsWith("Forbidden")) {
        return res.status(403).json({ error: error.message });
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /food-crud/foods-paginated:
 *   get:
 *     summary: Get foods with pagination
 *     tags: [Nutrition & Meals]
 *     description: Retrieves a paginated list of foods.
 *     parameters:
 *       - in: query
 *         name: searchTerm
 *         schema:
 *           type: string
 *         description: The term to search for.
 *       - in: query
 *         name: foodFilter
 *         schema:
 *           type: string
 *         description: The filter to apply to the food list.
 *       - in: query
 *         name: currentPage
 *         schema:
 *           type: integer
 *         description: The current page number.
 *       - in: query
 *         name: itemsPerPage
 *         schema:
 *           type: integer
 *         description: The number of items to return per page.
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *         description: The field to sort by.
 *     responses:
 *       200:
 *         description: A paginated list of foods.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 foods:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Food'
 *                 totalCount:
 *                   type: integer
 */
router.get("/foods-paginated", authenticate, async (req, res, next) => {
  const { searchTerm, foodFilter, currentPage, itemsPerPage, sortBy } =
    req.query;
  try {
    const { foods, totalCount } = await foodService.getFoodsWithPagination(
      req.userId,
      searchTerm,
      foodFilter,
      currentPage,
      itemsPerPage,
      sortBy
    );
    res.status(200).json({ foods, totalCount });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /food-crud/food-variants:
 *   post:
 *     summary: Create a new food variant
 *     tags: [Nutrition & Meals]
 *     description: Creates a new variant for a food item.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/FoodVariant'
 *     responses:
 *       201:
 *         description: The food variant was created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FoodVariant'
 *       403:
 *         description: User does not have permission to create a food variant.
 *       404:
 *         description: Food not found.
 */
router.post(
  "/food-variants",
  authenticate,
  async (req, res, next) => {
    try {
      const newVariant = await foodService.createFoodVariant(
        req.userId,
        req.body
      );
      res.status(201).json(newVariant);
    } catch (error) {
      if (error.message.startsWith("Forbidden")) {
        return res.status(403).json({ error: error.message });
      }
      if (error.message === "Food not found.") {
        return res.status(404).json({ error: error.message });
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /food-crud/food-variants:
 *   get:
 *     summary: Get food variants by food ID
 *     tags: [Nutrition & Meals]
 *     description: Retrieves all variants for a specific food item.
 *     parameters:
 *       - in: query
 *         name: food_id
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: The ID of the food to retrieve variants for.
 *     responses:
 *       200:
 *         description: A list of food variants.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/FoodVariant'
 *       400:
 *         description: Food ID is required.
 */
router.get(
  "/food-variants",
  authenticate,
  async (req, res, next) => {
    const { food_id } = req.query;
    if (!food_id) {
      return res.status(400).json({ error: "Food ID is required." });
    }
    try {
      const variants = await foodService.getFoodVariantsByFoodId(
        req.userId,
        food_id
      );
      res.status(200).json(variants);
    } catch (error) {
      // Let the centralized error handler manage the status codes and messages
      next(error);
    }
  }
);

/**
 * @swagger
 * /food-crud/food-variants/bulk:
 *   post:
 *     summary: Bulk create food variants
 *     tags: [Nutrition & Meals]
 *     description: Creates multiple food variants in a single request.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items:
 *               $ref: '#/components/schemas/FoodVariant'
 *     responses:
 *       201:
 *         description: The food variants were created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/FoodVariant'
 *       403:
 *         description: User does not have permission to create food variants.
 */
router.post(
  "/food-variants/bulk",
  authenticate,
  async (req, res, next) => {
    try {
      const variantsData = req.body;
      const createdVariants = await foodService.bulkCreateFoodVariants(
        req.userId,
        variantsData
      );
      res.status(201).json(createdVariants);
    } catch (error) {
      if (error.message.startsWith("Forbidden")) {
        return res.status(403).json({ error: error.message });
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /food-crud/food-variants/{id}:
 *   get:
 *     summary: Get a food variant by ID
 *     tags: [Nutrition & Meals]
 *     description: Retrieves a specific food variant by its ID.
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: The ID of the food variant to retrieve.
 *     responses:
 *       200:
 *         description: The requested food variant.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FoodVariant'
 *       400:
 *         description: Food Variant ID is required.
 *       403:
 *         description: User does not have permission to access this resource.
 *       404:
 *         description: Food variant not found.
 */
router.get(
  "/food-variants/:id",
  authenticate,
  async (req, res, next) => {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "Food Variant ID is required." });
    }
    try {
      const variant = await foodService.getFoodVariantById(req.userId, id);
      res.status(200).json(variant);
    } catch (error) {
      if (error.message.startsWith("Forbidden")) {
        return res.status(403).json({ error: error.message });
      }
      if (
        error.message === "Food variant not found." ||
        error.message === "Associated food not found."
      ) {
        return res.status(404).json({ error: error.message });
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /food-crud/food-variants/{id}:
 *   put:
 *     summary: Update a food variant
 *     tags: [Nutrition & Meals]
 *     description: Updates an existing food variant.
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: The ID of the food variant to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/FoodVariant'
 *     responses:
 *       200:
 *         description: The updated food variant.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FoodVariant'
 *       400:
 *         description: Food Variant ID and Food ID are required.
 *       403:
 *         description: User does not have permission to update this food variant.
 *       404:
 *         description: Food variant not found.
 */
router.put(
  "/food-variants/:id",
  authenticate,
  async (req, res, next) => {
    const { id } = req.params;
    const { food_id } = req.body; // food_id is needed for authorization in service layer
    if (!id || !food_id) {
      return res
        .status(400)
        .json({ error: "Food Variant ID and Food ID are required." });
    }
    try {
      const updatedVariant = await foodService.updateFoodVariant(
        req.userId,
        id,
        req.body
      );
      res.status(200).json(updatedVariant);
    } catch (error) {
      if (error.message.startsWith("Forbidden")) {
        return res.status(403).json({ error: error.message });
      }
      if (
        error.message === "Food variant not found." ||
        error.message === "Associated food not found."
      ) {
        return res.status(404).json({ error: error.message });
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /food-crud/food-variants/{id}:
 *   delete:
 *     summary: Delete a food variant
 *     tags: [Nutrition & Meals]
 *     description: Deletes a specific food variant.
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: The ID of the food variant to delete.
 *     responses:
 *       200:
 *         description: Food variant deleted successfully.
 *       400:
 *         description: Food Variant ID is required.
 *       403:
 *         description: User does not have permission to delete this food variant.
 *       404:
 *         description: Food variant not found.
 */
router.delete(
  "/food-variants/:id",
  authenticate,
  async (req, res, next) => {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "Food Variant ID is required." });
    }
    try {
      await foodService.deleteFoodVariant(req.userId, id);
      res.status(200).json({ message: "Food variant deleted successfully." });
    } catch (error) {
      if (error.message.startsWith("Forbidden")) {
        return res.status(403).json({ error: error.message });
      }
      if (
        error.message === "Food variant not found." ||
        error.message === "Associated food not found."
      ) {
        return res.status(404).json({ error: error.message });
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /food-crud/{foodId}:
 *   get:
 *     summary: Get a food by ID
 *     tags: [Nutrition & Meals]
 *     description: Retrieves a specific food item by its ID.
 *     parameters:
 *       - in: path
 *         name: foodId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: The ID of the food to retrieve.
 *     responses:
 *       200:
 *         description: The requested food item.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Food'
 *       400:
 *         description: Food ID is required.
 *       403:
 *         description: User does not have permission to access this resource.
 *       404:
 *         description: Food not found.
 */
router.get(
  "/:foodId",
  authenticate,
  async (req, res, next) => {
    const { foodId } = req.params;
    if (!foodId) {
      return res.status(400).json({ error: "Food ID is required." });
    }
    try {
      const food = await foodService.getFoodById(req.userId, foodId);
      res.status(200).json(food);
    } catch (error) {
      if (error.message.startsWith("Forbidden")) {
        return res.status(403).json({ error: error.message });
      }
      if (error.message === "Food not found.") {
        return res.status(404).json({ error: error.message });
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /food-crud/{id}:
 *   put:
 *     summary: Update a food
 *     tags: [Nutrition & Meals]
 *     description: Updates an existing food item.
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: The ID of the food to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Food'
 *     responses:
 *       200:
 *         description: The updated food item.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Food'
 *       400:
 *         description: Food ID is required.
 *       403:
 *         description: User does not have permission to update this food.
 *       404:
 *         description: Food not found or not authorized to update.
 */
router.put(
  "/:id",
  authenticate,
  async (req, res, next) => {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "Food ID is required." });
    }
    try {
      const updatedFood = await foodService.updateFood(
        req.userId,
        id,
        req.body
      );
      res.status(200).json(updatedFood);
    } catch (error) {
      if (error.message.startsWith("Forbidden")) {
        return res.status(403).json({ error: error.message });
      }
      if (error.message === "Food not found or not authorized to update.") {
        return res.status(404).json({ error: error.message });
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /food-crud/{id}/deletion-impact:
 *   get:
 *     summary: Get food deletion impact
 *     tags: [Nutrition & Meals]
 *     description: Retrieves the impact of deleting a specific food item.
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: The ID of the food to check.
 *     responses:
 *       200:
 *         description: The deletion impact report.
 *       400:
 *         description: Food ID is required.
 *       403:
 *         description: User does not have permission to access this resource.
 *       404:
 *         description: Food not found.
 */
router.get(
  "/:id/deletion-impact",
  authenticate,
  async (req, res, next) => {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "Food ID is required." });
    }
    try {
      const impact = await foodService.getFoodDeletionImpact(req.userId, id);
      res.status(200).json(impact);
    } catch (error) {
      if (error.message.startsWith("Forbidden")) {
        return res.status(403).json({ error: error.message });
      }
      if (error.message === "Food not found.") {
        return res.status(404).json({ error: error.message });
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /food-crud/{id}:
 *   delete:
 *     summary: Delete a food
 *     tags: [Nutrition & Meals]
 *     description: Deletes a specific food item.
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: The ID of the food to delete.
 *       - in: query
 *         name: forceDelete
 *         schema:
 *           type: boolean
 *         description: If true, forces deletion even if there are dependencies.
 *     responses:
 *       200:
 *         description: Food deleted successfully.
 *       400:
 *         description: Food ID is required.
 *       403:
 *         description: User does not have permission to delete this food.
 *       404:
 *         description: Food not found.
 */
router.delete(
  "/:id",
  authenticate,
  async (req, res, next) => {
    const { id } = req.params;
    const { forceDelete } = req.query; // Get forceDelete from query parameters
    if (!id) {
      return res.status(400).json({ error: "Food ID is required." });
    }
    try {
      const result = await foodService.deleteFood(req.userId, id, forceDelete === "true");
      // Based on the result status, return appropriate messages and status codes
      if (result.status === "deleted") {
        res.status(200).json({ message: result.message });
      } else if (result.status === "force_deleted") {
        res.status(200).json({ message: result.message });
      } else if (result.status === "hidden") {
        res.status(200).json({ message: result.message });
      } else {
        // Fallback for unexpected status
        res.status(500).json({ error: "An unexpected error occurred during deletion." });
      }
    } catch (error) {
      if (error.message.startsWith("Forbidden")) {
        return res.status(403).json({ error: error.message });
      }
      if (error.message === "Food not found." || error.message === "Food not found or not authorized to delete.") {
        return res.status(404).json({ error: error.message });
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /food-crud/import-from-csv:
 *   post:
 *     summary: Import foods from CSV
 *     tags: [Nutrition & Meals]
 *     description: Imports a list of foods from a CSV file.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               foods:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/Food'
 *     responses:
 *       200:
 *         description: Food data imported successfully.
 *       400:
 *         description: Food data is required.
 */
router.post(
  "/import-from-csv",
  authenticate,
  async (req, res, next) => {
    const { foods } = req.body;
    if (!foods) {
      return res.status(400).json({ error: "Food data is required." });
    }
    try {
      await foodService.importFoodsInBulk(req.userId, foods);
      res.status(200).json({ message: "Food data imported successfully." });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /food-crud/needs-review:
 *   get:
 *     summary: Get foods needing review
 *     tags: [Nutrition & Meals]
 *     description: Retrieves a list of foods that need to be reviewed.
 *     responses:
 *       200:
 *         description: A list of foods needing review.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Food'
 */
router.get(
  "/needs-review",
  authenticate,
  async (req, res, next) => {
    try {
      const foodsNeedingReview = await foodService.getFoodsNeedingReview(req.userId);
      res.status(200).json(foodsNeedingReview);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /food-crud/update-snapshot:
 *   post:
 *     summary: Update food entries snapshot
 *     tags: [Nutrition & Meals]
 *     description: Updates the snapshot of food entries.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               foodId:
 *                 type: string
 *                 format: uuid
 *               variantId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: The result of the snapshot update.
 *       400:
 *         description: foodId and variantId are required.
 */
router.post(
  "/update-snapshot",
  authenticate,
  async (req, res, next) => {
    const { foodId, variantId } = req.body;
    if (!foodId || !variantId) {
      return res.status(400).json({ error: "foodId and variantId are required." });
    }
    try {
      const result = await foodService.updateFoodEntriesSnapshot(req.userId, foodId, variantId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;