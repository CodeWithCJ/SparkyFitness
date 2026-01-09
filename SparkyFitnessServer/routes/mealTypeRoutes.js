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
// const { authenticate } = require("../middleware/authMiddleware");

// router.use(authenticate);

/**
 * GET /
 * Retrieve all meal types available to the user (System Defaults + Custom)
 */
router.get("/", async (req, res) => {
  try {
    const userId = req.user.id;
    const mealTypes = await getAllMealTypes(userId);
    res.status(200).json(mealTypes);
  } catch (error) {
    log("error", "Route GET /meal-types error:", error);
    res.status(500).json({ error: "Failed to fetch meal types" });
  }
});

/**
 * GET /:id
 * Retrieve a single meal type by ID
 */
router.get("/:id", async (req, res) => {
  try {
    const userId = req.user.id;
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
 * POST /
 * Create a new custom meal type
 * Body: { name: "Pre-Workout", sort_order: 15 }
 */
router.post("/", async (req, res) => {
  try {
    const userId = req.user.id;
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

    // Handle duplicate name error friendly
    if (error.message.includes("already exists")) {
      return res.status(409).json({ error: error.message });
    }

    res.status(500).json({ error: "Failed to create meal type" });
  }
});

/**
 * PUT /:id
 * Update a meal type (Name or Sort Order)
 * Body: { name: "New Name", sort_order: 25 }
 */
router.put("/:id", async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { name, sort_order } = req.body;

    const updatedMealType = await updateMealType(
      id,
      { name, sort_order },
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
 * DELETE /:id
 * Delete a custom meal type
 */
router.delete("/:id", async (req, res) => {
  try {
    const userId = req.user.id;
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
