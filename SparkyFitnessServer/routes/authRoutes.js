const express = require('express');
const router = express.Router();

/**
 * LEGACY AUTH ROUTES
 * Most routes have been migrated to the /api/identity namespace
 * or offloaded to native Better Auth handlers.
 * 
 * This router remains primarily for any legacy fallbacks or 
 * authentication-specific logic that doesn't fit in the core engine.
 */

// Better Auth's engine is mounted at /api/auth in SparkyFitnessServer.js
const authCoreRoutes = require('./auth/authCoreRoutes');

// Custom Sparky Public Discovery Routes
router.use('/', authCoreRoutes);

module.exports = router;
