import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
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
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { date } = req.query;
    const result = await adaptiveTdeeService.calculateAdaptiveTdee(
      req.userId,
      date
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});
export default router;
