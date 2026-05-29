import express from 'express';
import { z } from 'zod/v4';
import AllergenPreferenceService from '../services/allergenPreferenceService.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { log } from '../config/logging.js';

const AddAllergenBodySchema = z.object({
  allergen_name: z.string().min(1),
});

const router = express.Router();
router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Allergen Preferences
 *   description: User allergen tracking preferences.
 */

/**
 * @swagger
 * /allergen-preferences:
 *   get:
 *     summary: Get all allergen preferences for the authenticated user
 *     tags: [Allergen Preferences]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: List of allergen preferences.
 *       401:
 *         description: Unauthorized.
 */
router.get('/', async (req, res, next) => {
  try {
    const preferences = await AllergenPreferenceService.getAllergenPreferences(
      req.userId
    );
    res.status(200).json(preferences);
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    log('error', `Error fetching allergen preferences: ${error.message}`, {
      userId: req.userId,
    });
    next(error);
  }
});

/**
 * @swagger
 * /allergen-preferences:
 *   post:
 *     summary: Add an allergen preference
 *     tags: [Allergen Preferences]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - allergen_name
 *             properties:
 *               allergen_name:
 *                 type: string
 *     responses:
 *       201:
 *         description: Allergen preference added.
 *       401:
 *         description: Unauthorized.
 */
router.post('/', async (req, res, next) => {
  try {
    const bodyResult = AddAllergenBodySchema.safeParse(req.body);
    if (!bodyResult.success) {
      res.status(400).json({ error: 'Invalid request body' });
      return;
    }
    const { allergen_name } = bodyResult.data;
    const preference = await AllergenPreferenceService.addAllergenPreference(
      req.userId,
      allergen_name.trim()
    );
    res.status(201).json(preference);
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    log('error', `Error adding allergen preference: ${error.message}`, {
      userId: req.userId,
    });
    next(error);
  }
});

/**
 * @swagger
 * /allergen-preferences/{id}:
 *   delete:
 *     summary: Remove an allergen preference
 *     tags: [Allergen Preferences]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Allergen preference removed.
 *       404:
 *         description: Not found.
 *       401:
 *         description: Unauthorized.
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const success = await AllergenPreferenceService.deleteAllergenPreference(
      req.userId,
      id
    );
    if (success) {
      res.status(200).json({ message: 'Allergen preference removed.' });
    } else {
      res.status(404).json({ message: 'Allergen preference not found.' });
    }
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    log('error', `Error deleting allergen preference: ${error.message}`, {
      userId: req.userId,
    });
    next(error);
  }
});

export default router;
