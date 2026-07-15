import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import checkPermissionMiddleware from '../middleware/checkPermissionMiddleware.js';
import favoritesService from '../services/favoritesService.js';

const router = express.Router();
router.use(express.json());

// Favorites are part of the diary surface (starred foods/meals for quick logging).
// `authenticate` is applied app-wide (SparkyFitnessServer.ts) before any router
// mounts, so req.userId is already populated when this permission check runs.
// The per-route `authenticate` below is the redundant belt-and-suspenders the
// sibling diary routers (food-entries, exercise-entries, …) also carry.
router.use(checkPermissionMiddleware('diary'));

function getErrorMessage(error: unknown): string | null {
  return error instanceof Error ? error.message : null;
}

const VALID_TYPES = new Set(['food', 'meal']);

// food_id / meal_id are UUID columns; forwarding a malformed id raises a
// Postgres 22P02 that would surface as a generic 500. Reject it as a 400 here.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * @swagger
 * /favorites:
 *   get:
 *     summary: List the user's favorite (starred) foods and meals
 *     tags: [Nutrition & Meals]
 *     responses:
 *       200:
 *         description: The user's favorite foods and meals.
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const result = await favoritesService.getFavorites(req.userId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /favorites/{type}/{id}:
 *   post:
 *     summary: Star a food or meal as a favorite
 *     tags: [Nutrition & Meals]
 *   delete:
 *     summary: Remove a food or meal from favorites
 *     tags: [Nutrition & Meals]
 */
router.post('/:type/:id', authenticate, async (req, res, next) => {
  const { type, id } = req.params;
  if (!VALID_TYPES.has(type)) {
    return res.status(400).json({ error: 'Invalid favorite type.' });
  }
  if (!UUID_RE.test(id)) {
    return res.status(400).json({ error: 'Invalid favorite id.' });
  }
  try {
    const result = await favoritesService.addFavorite(req.userId, type, id);
    res.status(200).json(result);
  } catch (error) {
    const message = getErrorMessage(error);
    if (message === 'Food not found.' || message === 'Meal not found.') {
      return res.status(404).json({ error: message });
    }
    next(error);
  }
});

router.delete('/:type/:id', authenticate, async (req, res, next) => {
  const { type, id } = req.params;
  if (!VALID_TYPES.has(type)) {
    return res.status(400).json({ error: 'Invalid favorite type.' });
  }
  if (!UUID_RE.test(id)) {
    return res.status(400).json({ error: 'Invalid favorite id.' });
  }
  try {
    const result = await favoritesService.removeFavorite(req.userId, type, id);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
