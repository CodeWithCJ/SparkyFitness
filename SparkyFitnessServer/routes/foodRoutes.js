const express = require("express");
const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Food & Nutrition
 *     description: Endpoints for managing food data, logging food entries, and tracking nutritional information.
 */

const foodIntegrationRoutes = require("./foodIntegrationRoutes");
const foodCrudRoutes = require("./foodCrudRoutes");
const foodEntryRoutes = require("./foodEntryRoutes");

// Mount the new routers
router.use("/", foodIntegrationRoutes);
router.use("/", foodCrudRoutes);

// Re-route requests from /foods/food-entries/:date to /food-entries/by-date/:date.
// The documentation for this endpoint is located in foodEntryRoutes.js.
router.get('/food-entries/:date', (req, res, next) => {
    req.url = `/by-date/${req.params.date}`; // Modify URL to match foodEntryRoutes expectation
    foodEntryRoutes(req, res, next);
});

module.exports = router;
