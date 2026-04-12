import express from 'express';
import userProfileRoutes from './auth/userProfileRoutes.js';
import familyAccessRoutes from './auth/familyAccessRoutes.js';
import apiKeyRoutes from './auth/apiKeyRoutes.js';
const router = express.Router();
// Sparky Identity Namespace (/api/identity)
router.use('/', familyAccessRoutes);
router.use('/', userProfileRoutes);
router.use('/', apiKeyRoutes);
export default router;
