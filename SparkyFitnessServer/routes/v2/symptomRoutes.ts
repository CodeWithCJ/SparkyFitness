import express, { RequestHandler } from 'express';
import { z } from 'zod/v4';
import {
  AddSymptomSeverityBodySchema,
  CreateCustomSymptomBodySchema,
  CreateSymptomEntryBodySchema,
  CreateSymptomOptionBodySchema,
  EndSymptomEpisodeBodySchema,
  ListSymptomEntriesQuerySchema,
  ListSymptomFreeDaysQuerySchema,
  ListSymptomOptionsQuerySchema,
  MarkSymptomFreeBodySchema,
  SymptomContextQuerySchema,
  UpdateCustomSymptomBodySchema,
  UpdateSymptomEntryBodySchema,
  UpdateSymptomOptionBodySchema,
} from '../../schemas/symptomSchemas.js';
import { UuidParamSchema } from '../../schemas/measurementSchemas.js';
import checkPermissionMiddleware from '../../middleware/checkPermissionMiddleware.js';
import onBehalfOfMiddleware from '../../middleware/onBehalfOfMiddleware.js';
import { demoGuard } from '../../middleware/demoGuardMiddleware.js';
import checkInPhotoUpload, {
  getImageExtension,
} from '../../middleware/checkInPhotoUpload.js';
import symptomContextService from '../../services/symptomContextService.js';
import symptomService, {
  SymptomConflictError,
  SymptomNotFoundError,
} from '../../services/symptomService.js';
import { log } from '../../config/logging.js';

const router = express.Router();

// Caregivers may manage a dependent's symptoms via the on-behalf-of header,
// gated by the 'symptoms' permission (GET resolves to the read-only variant).
router.use(onBehalfOfMiddleware);
router.use(checkPermissionMiddleware('symptoms'));

const DayParamSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
});

function badRequest(res: express.Response, error: z.core.$ZodError): void {
  res.status(400).json({
    error: 'Invalid request',
    details: z.flattenError(error).fieldErrors,
  });
}

/** Maps the service's not-found / conflict errors to HTTP; anything else goes on. */
function handleError(
  error: unknown,
  res: express.Response,
  next: express.NextFunction
): void {
  if (error instanceof SymptomNotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }
  if (error instanceof SymptomConflictError) {
    res.status(409).json({ error: error.message });
    return;
  }
  next(error);
}

// --- Symptom definitions -----------------------------------------------------

/**
 * @swagger
 * /v2/symptoms/custom:
 *   get:
 *     summary: List the user's symptom definitions (including archived)
 *     tags: [Symptoms]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Symptom definitions, pinned first.
 *   post:
 *     summary: Create a symptom definition, or update the one with the same name
 *     tags: [Symptoms]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       201:
 *         description: The definition.
 */
const listDefinitions: RequestHandler = async (req, res, next) => {
  try {
    res.json(await symptomService.listDefinitions(req.userId));
  } catch (error) {
    handleError(error, res, next);
  }
};

const createDefinition: RequestHandler = async (req, res, next) => {
  try {
    const body = CreateCustomSymptomBodySchema.safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    res
      .status(201)
      .json(await symptomService.createDefinition(req.userId, body.data));
  } catch (error) {
    handleError(error, res, next);
  }
};

const updateDefinition: RequestHandler = async (req, res, next) => {
  try {
    const params = UuidParamSchema.safeParse(req.params);
    if (!params.success) return badRequest(res, params.error);
    const body = UpdateCustomSymptomBodySchema.safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    res.json(
      await symptomService.updateDefinition(
        req.userId,
        params.data.id,
        body.data
      )
    );
  } catch (error) {
    handleError(error, res, next);
  }
};

const deleteDefinition: RequestHandler = async (req, res, next) => {
  try {
    const params = UuidParamSchema.safeParse(req.params);
    if (!params.success) return badRequest(res, params.error);
    await symptomService.deleteDefinition(req.userId, params.data.id);
    res.status(204).send();
  } catch (error) {
    handleError(error, res, next);
  }
};

// --- Options (pick-list library) ---------------------------------------------

