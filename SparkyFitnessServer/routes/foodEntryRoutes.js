const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/authMiddleware");
const checkPermissionMiddleware = require('../middleware/checkPermissionMiddleware');
const foodEntryService = require("../services/foodEntryService");
const { log } = require("../config/logging");

router.use(express.json());

// Apply diary permission check to all food entry routes
router.use(checkPermissionMiddleware('diary'));

router.post(
  "/",
  authenticate,
  checkPermissionMiddleware('diary'), // Add permission check
  async (req, res, next) => {
    try {
      const newEntry = await foodEntryService.createFoodEntry(req.userId, req.originalUserId || req.userId, req.body);
      res.status(201).json(newEntry);
    } catch (error) {
      if (error.message.startsWith("Forbidden")) {
        return res.status(403).json({ error: error.message });
      }
      next(error);
    }
  }
);


router.post(
  "/copy",
  authenticate,
  checkPermissionMiddleware('diary'), // Add permission check
  async (req, res, next) => {
    try {
      const { sourceDate, sourceMealType, targetDate, targetMealType } =
        req.body;
      if (!sourceDate || !sourceMealType || !targetDate || !targetMealType) {
        return res.status(400).json({
          error:
            "sourceDate, sourceMealType, targetDate, and targetMealType are required.",
        });
      }
      const copiedEntries = await foodEntryService.copyFoodEntries(
        req.userId,
        req.originalUserId || req.userId,
        sourceDate,
        sourceMealType,
        targetDate,
        targetMealType
      );
      res.status(201).json(copiedEntries);
    } catch (error) {
      if (error.message.startsWith("Forbidden")) {
        return res.status(403).json({ error: error.message });
      }
      next(error);
    }
  }
);

router.post(
  "/copy-yesterday",
  authenticate,
  checkPermissionMiddleware('diary'), // Add permission check
  async (req, res, next) => {
    try {
      const { mealType, targetDate } = req.body;
      if (!mealType || !targetDate) {
        return res
          .status(400)
          .json({ error: "mealType and targetDate are required." });
      }
      const copiedEntries = await foodEntryService.copyFoodEntriesFromYesterday(
        req.userId,
        req.originalUserId || req.userId,
        mealType,
        targetDate
      );
      res.status(201).json(copiedEntries);
    } catch (error) {
      if (error.message.startsWith("Forbidden")) {
        return res.status(403).json({ error: error.message });
      }
      next(error);
    }
  }
);

router.put(
  "/:id",
  authenticate,
  checkPermissionMiddleware('diary'), // Add permission check
  async (req, res, next) => {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "Food entry ID is required." });
    }
    try {
      const updatedEntry = await foodEntryService.updateFoodEntry(
        req.userId,
        req.originalUserId || req.userId,
        id,
        req.body
      );
      res.status(200).json(updatedEntry);
    } catch (error) {
      if (error.message.startsWith("Forbidden")) {
        return res.status(403).json({ error: error.message });
      }
      if (
        error.message === "Food entry not found or not authorized to update."
      ) {
        return res.status(404).json({ error: error.message });
      }
      next(error);
    }
  }
);

router.delete(
  "/:id",
  authenticate,
  checkPermissionMiddleware('diary'), // Add permission check
  async (req, res, next) => {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "Food entry ID is required." });
    }
    try {
      await foodEntryService.deleteFoodEntry(req.userId, id, req.userId);
      res.status(200).json({ message: "Food entry deleted successfully." });
    } catch (error) {
      if (error.message.startsWith("Forbidden")) {
        return res.status(403).json({ error: error.message });
      }
      if (
        error.message === "Food entry not found or not authorized to delete."
      ) {
        return res.status(404).json({ error: error.message });
      }
      next(error);
    }
  }
);

router.get(
  "/",
  authenticate,
  checkPermissionMiddleware('diary'), // Add permission check
  async (req, res, next) => {
    const { selectedDate } = req.query;
    if (!selectedDate) {
      return res.status(400).json({ error: "Selected date is required." });
    }
    try {
      const entries = await foodEntryService.getFoodEntriesByDate(
        req.userId,
        req.userId,
        selectedDate
      );
      res.status(200).json(entries);
    } catch (error) {
      if (error.message.startsWith("Forbidden")) {
        return res.status(403).json({ error: error.message });
      }
      next(error);
    }
  }
);

router.get(
  "/by-date/:date",
  authenticate,
  checkPermissionMiddleware('diary'), // Add permission check
  async (req, res, next) => {
    const { date } = req.params;
    if (!date) {
      return res.status(400).json({ error: "Date is required." });
    }
    try {
      const entries = await foodEntryService.getFoodEntriesByDate(
        req.userId,
        req.userId,
        date
      );
      res.status(200).json(entries);
    } catch (error) {
      if (error.message.startsWith("Forbidden")) {
        return res.status(403).json({ error: error.message });
      }
      next(error);
    }
  }
);

router.get(
  "/range/:startDate/:endDate",
  authenticate,
  checkPermissionMiddleware('diary'), // Add permission check
  async (req, res, next) => {
    const { startDate, endDate } = req.params;
    if (!startDate || !endDate) {
      return res
        .status(400)
        .json({ error: "Start date and end date are required." });
    }
    try {
      const entries = await foodEntryService.getFoodEntriesByDateRange(
        req.userId,
        req.userId,
        startDate,
        endDate
      );
      res.status(200).json(entries);
    } catch (error) {
      if (error.message.startsWith("Forbidden")) {
        return res.status(403).json({ error: error.message });
      }
      next(error);
    }
  }
);

router.get(
  "/nutrition/today",
  authenticate,
  checkPermissionMiddleware('diary'), // Add permission check
  async (req, res, next) => {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ error: "Date is required." });
    }
    try {
      const summary = await foodEntryService.getDailyNutritionSummary(
        req.userId,
        date
      );
      res.status(200).json(summary);
    } catch (error) {
      if (error.message.startsWith("Forbidden")) {
        return res.status(403).json({ error: error.message });
      }
      if (error.message === "Nutrition summary not found for this date.") {
        return res.status(404).json({ error: error.message });
      }
      next(error);
    }
  }
);


module.exports = router;