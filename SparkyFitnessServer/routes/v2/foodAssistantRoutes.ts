import express from 'express';
import { z } from 'zod';
import {
  createFoodAssistantTaskSchema,
  checkpointFoodAssistantTaskSchema,
  changeFoodAssistantTaskSchema,
  editFoodAssistantPreferenceSchema,
  publishFoodAssistantRecipeSchema,
  importFoodAssistantProviderFoodSchema,
  undoFoodAssistantRecipeSchema,
} from '@workspace/shared';
import { authenticate } from '../../middleware/authMiddleware.js';
import * as service from '../../services/foodAssistantService.js';
import * as recipeService from '../../services/foodAssistantRecipeService.js';
import { FoodAssistantConflict } from '../../models/foodAssistantRepository.js';

const router = express.Router();
router.use(authenticate);
// Private assistant state belongs to the signed-in actor, including while
// viewing a family member's diary. It is never delegated via diary_read.
router.use((req, _res, next) => {
  req.userId = req.authenticatedUserId || req.userId;
  next();
});
const uuid = z.string().uuid();

/**
 * @swagger
 * /v2/food-assistant/recipes/{id}:
 *   get:
 *     summary: Run a versioned food assistant action
 *     description: Private state is scoped to the signed-in actor. Mutations require the current version and a stable operation ID where specified by the shared request contract.
 *     tags: [AI & Insights]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '200':
 *         description: Persisted result or requested owner-scoped state
 *       '400':
 *         description: Invalid request
 *       '401':
 *         description: Authentication required
 *       '404':
 *         description: Item is not accessible
 *       '409':
 *         description: Stale version, conflicting retry, or action requiring confirmation
 */
router.get('/recipes/:id', async (req, res, next) => {
  const id = uuid.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: 'Invalid recipe ID.' });
  try {
    res.json(await recipeService.getRecipe(req.userId, id.data));
  } catch (error) {
    next(error);
  }
});
/**
 * @swagger
 * /v2/food-assistant/recipes/draft:
 *   post:
 *     summary: Run a versioned food assistant action
 *     description: Private state is scoped to the signed-in actor. Mutations require the current version and a stable operation ID where specified by the shared request contract.
 *     tags: [AI & Insights]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       '200':
 *         description: Persisted result or requested owner-scoped state
 *       '400':
 *         description: Invalid request
 *       '401':
 *         description: Authentication required
 *       '404':
 *         description: Item is not accessible
 *       '409':
 *         description: Stale version, conflicting retry, or action requiring confirmation
 */
router.post('/recipes/draft', async (req, res, next) => {
  const data = z
    .object({ meal_id: uuid, request_id: uuid })
    .strict()
    .safeParse(req.body);
  if (!data.success)
    return res.status(400).json({ error: 'Invalid recipe draft request.' });
  try {
    res.json(
      await recipeService.draftFromRecipe(
        req.userId,
        data.data.meal_id,
        data.data.request_id
      )
    );
  } catch (error) {
    next(error);
  }
});
/**
 * @swagger
 * /v2/food-assistant/tasks/{id}/recipe-preview:
 *   get:
 *     summary: Run a versioned food assistant action
 *     description: Private state is scoped to the signed-in actor. Mutations require the current version and a stable operation ID where specified by the shared request contract.
 *     tags: [AI & Insights]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '200':
 *         description: Persisted result or requested owner-scoped state
 *       '400':
 *         description: Invalid request
 *       '401':
 *         description: Authentication required
 *       '404':
 *         description: Item is not accessible
 *       '409':
 *         description: Stale version, conflicting retry, or action requiring confirmation
 */
router.get('/tasks/:id/recipe-preview', async (req, res, next) => {
  const id = uuid.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: 'Invalid task ID.' });
  try {
    res.json(await recipeService.previewRecipe(req.userId, id.data));
  } catch (error) {
    next(error);
  }
});
/**
 * @swagger
 * /v2/food-assistant/recipes/publish/{id}:
 *   post:
 *     summary: Run a versioned food assistant action
 *     description: Private state is scoped to the signed-in actor. Mutations require the current version and a stable operation ID where specified by the shared request contract.
 *     tags: [AI & Insights]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       '200':
 *         description: Persisted result or requested owner-scoped state
 *       '400':
 *         description: Invalid request
 *       '401':
 *         description: Authentication required
 *       '404':
 *         description: Item is not accessible
 *       '409':
 *         description: Stale version, conflicting retry, or action requiring confirmation
 */