const listOptions: RequestHandler = async (req, res, next) => {
  try {
    const query = ListSymptomOptionsQuerySchema.safeParse(req.query);
    if (!query.success) return badRequest(res, query.error);
    res.json(await symptomService.listOptions(req.userId, query.data.kind));
  } catch (error) {
    handleError(error, res, next);
  }
};

const createOption: RequestHandler = async (req, res, next) => {
  try {
    const body = CreateSymptomOptionBodySchema.safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    res
      .status(201)
      .json(await symptomService.createOption(req.userId, body.data));
  } catch (error) {
    handleError(error, res, next);
  }
};

const updateOption: RequestHandler = async (req, res, next) => {
  try {
    const params = UuidParamSchema.safeParse(req.params);
    if (!params.success) return badRequest(res, params.error);
    const body = UpdateSymptomOptionBodySchema.safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    res.json(
      await symptomService.updateOption(req.userId, params.data.id, body.data)
    );
  } catch (error) {
    handleError(error, res, next);
  }
};

const deleteOption: RequestHandler = async (req, res, next) => {
  try {
    const params = UuidParamSchema.safeParse(req.params);
    if (!params.success) return badRequest(res, params.error);
    await symptomService.deleteOption(req.userId, params.data.id);
    res.status(204).send();
  } catch (error) {
    handleError(error, res, next);
  }
};

// --- Entries -----------------------------------------------------------------

/**
 * @swagger
 * /v2/symptoms/entries:
 *   get:
 *     summary: List symptom entries with their treatments and photo ids
 *     tags: [Symptoms]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: fromDate
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: toDate
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: symptomName
 *         schema: { type: string }
 *       - in: query
 *         name: symptomId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: medicationId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: source
 *         schema: { type: string }
 *       - in: query
 *         name: episodesOnly
 *         schema: { type: boolean }
 *       - in: query
 *         name: overlapping
 *         schema: { type: boolean }
 *         description: >-
 *           Also return episodes that overlap fromDate to toDate without being
 *           logged in it, such as one that started before fromDate and was
 *           still going, read in the profile timezone. Calendars use it to
 *           mark every day an episode covers.
 *     responses:
 *       200:
 *         description: Entries, newest first.
 *   post:
 *     summary: Log a symptom (a quick log, or an episode when started_at is set)
 *     tags: [Symptoms]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       201:
 *         description: The created entry.
 */
const listEntries: RequestHandler = async (req, res, next) => {
  try {
    const query = ListSymptomEntriesQuerySchema.safeParse(req.query);
    if (!query.success) return badRequest(res, query.error);
    res.json(await symptomService.listEntries(req.userId, query.data));
  } catch (error) {
    handleError(error, res, next);
  }
};

/**
 * @swagger
 * /v2/symptoms/entries/ongoing:
 *   get:
 *     summary: List episodes that have started and not yet ended
 *     tags: [Symptoms]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Ongoing episodes, newest first.
 */
const listOngoing: RequestHandler = async (req, res, next) => {
  try {
    res.json(await symptomService.listOngoing(req.userId));
  } catch (error) {
    handleError(error, res, next);
  }
};

/**
 * @swagger
 * /v2/symptoms/entries/context:
 *   get:
 *     summary: The diary around symptom entries (food, water, steps, sleep, doses, cycle)
 *     description: >
 *       For each requested entry, returns what was logged the day before and the
 *       day of it (food names, water, steps, workouts), the sleep that ended
 *       before it began, doses taken while it ran, and the cycle day for the
 *       account owner. Read through the caller's own access, so anything a
 *       delegate may not see is returned empty.
 *     tags: [Symptoms]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: ids
 *         required: true
 *         description: Comma-separated entry ids, up to 50.
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: One context object per entry found.
 *       400:
 *         description: Missing, malformed or too many ids.
 */
const getEntryContext: RequestHandler = async (req, res, next) => {
  try {
    const query = SymptomContextQuerySchema.safeParse(req.query);
    if (!query.success) return badRequest(res, query.error);
    // Cycle data is owner-only: only the account holder acting as themselves.
    const actor = req.originalUserId || req.authenticatedUserId || req.userId;
    res.json(
      await symptomContextService.getEpisodeContext(
        req.userId,
        query.data.ids,
        {
          isOwner: actor === req.userId,
        }
      )
    );
  } catch (error) {
    handleError(error, res, next);
  }
};

