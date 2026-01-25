const express = require("express");
const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Nutrition & Meals
 *   description: Food database, meal planning, meal types, and nutritional tracking.
 */

const foodIntegrationRoutes = require("./foodIntegrationRoutes");
const foodCrudRoutes = require("./foodCrudRoutes");
const foodEntryRoutes = require("./foodEntryRoutes");

// Mount the new routers
router.use("/", foodIntegrationRoutes);
router.use("/", foodCrudRoutes);

/**
 * @swagger
 * /food-entries/{date}:
 *   get:
 *     summary: Get food entries by date (re-routed)
 *     tags: [Nutrition & Meals]
 *     description: This endpoint re-routes requests to the foodEntryRoutes for retrieving food entries by date.
 *     parameters:
 *       - in: path
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         required: true
 *         description: The date to retrieve food entries for (YYYY-MM-DD).
 *     responses:
 *       200:
 *         description: A list of food entries for the specified date.
 *       400:
 *         description: Invalid date parameter.
 */
router.get('/food-entries/:date', (req, res, next) => {
    req.url = `/by-date/${req.params.date}`; // Modify URL to match foodEntryRoutes expectation
    foodEntryRoutes(req, res, next);
});

module.exports = router;
