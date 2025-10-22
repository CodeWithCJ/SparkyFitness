const express = require("express");
const router = express.Router();
const foodIntegrationRoutes = require("./foodIntegrationRoutes");
const foodCrudRoutes = require("./foodCrudRoutes");
const foodEntryRoutes = require("./foodEntryRoutes");

// Mount the new routers
router.use("/food-entries", foodEntryRoutes);
router.use("/", foodIntegrationRoutes);
router.use("/", foodCrudRoutes);

module.exports = router;
