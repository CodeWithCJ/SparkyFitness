import express from 'express';
import authCoreRoutes from './auth/authCoreRoutes.js';
const router = express.Router();
// Custom Sparky Public Discovery Routes
router.use('/', authCoreRoutes);
export default router;