router.post('/recipes/publish/:id', async (req, res, next) => {
  const id = uuid.safeParse(req.params.id);
  const data = publishFoodAssistantRecipeSchema.safeParse(req.body);
  if (!id.success || !data.success)
    return res
      .status(400)
      .json({ error: 'Invalid recipe publication request.' });
  try {
    res.json(
      await recipeService.publishRecipe(
        req.userId,
        id.data,
        data.data,
        data.data.estimate_source_quote
      )
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/food-assistant/recipes/import-ingredient/{id}:
 *   post:
 *     summary: Run a versioned food assistant action
 *     description: Private state is scoped to the signed-in actor. Mutations require the current version and a stable operation ID where specified by the shared request contract.
 *     tags: [AI & Insights]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       '200':
 *         description: Persisted result or requested owner-scoped state
 *       '400':
 *         description: Invalid request
 *       '401':
 *         description: Authentication required
 *       '404':
 *         description: Item is not accessible
 *       '409':
 *         description: Stale version, conflicting retry, or action requiring confirmation
 */
router.post('/recipes/import-ingredient/:id', async (req, res, next) => {
  const id = uuid.safeParse(req.params.id);
  const data = importFoodAssistantProviderFoodSchema.safeParse(req.body);
  if (!id.success || !data.success)
    return res.status(400).json({ error: 'Invalid ingredient import.' });
  try {
    res.json(
      await recipeService.importProviderIngredient(
        req.userId,
        id.data,
        data.data
      )
    );
  } catch (error) {
    next(error);
  }
});
/**
 * @swagger
 * /v2/food-assistant/recipes/undo/{id}:
 *   post:
 *     summary: Run a versioned food assistant action
 *     description: Private state is scoped to the signed-in actor. Mutations require the current version and a stable operation ID where specified by the shared request contract.
 *     tags: [AI & Insights]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       '200':
 *         description: Persisted result or requested owner-scoped state
 *       '400':
 *         description: Invalid request
 *       '401':
 *         description: Authentication required
 *       '404':
 *         description: Item is not accessible
 *       '409':
 *         description: Stale version, conflicting retry, or action requiring confirmation
 */
router.post('/recipes/undo/:id', async (req, res, next) => {
  const id = uuid.safeParse(req.params.id);
  const data = undoFoodAssistantRecipeSchema.safeParse(req.body);
  if (!id.success || !data.success)
    return res.status(400).json({ error: 'Invalid recipe undo.' });
  try {
    res.json(
      await recipeService.undoRecipe(
        req.userId,
        id.data,
        data.data,
        data.data.source_quote
      )
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/food-assistant/preferences:
 *   get:
 *     summary: List lasting food preferences
 *     description: Private state is scoped to the signed-in actor. Mutations require the current version and a stable operation ID where specified by the shared request contract.
 *     tags: [AI & Insights]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       '200':
 *         description: Persisted result or requested owner-scoped state
 *       '400':
 *         description: Invalid request
 *       '401':
 *         description: Authentication required
 *       '404':
 *         description: Item is not accessible
 *       '409':
 *         description: Stale version, conflicting retry, or action requiring confirmation
 */
router.get('/preferences', async (req, res, next) => {
  try {
    res.json(await service.listPreferences(req.userId));
  } catch (error) {
    next(error);
  }
});
/**
 * @swagger
 * /v2/food-assistant/preferences:
 *   put:
 *     summary: Save a lasting preference from settings
 *     description: Private state is scoped to the signed-in actor. Mutations require the current version and a stable operation ID where specified by the shared request contract.
 *     tags: [AI & Insights]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [key, value, expected_version]
 *             properties:
 *               key:
 *                 type: string
 *               value:
 *                 type: string
 *               expected_version:
 *                 type: integer
 *     responses:
 *       '200':
 *         description: Persisted result or requested owner-scoped state
 *       '400':
 *         description: Invalid request
 *       '401':
 *         description: Authentication required
 *       '404':
 *         description: Item is not accessible
 *       '409':
 *         description: Stale version, conflicting retry, or action requiring confirmation
 */
router.put('/preferences', async (req, res, next) => {
  const parsed = editFoodAssistantPreferenceSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: 'Invalid preference.' });
  try {
    res.json(
      await service.rememberPreference(
        req.userId,
        { ...parsed.data, source_quote: 'Edited in settings' },
        undefined,
        true
      )
    );
  } catch (error) {
    next(error);
  }
});
/**
 * @swagger
 * /v2/food-assistant/preferences/{key}:
 *   delete:
 *     summary: Delete a versioned preference from settings
 *     description: Private state is scoped to the signed-in actor. Mutations require the current version and a stable operation ID where specified by the shared request contract.
 *     tags: [AI & Insights]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - name: key
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: version
 *         in: query
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *     responses:
 *       '204':
 *         description: Persisted result or requested owner-scoped state
 *       '400':
 *         description: Invalid request
 *       '401':
 *         description: Authentication required
 *       '404':
 *         description: Item is not accessible
 *       '409':
 *         description: Stale version, conflicting retry, or action requiring confirmation
 */
router.delete('/preferences/:key', async (req, res, next) => {
  const version = z.coerce
    .number()
    .int()
    .positive()
    .safeParse(req.query.version);
  if (!version.success)
    return res.status(400).json({ error: 'A positive version is required.' });
  try {
    await service.forgetPreference(
      req.userId,
      String(req.params.key),
      version.data,
      undefined,
      undefined,
      true
    );
    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
});
/**
 * @swagger
 * /v2/food-assistant/tasks:
 *   get:
 *     summary: List recoverable food tasks
 *     description: Private state is scoped to the signed-in actor. Mutations require the current version and a stable operation ID where specified by the shared request contract.
 *     tags: [AI & Insights]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       '200':
 *         description: Persisted result or requested owner-scoped state
 *       '400':
 *         description: Invalid request
 *       '401':
 *         description: Authentication required
 *       '404':
 *         description: Item is not accessible
 *       '409':
 *         description: Stale version, conflicting retry, or action requiring confirmation
 */
router.get('/tasks', async (req, res, next) => {
  try {
    res.json(await service.listTasks(req.userId));
  } catch (error) {
    next(error);
  }
});
/**
 * @swagger
 * /v2/food-assistant/tasks:
 *   post:
 *     summary: Create a recoverable food task
 *     description: Private state is scoped to the signed-in actor. Mutations require the current version and a stable operation ID where specified by the shared request contract.
 *     tags: [AI & Insights]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [id, kind, title, checkpoint]
 *             properties:
 *               id:
 *                 type: string
 *                 format: uuid
 *               kind:
 *                 type: string
 *               title:
 *                 type: string
 *               checkpoint:
 *                 type: object
 *                 description: FoodAssistantCheckpoint from the shared API contract; includes summary and retained ingredient/evidence rows.
 *     responses:
 *       '201':
 *         description: Persisted result or requested owner-scoped state
 *       '400':
 *         description: Invalid request
 *       '401':
 *         description: Authentication required
 *       '404':
 *         description: Item is not accessible
 *       '409':
 *         description: Stale version, conflicting retry, or action requiring confirmation
 */
router.post('/tasks', async (req, res, next) => {
  const parsed = createFoodAssistantTaskSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: 'Invalid task draft.' });
  try {
    res.status(201).json(await service.createTask(req.userId, parsed.data));
  } catch (error) {
    next(error);
  }
});
/**
 * @swagger
 * /v2/food-assistant/tasks/{id}:
 *   get:
 *     summary: Read an owner-scoped task
 *     description: Private state is scoped to the signed-in actor. Mutations require the current version and a stable operation ID where specified by the shared request contract.
 *     tags: [AI & Insights]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '200':
 *         description: Persisted result or requested owner-scoped state
 *       '400':
 *         description: Invalid request
 *       '401':
 *         description: Authentication required
 *       '404':
 *         description: Item is not accessible
 *       '409':
 *         description: Stale version, conflicting retry, or action requiring confirmation
 */
router.get('/tasks/:id', async (req, res, next) => {
  const id = uuid.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: 'Invalid task ID.' });
  try {
    const task = await service.getTask(req.userId, id.data);
    if (!task) return res.status(404).json({ error: 'Task not found.' });
    res.json(task);
  } catch (error) {
    next(error);
  }
});
/**
 * @swagger
 * /v2/food-assistant/tasks/{id}/operations:
 *   get:
 *     summary: Read committed task operations
 *     description: Private state is scoped to the signed-in actor. Mutations require the current version and a stable operation ID where specified by the shared request contract.
 *     tags: [AI & Insights]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '200':
 *         description: Persisted result or requested owner-scoped state
 *       '400':
 *         description: Invalid request
 *       '401':
 *         description: Authentication required
 *       '404':
 *         description: Item is not accessible
 *       '409':
 *         description: Stale version, conflicting retry, or action requiring confirmation
 */
router.get('/tasks/:id/operations', async (req, res, next) => {
  const id = uuid.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: 'Invalid task ID.' });
  try {
    res.json(await service.listOperations(req.userId, id.data));
  } catch (error) {
    next(error);
  }
});
/**
 * @swagger
 * /v2/food-assistant/tasks/{id}:
 *   patch:
 *     summary: Checkpoint unfinished food work
 *     description: Private state is scoped to the signed-in actor. Mutations require the current version and a stable operation ID where specified by the shared request contract.
 *     tags: [AI & Insights]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [operation_id, expected_version, status, checkpoint]
 *             properties:
 *               operation_id:
 *                 type: string
 *                 format: uuid
 *               expected_version:
 *                 type: integer
 *               status:
 *                 type: string
 *               checkpoint:
 *                 type: object
 *                 description: FoodAssistantCheckpoint from the shared API contract; includes summary and retained ingredient/evidence rows.
 *     responses:
 *       '200':
 *         description: Persisted result or requested owner-scoped state
 *       '400':
 *         description: Invalid request
 *       '401':
 *         description: Authentication required
 *       '404':
 *         description: Item is not accessible
 *       '409':
 *         description: Stale version, conflicting retry, or action requiring confirmation
 */
router.patch('/tasks/:id', async (req, res, next) => {
  const id = uuid.safeParse(req.params.id);
  const data = checkpointFoodAssistantTaskSchema.safeParse(req.body);
  if (!id.success || !data.success)
    return res.status(400).json({ error: 'Invalid checkpoint.' });
  try {
    res.json(await service.checkpointTask(req.userId, id.data, data.data));
  } catch (error) {
    next(error);
  }
});
/**
 * @swagger
 * /v2/food-assistant/tasks/{id}/{action}:
 *   post:
 *     summary: Cancel or explicitly resume a task
 *     description: Private state is scoped to the signed-in actor. Mutations require the current version and a stable operation ID where specified by the shared request contract.
 *     tags: [AI & Insights]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - name: action
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           enum: [cancel, resume]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [operation_id, expected_version]
 *             properties:
 *               operation_id:
 *                 type: string
 *                 format: uuid
 *               expected_version:
 *                 type: integer
 *     responses:
 *       '200':
 *         description: Persisted result or requested owner-scoped state
 *       '400':
 *         description: Invalid request
 *       '401':
 *         description: Authentication required
 *       '404':
 *         description: Item is not accessible
 *       '409':
 *         description: Stale version, conflicting retry, or action requiring confirmation
 */
router.post('/tasks/:id/:action', async (req, res, next) => {
  const id = uuid.safeParse(req.params.id);
  const action = z.enum(['cancel', 'resume']).safeParse(req.params.action);
  const data = changeFoodAssistantTaskSchema.safeParse(req.body);
  if (!id.success || !action.success || !data.success)
    return res.status(400).json({ error: 'Invalid task action.' });
  try {
    res.json(
      await service.changeTask(req.userId, id.data, action.data, data.data)
    );
  } catch (error) {
    next(error);
  }
});
router.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    if (error instanceof FoodAssistantConflict)
      return res.status(409).json({ error: error.message });
    next(error);
  }
);
export default router;
