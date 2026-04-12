import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import preferenceService from '../services/preferenceService.js';
const router = express.Router();
// Endpoint to bootstrap timezone from the device only if unset
router.post('/bootstrap-timezone', authenticate, async (req, res, next) => {
  const { timezone } = req.body;
  try {
    const preferences = await preferenceService.bootstrapUserTimezone(
      req.userId,

      req.userId,
      timezone
    );
    res.status(200).json(preferences);
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    if (error.status === 400) {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      return res.status(400).json({ error: error.message });
    }
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    if (error.message.startsWith('Forbidden')) {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      return res.status(403).json({ error: error.message });
    }
    if (
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      error.message ===
      'User preferences not found or not authorized to update.'
    ) {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});
// Endpoint to update user preferences
/**
 * @swagger
 * /preferences:
 *   put:
 *     summary: Update user preferences
 *     tags: [Goals & Personalization]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserPreferences'
 *     responses:
 *       200:
 *         description: Preferences updated successfully.
 */
router.put('/', authenticate, async (req, res, next) => {
  const preferenceData = req.body;
  try {
    const updatedPreferences = await preferenceService.updateUserPreferences(
      req.userId,

      req.userId,
      preferenceData
    );
    res.status(200).json(updatedPreferences);
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    if (error.status === 400) {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      return res.status(400).json({ error: error.message });
    }
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    if (error.message.startsWith('Forbidden')) {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      return res.status(403).json({ error: error.message });
    }
    if (
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      error.message ===
      'User preferences not found or not authorized to update.'
    ) {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});
// Endpoint to delete user preferences
/**
 * @swagger
 * /preferences:
 *   delete:
 *     summary: Delete user preferences
 *     tags: [Goals & Personalization]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Preferences deleted successfully.
 */
router.delete('/', authenticate, async (req, res, next) => {
  try {
    const result = await preferenceService.deleteUserPreferences(
      req.userId,

      req.userId
    );
    res.status(200).json(result);
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    if (error.message.startsWith('Forbidden')) {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      return res.status(403).json({ error: error.message });
    }
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    if (error.message === 'User preferences not found.') {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});
// Endpoint to fetch user preferences
/**
 * @swagger
 * /preferences:
 *   get:
 *     summary: Get user preferences
 *     tags: [Goals & Personalization]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: User preferences.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserPreferences'
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const preferences = await preferenceService.getUserPreferences(
      req.userId,

      req.userId
    );
    res.status(200).json(preferences);
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    if (error.message.startsWith('Forbidden')) {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      return res.status(403).json({ error: error.message });
    }
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    if (error.message === 'User preferences not found.') {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});
// Endpoint to upsert user preferences
/**
 * @swagger
 * /preferences:
 *   post:
 *     summary: Upsert user preferences
 *     tags: [Goals & Personalization]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserPreferences'
 *     responses:
 *       200:
 *         description: Preferences upserted successfully.
 */
router.post('/', authenticate, async (req, res, next) => {
  const preferenceData = req.body;
  try {
    const newPreferences = await preferenceService.upsertUserPreferences(
      req.userId,
      preferenceData
    );
    res.status(200).json(newPreferences);
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    if (error.status === 400) {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      return res.status(400).json({ error: error.message });
    }
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    if (error.message.startsWith('Forbidden')) {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});
export default router;
