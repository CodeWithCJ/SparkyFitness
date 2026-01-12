const express = require('express');
const router = express.Router();

// Import the new modularized routes
router.use(require('./auth/authCoreRoutes'));
router.use(require('./auth/userProfileRoutes'));
router.use(require('./auth/apiKeyRoutes'));
router.use(require('./auth/familyAccessRoutes'));
router.use(require('./auth/mfaRoutes'));

module.exports = router;