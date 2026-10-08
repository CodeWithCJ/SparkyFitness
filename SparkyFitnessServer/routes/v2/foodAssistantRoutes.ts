import express from 'express';
import { z } from 'zod';
import {
  createFoodAssistantTaskSchema,
  checkpointFoodAssistantTaskSchema,
  changeFoodAssistantTaskSchema,
  editFoodAssistantPreferenceSchema,
} from '@workspace/shared';
import { authenticate } from '../../middleware/authMiddleware.js';
import * as service from '../../services/foodAssistantService.js';
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

router.get('/preferences', async (req, res, next) => {
  try {
    res.json(await service.listPreferences(req.userId));
  } catch (error) {
    next(error);
  }
});
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
      version.data
    );
    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
});
router.get('/tasks', async (req, res, next) => {
  try {
    res.json(await service.listTasks(req.userId));
  } catch (error) {
    next(error);
  }
});
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
router.get('/tasks/:id/operations', async (req, res, next) => {
  const id = uuid.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: 'Invalid task ID.' });
  try {
    res.json(await service.listOperations(req.userId, id.data));
  } catch (error) {
    next(error);
  }
});
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
