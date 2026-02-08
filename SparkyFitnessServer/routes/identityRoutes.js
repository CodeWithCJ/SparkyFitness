const express = require('express');
const router = express.Router();
const authCoreRoutes = require('./auth/authCoreRoutes');
const userProfileRoutes = require('./auth/userProfileRoutes');
const familyAccessRoutes = require('./auth/familyAccessRoutes');
const apiKeyRoutes = require('./auth/apiKeyRoutes');

// Sparky Identity Namespace (/api/identity)
router.use('/', familyAccessRoutes);
router.use('/', userProfileRoutes);
router.use('/', apiKeyRoutes);

module.exports = router;