const getEntry: RequestHandler = async (req, res, next) => {
  try {
    const params = UuidParamSchema.safeParse(req.params);
    if (!params.success) return badRequest(res, params.error);
    res.json(await symptomService.getEntry(req.userId, params.data.id));
  } catch (error) {
    handleError(error, res, next);
  }
};

const createEntry: RequestHandler = async (req, res, next) => {
  try {
    const body = CreateSymptomEntryBodySchema.safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    res
      .status(201)
      .json(await symptomService.createEntry(req.userId, body.data));
  } catch (error) {
    handleError(error, res, next);
  }
};

const updateEntry: RequestHandler = async (req, res, next) => {
  try {
    const params = UuidParamSchema.safeParse(req.params);
    if (!params.success) return badRequest(res, params.error);
    const body = UpdateSymptomEntryBodySchema.safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    res.json(
      await symptomService.updateEntry(req.userId, params.data.id, body.data)
    );
  } catch (error) {
    handleError(error, res, next);
  }
};

/**
 * @swagger
 * /v2/symptoms/entries/{id}/end:
 *   post:
 *     summary: End an ongoing episode (ended_at defaults to now)
 *     tags: [Symptoms]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: The ended episode.
 *       404:
 *         description: Entry not found.
 *       409:
 *         description: The episode has already ended.
 */
const endEpisode: RequestHandler = async (req, res, next) => {
  try {
    const params = UuidParamSchema.safeParse(req.params);
    if (!params.success) return badRequest(res, params.error);
    const body = EndSymptomEpisodeBodySchema.safeParse(req.body ?? {});
    if (!body.success) return badRequest(res, body.error);
    res.json(
      await symptomService.endEpisode(req.userId, params.data.id, body.data)
    );
  } catch (error) {
    handleError(error, res, next);
  }
};

/**
 * @swagger
 * /v2/symptoms/entries/{id}/severity:
 *   post:
 *     summary: Record a new severity reading on an entry's timeline
 *     tags: [Symptoms]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: The updated entry.
 */
const addSeverity: RequestHandler = async (req, res, next) => {
  try {
    const params = UuidParamSchema.safeParse(req.params);
    if (!params.success) return badRequest(res, params.error);
    const body = AddSymptomSeverityBodySchema.safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    res.json(
      await symptomService.addSeverity(req.userId, params.data.id, body.data)
    );
  } catch (error) {
    handleError(error, res, next);
  }
};

const deleteEntry: RequestHandler = async (req, res, next) => {
  try {
    const params = UuidParamSchema.safeParse(req.params);
    if (!params.success) return badRequest(res, params.error);
    await symptomService.deleteEntry(req.userId, params.data.id);
    res.status(204).send();
  } catch (error) {
    handleError(error, res, next);
  }
};

// --- Symptom-free days -------------------------------------------------------

/**
 * @swagger
 * /v2/symptoms/symptom-free:
 *   get:
 *     summary: List days the user explicitly marked as symptom-free
 *     tags: [Symptoms]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Symptom-free days, newest first.
 *   post:
 *     summary: Mark a day (default today) as symptom-free
 *     tags: [Symptoms]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       201:
 *         description: The marker.
 */
const listSymptomFree: RequestHandler = async (req, res, next) => {
  try {
    const query = ListSymptomFreeDaysQuerySchema.safeParse(req.query);
    if (!query.success) return badRequest(res, query.error);
    res.json(await symptomService.listSymptomFree(req.userId, query.data));
  } catch (error) {
    handleError(error, res, next);
  }
};

const markSymptomFree: RequestHandler = async (req, res, next) => {
  try {
    const body = MarkSymptomFreeBodySchema.safeParse(req.body ?? {});
    if (!body.success) return badRequest(res, body.error);
    res
      .status(201)
      .json(
        await symptomService.markSymptomFree(req.userId, body.data.entry_date)
      );
  } catch (error) {
    handleError(error, res, next);
  }
};

const unmarkSymptomFree: RequestHandler = async (req, res, next) => {
  try {
    const params = DayParamSchema.safeParse(req.params);
    if (!params.success) return badRequest(res, params.error);
    await symptomService.unmarkSymptomFree(req.userId, params.data.date);
    res.status(204).send();
  } catch (error) {
    handleError(error, res, next);
  }
};

