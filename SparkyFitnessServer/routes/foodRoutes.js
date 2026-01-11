const express = require("express");
const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Foods
 *   description: Food management and retrieval
 */

const foodIntegrationRoutes = require("./foodIntegrationRoutes");
const foodCrudRoutes = require("./foodCrudRoutes");
const foodEntryRoutes = require("./foodEntryRoutes");

// Mount the new routers
router.use("/", foodIntegrationRoutes);
router.use("/", foodCrudRoutes);

// Re-route requests from /foods/food-entries/:date to /food-entries/by-date/:date
/**
 * @swagger
 * /foods/food-entries/{date}:
 *   get:
 *     summary: Get food entries by date
 *     tags: [Foods]
 *     parameters:
 *       - in: path
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         required: true
 *         description: The date to retrieve entries for (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: List of food entries
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     format: uuid
 *                   name:
 *                     type: string
 *                   calories:
 *                     type: number
 */
router.get('/food-entries/:date', (req, res, next) => {
    req.url = `/by-date/${req.params.date}`; // Modify URL to match foodEntryRoutes expectation
    foodEntryRoutes(req, res, next);
});

module.exports = router;
