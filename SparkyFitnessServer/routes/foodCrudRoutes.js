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

router.post(
  "/create-or-get",
  authenticate,
  async (req, res, next) => {
    try {
      const { foodSuggestion } = req.body;
      const food = await foodService.createOrGetFood(
        req.userId,
        foodSuggestion
      );
      res.status(200).json({ foodId: food.id });
    } catch (error) {
      if (error.message.startsWith("Forbidden")) {
        return res.status(403).json({ error: error.message });
      }
      next(error);
    }
  }
);

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