const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/authMiddleware");
const checkPermissionMiddleware = require('../middleware/checkPermissionMiddleware');
const foodEntryService = require("../services/foodEntryService");
const { log } = require("../config/logging");

router.use(express.json());

// Apply diary permission check to all food entry routes
router.use(checkPermissionMiddleware('diary'));

/**
 * @swagger
 * /food-entries:
 *   post:
 *     summary: Create a new food entry
 *     tags: [Nutrition & Meals]
 *     description: Adds a new food entry to the user's diary for a specific meal and date.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/FoodEntry'
 *     responses:
 *       201:
 *         description: The food entry was created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FoodEntry'
 *       400:
 *         description: Invalid request body.
 *       403:
 *         description: User does not have permission to create a food entry.
 */
router.post(
  "/",
  authenticate,
  checkPermissionMiddleware('diary'), // Add permission check
  async (req, res, next) => {
    try {
      // Check if creating for another user (explicitly requested)
      const targetUserId = req.body.user_id || req.userId;
      if (req.body.user_id && req.body.user_id !== req.userId) {
        const hasPermission = await require('../utils/permissionUtils').canAccessUserData(req.body.user_id, 'diary', req.originalUserId || req.userId);
        if (!hasPermission) {
          return res.status(403).json({ error: 'Forbidden: You do not have permission to manage diary for this user.' });
        }
      }
      const newEntry = await foodEntryService.createFoodEntry(targetUserId, req.originalUserId || req.userId, req.body);
      res.status(201).json(newEntry);
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
 * /food-entries/copy:
 *   post:
 *     summary: Copy food entries from one meal to another
 *     tags: [Nutrition & Meals]
 *     description: Copies all food entries from a source meal on a specific date to a target meal on another date.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sourceDate
 *               - sourceMealType
 *               - targetDate
 *               - targetMealType
 *             properties:
 *               sourceDate:
 *                 type: string
 *                 format: date
 *               sourceMealType:
 *                 type: string
 *               targetDate:
 *                 type: string
 *                 format: date
 *               targetMealType:
 *                 type: string
 *     responses:
 *       201:
 *         description: The food entries were copied successfully.
 *       400:
 *         description: Invalid request body.
 *       403:
 *         description: User does not have permission to copy food entries.
 */
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

/**
 * @swagger
 * /food-entries/copy-yesterday:
 *   post:
 *     summary: Copy food entries from yesterday's meal
 *     tags: [Nutrition & Meals]
 *     description: Copies all food entries from a specific meal on the previous day to the same meal on a target date.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - mealType
 *               - targetDate
 *             properties:
 *               mealType:
 *                 type: string
 *               targetDate:
 *                 type: string
 *                 format: date
 *     responses:
 *       201:
 *         description: The food entries were copied successfully.
 *       400:
 *         description: Invalid request body.
 *       403:
 *         description: User does not have permission to copy food entries.
 */
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

/**
 * @swagger
 * /food-entries/{id}:
 *   put:
 *     summary: Update a food entry
 *     tags: [Nutrition & Meals]
 *     description: Updates an existing food entry with new information.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the food entry to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/FoodEntry'
 *     responses:
 *       200:
 *         description: The food entry was updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FoodEntry'
 *       400:
 *         description: Invalid request body or food entry ID.
 *       403:
 *         description: User does not have permission to update this food entry.
 *       404:
 *         description: Food entry not found.
 */
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

/**
 * @swagger
 * /food-entries/{id}:
 *   delete:
 *     summary: Delete a food entry
 *     tags: [Nutrition & Meals]
 *     description: Deletes a food entry from the user's diary.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the food entry to delete.
 *     responses:
 *       200:
 *         description: The food entry was deleted successfully.
 *       400:
 *         description: Invalid food entry ID.
 *       403:
 *         description: User does not have permission to delete this food entry.
 *       404:
 *         description: Food entry not found.
 */
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

/**
 * @swagger
 * /food-entries:
 *   get:
 *     summary: Get food entries by selected date
 *     tags: [Nutrition & Meals]
 *     description: Retrieves a list of all food entries for a specific date, passed as a query parameter.
 *     parameters:
 *       - in: query
 *         name: selectedDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: The date to retrieve food entries for (YYYY-MM-DD).
 *     responses:
 *       200:
 *         description: A list of food entries for the specified date.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/FoodEntry'
 *       400:
 *         description: Selected date parameter is missing.
 *       403:
 *         description: User does not have permission to access this resource.
 */
router.get(
  "/",
  authenticate,
  checkPermissionMiddleware('diary'), // Add permission check
  async (req, res, next) => {
    let { selectedDate, userId } = req.query; // accepted userId from query
    if (!selectedDate) {
      return res.status(400).json({ error: "Selected date is required." });
    }

    // Determine target user
    const targetUserId = userId || req.userId;

    try {
      // Permission check if explicit userId is provided that differs from req.userId
      if (userId && userId !== req.userId) {
        const hasPermission = await require('../utils/permissionUtils').canAccessUserData(userId, 'diary', req.originalUserId || req.userId);
        if (!hasPermission) return res.status(403).json({ error: 'Forbidden' });
      }

      const entries = await foodEntryService.getFoodEntriesByDate(
        req.userId,
        targetUserId,
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

/**
 * @swagger
 * /food-entries/by-date/{date}:
 *   get:
 *     summary: Get all food entries for a specific date
 *     tags: [Nutrition & Meals]
 *     description: Retrieves a list of all food entries logged by the user for a given date.
 *     parameters:
 *       - in: path
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: The date to retrieve food entries for (YYYY-MM-DD).
 *     responses:
 *       200:
 *         description: A list of food entries for the specified date.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/FoodEntry'
 *       400:
 *         description: Date parameter is missing.
 *       403:
 *         description: User does not have permission to access this resource.
 */
router.get(
  "/by-date/:date",
  authenticate,
  checkPermissionMiddleware('diary'), // Add permission check
  async (req, res, next) => {
    const { date } = req.params;
    const { userId } = req.query; // check query param
    if (!date) {
      return res.status(400).json({ error: "Date is required." });
    }

    // Determine target user
    const targetUserId = userId || req.userId;

    try {
      // Permission check if accessing another user's data
      if (targetUserId !== req.userId) {
        const hasPermission = await require('../utils/permissionUtils').canAccessUserData(targetUserId, 'diary', req.originalUserId || req.userId);
        if (!hasPermission) return res.status(403).json({ error: 'Forbidden' });
      }

      const entries = await foodEntryService.getFoodEntriesByDate(
        req.userId,
        targetUserId,
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

/**
 * @swagger
 * /food-entries/range/{startDate}/{endDate}:
 *   get:
 *     summary: Get food entries within a date range
 *     tags: [Nutrition & Meals]
 *     description: Retrieves a list of all food entries logged by the user between a start and end date.
 *     parameters:
 *       - in: path
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: The start date of the range (YYYY-MM-DD).
 *       - in: path
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: The end date of the range (YYYY-MM-DD).
 *     responses:
 *       200:
 *         description: A list of food entries for the specified date range.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/FoodEntry'
 *       400:
 *         description: Start or end date parameters are missing.
 *       403:
 *         description: User does not have permission to access this resource.
 */
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

/**
 * @swagger
 * /food-entries/nutrition/today:
 *   get:
 *     summary: Get daily nutrition summary
 *     tags: [Nutrition & Meals]
 *     description: Retrieves a summary of the user's nutritional intake for a specific date.
 *     parameters:
 *       - in: query
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: The date to retrieve the nutrition summary for (YYYY-MM-DD).
 *     responses:
 *       200:
 *         description: The daily nutrition summary.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NutritionSummary'
 *       400:
 *         description: Date parameter is missing.
 *       403:
 *         description: User does not have permission to access this resource.
 *       404:
 *         description: Nutrition summary not found for this date.
 */
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