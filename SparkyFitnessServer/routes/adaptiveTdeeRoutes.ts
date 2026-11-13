import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import checkPermissionMiddleware from '../middleware/checkPermissionMiddleware.js';
import adaptiveTdeeService from '../services/AdaptiveTdeeService.js';
const router = express.Router();
/**
 * @swagger
 * /adaptive-tdee:
 *   get:
 *     summary: Get adaptive TDEE calculation
 *     tags: [Goals & Personalization]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Adaptive TDEE details.
 *       403:
 *         description: The caller has no check-in read access for this user.
 */
router.get(
  '/',
  authenticate,
  checkPermissionMiddleware('checkin'),
  async (req, res, next) => {
    try {
      const { date } = req.query;
      const dateParam = typeof date === 'string' ? date : null;
      const result = await adaptiveTdeeService.calculateAdaptiveTdee(
        req.userId,
        dateParam
      );
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
);
export default router;