// --- Photos ------------------------------------------------------------------

/**
 * @swagger
 * /v2/symptoms/entries/{id}/photos:
 *   post:
 *     summary: Attach a photo (jpeg, png, gif or webp, up to 10 MB) to an entry
 *     tags: [Symptoms]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               photo: { type: string, format: binary }
 *               caption: { type: string }
 *     responses:
 *       201:
 *         description: The stored photo (id, entry id, caption).
 */
const uploadPhoto: RequestHandler = async (req, res, next) => {
  try {
    const params = UuidParamSchema.safeParse(req.params);
    if (!params.success) return badRequest(res, params.error);
    // multer attaches req.file at runtime; it ships no types.
    const file = (req as unknown as { file?: { buffer: Buffer } }).file;
    if (!file) {
      res.status(400).json({ error: 'No photo file provided' });
      return;
    }
    // The multer filter only trusts the spoofable filename / mime type; the
    // stored extension comes from the real bytes.
    const extension = getImageExtension(file.buffer);
    if (!extension) {
      res.status(400).json({
        error: 'Uploaded file is not a valid image (jpeg, png, gif, webp)',
      });
      return;
    }
    const caption =
      typeof req.body?.caption === 'string' && req.body.caption.trim()
        ? req.body.caption.trim().slice(0, 200)
        : null;
    const photo = await symptomService.addPhoto(
      req.userId,
      params.data.id,
      extension,
      file.buffer,
      caption
    );
    res.status(201).json(photo);
  } catch (error) {
    handleError(error, res, next);
  }
};

/**
 * @swagger
 * /v2/symptoms/photos/file/{id}:
 *   get:
 *     summary: Serve a symptom photo (authenticated, owner and permitted family only)
 *     tags: [Symptoms]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: The image file.
 *       404:
 *         description: Photo not found or not accessible.
 */
const getPhotoFile: RequestHandler = async (req, res, next) => {
  try {
    const params = UuidParamSchema.safeParse(req.params);
    if (!params.success) return badRequest(res, params.error);
    const absolutePath = await symptomService.getPhotoFile(
      req.userId,
      params.data.id
    );
    if (!absolutePath) {
      res.status(404).json({ error: 'Photo not found' });
      return;
    }
    // Stored uploads are user-supplied; stop the browser from MIME-sniffing.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(absolutePath, (err) => {
      if (err) {
        log('error', 'Failed to stream symptom photo', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to serve symptom photo' });
        }
      }
    });
  } catch (error) {
    handleError(error, res, next);
  }
};

const deletePhoto: RequestHandler = async (req, res, next) => {
  try {
    const params = UuidParamSchema.safeParse(req.params);
    if (!params.success) return badRequest(res, params.error);
    await symptomService.deletePhoto(req.userId, params.data.id);
    res.status(204).send();
  } catch (error) {
    handleError(error, res, next);
  }
};

router.get('/custom', listDefinitions);
router.post('/custom', createDefinition);
router.put('/custom/:id', updateDefinition);
router.delete('/custom/:id', deleteDefinition);

router.get('/options', listOptions);
router.post('/options', createOption);
router.put('/options/:id', updateOption);
router.delete('/options/:id', deleteOption);

// Registered before /entries/:id so "ongoing" is not read as an id.
router.get('/entries/ongoing', listOngoing);
router.get('/entries/context', getEntryContext);
router.get('/entries', listEntries);
router.post('/entries', createEntry);
router.get('/entries/:id', getEntry);
router.put('/entries/:id', updateEntry);
router.delete('/entries/:id', deleteEntry);
router.post('/entries/:id/end', endEpisode);
router.post('/entries/:id/severity', addSeverity);
router.post(
  '/entries/:id/photos',
  demoGuard,
  checkInPhotoUpload.single('photo'),
  uploadPhoto
);

router.get('/photos/file/:id', getPhotoFile);
router.delete('/photos/:id', demoGuard, deletePhoto);

router.get('/symptom-free', listSymptomFree);
router.post('/symptom-free', markSymptomFree);
router.delete('/symptom-free/:date', unmarkSymptomFree);

export default router;
