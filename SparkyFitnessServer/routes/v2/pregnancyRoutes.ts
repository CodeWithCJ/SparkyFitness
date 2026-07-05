import express, { RequestHandler } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
  CreatePregnancyBodySchema,
  UpdatePregnancyBodySchema,
  StartKickSessionBodySchema,
  UpdateKickSessionBodySchema,
  CreateContractionBodySchema,
  UpdateContractionBodySchema,
  UpsertChecklistItemBodySchema,
  CreateAppointmentBodySchema,
  UpdateAppointmentBodySchema,
  PregnancyOverviewQuerySchema,
} from '../../schemas/pregnancySchemas.js';
import pregnancyRepository from '../../models/pregnancyRepository.js';
import pregnancyService from '../../services/pregnancyService.js';
import checkInPhotoUpload, {
  getImageExtension,
  isAllowedImageBuffer,
} from '../../middleware/checkInPhotoUpload.js';
import { loadUserTimezone } from '../../utils/timezoneLoader.js';
import { todayInZone, gestationalAge } from '@workspace/shared';
import { log } from '../../config/logging.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const baseUploadsDir = process.env.SPARKY_FITNESS_UPLOADS_DIR
  ? path.resolve(process.env.SPARKY_FITNESS_UPLOADS_DIR)
  : path.join(__dirname, '..', '..', 'uploads');

const router = express.Router();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function badRequest(res: express.Response, error: unknown): void {
  res.status(400).json({
    error: 'Invalid request',
    details:
      error && typeof error === 'object' && 'flatten' in error
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (error as any).flatten().fieldErrors
        : undefined,
  });
}

// --- Pregnancy CRUD ---------------------------------------------------------

const getCurrent: RequestHandler = async (req, res, next) => {
  try {
    const pregnancy = await pregnancyRepository.getActivePregnancy(req.userId);
    res.json(pregnancy);
  } catch (error) {
    next(error);
  }
};

const createPregnancy: RequestHandler = async (req, res, next) => {
  try {
    const body = CreatePregnancyBodySchema.safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    const dueDate = pregnancyService.resolveDueDate(body.data);
    if (!dueDate) {
      res.status(400).json({
        error: 'A due date, last-period date, or conception date is required',
      });
      return;
    }
    const saved = await pregnancyRepository.createPregnancy(req.userId, {
      ...body.data,
      due_date: dueDate,
    });
    res.status(201).json(saved);
  } catch (error) {
    next(error);
  }
};

const updatePregnancy: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (typeof id !== 'string' || !UUID_RE.test(id)) {
      res.status(400).json({ error: 'Invalid pregnancy id' });
      return;
    }
    const body = UpdatePregnancyBodySchema.safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    const updated = await pregnancyRepository.updatePregnancy(
      req.userId,
      id,
      body.data
    );
    if (!updated) {
      res.status(404).json({ error: 'Pregnancy not found' });
      return;
    }
    res.json(updated);
  } catch (error) {
    next(error);
  }
};

const deletePregnancy: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (typeof id !== 'string' || !UUID_RE.test(id)) {
      res.status(400).json({ error: 'Invalid pregnancy id' });
      return;
    }
    const ok = await pregnancyRepository.deletePregnancy(req.userId, id);
    if (!ok) {
      res.status(404).json({ error: 'Pregnancy not found' });
      return;
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

const getOverview: RequestHandler = async (req, res, next) => {
  try {
    const query = PregnancyOverviewQuerySchema.safeParse(req.query);
    if (!query.success) return badRequest(res, query.error);
    const tz = await loadUserTimezone(req.userId);
    const today = todayInZone(tz);
    const overview = await pregnancyService.getOverview(
      req.userId,
      today,
      query.data.date
    );
    res.json(overview);
  } catch (error) {
    next(error);
  }
};

// --- Kicks ------------------------------------------------------------------

const startKick: RequestHandler = async (req, res, next) => {
  try {
    const body = StartKickSessionBodySchema.safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    const session = await pregnancyRepository.startKickSession(
      req.userId,
      body.data.pregnancy_id
    );
    res.status(201).json(session);
  } catch (error) {
    next(error);
  }
};

const updateKick: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (typeof id !== 'string' || !UUID_RE.test(id)) {
      res.status(400).json({ error: 'Invalid session id' });
      return;
    }
    const body = UpdateKickSessionBodySchema.safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    const updated = await pregnancyRepository.updateKickSession(
      req.userId,
      id,
      body.data
    );
    if (!updated) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json(updated);
  } catch (error) {
    next(error);
  }
};

const listKicks: RequestHandler = async (req, res, next) => {
  try {
    const sessions = await pregnancyRepository.listKickSessions(req.userId);
    res.json(sessions);
  } catch (error) {
    next(error);
  }
};

// --- Contractions -----------------------------------------------------------

const createContraction: RequestHandler = async (req, res, next) => {
  try {
    const body = CreateContractionBodySchema.safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    const saved = await pregnancyRepository.createContraction(
      req.userId,
      body.data
    );
    res.status(201).json(saved);
  } catch (error) {
    next(error);
  }
};

const updateContraction: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (typeof id !== 'string' || !UUID_RE.test(id)) {
      res.status(400).json({ error: 'Invalid contraction id' });
      return;
    }
    const body = UpdateContractionBodySchema.safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    const updated = await pregnancyRepository.updateContraction(
      req.userId,
      id,
      body.data
    );
    if (!updated) {
      res.status(404).json({ error: 'Contraction not found' });
      return;
    }
    res.json(updated);
  } catch (error) {
    next(error);
  }
};

const listContractionsHandler: RequestHandler = async (req, res, next) => {
  try {
    const analysis = await pregnancyService.getContractionAnalysis(req.userId);
    res.json(analysis);
  } catch (error) {
    next(error);
  }
};

// --- Photos -----------------------------------------------------------------

const uploadPhoto: RequestHandler = async (req, res, next) => {
  try {
    // @ts-expect-error multer attaches req.file at runtime; it ships no types.
    const file = req.file as { buffer: Buffer } | undefined;
    if (!file?.buffer || !isAllowedImageBuffer(file.buffer)) {
      res.status(400).json({ error: 'A valid image file is required' });
      return;
    }
    const pregnancyId = String(req.body.pregnancy_id ?? '');
    const week = Number(req.body.week ?? 0);
    // pregnancyId is used to build the upload path — it MUST be a UUID to
    // prevent path-traversal (e.g. "../../../etc"). Reject anything else.
    if (!UUID_RE.test(pregnancyId)) {
      res.status(400).json({ error: 'A valid pregnancy_id is required' });
      return;
    }
    const ext = getImageExtension(file.buffer) ?? 'jpg';
    const relDir = path.join('uploads', 'pregnancy', req.userId, pregnancyId);
    const fileName = `w${week}-${Date.now()}.${ext}`;
    const relPath = path.join(relDir, fileName);
    const absDir = path.join(
      baseUploadsDir,
      'pregnancy',
      req.userId,
      pregnancyId
    );
    await fs.promises.mkdir(absDir, { recursive: true });
    await fs.promises.writeFile(path.join(absDir, fileName), file.buffer);

    const saved = await pregnancyRepository.createPhoto(req.userId, {
      pregnancy_id: pregnancyId,
      week,
      file_path: relPath,
      notes: req.body.notes ?? null,
    });
    res.status(201).json(saved);
  } catch (error) {
    log('error', 'Failed to save bump photo', error);
    next(error);
  }
};

const listPhotos: RequestHandler = async (req, res, next) => {
  try {
    const pregnancyId = String(req.query.pregnancy_id ?? '');
    if (!pregnancyId) {
      res.status(400).json({ error: 'pregnancy_id is required' });
      return;
    }
    const photos = await pregnancyRepository.listPhotos(
      req.userId,
      pregnancyId
    );
    res.json(photos);
  } catch (error) {
    next(error);
  }
};

const deletePhoto: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (typeof id !== 'string' || !UUID_RE.test(id)) {
      res.status(400).json({ error: 'Invalid photo id' });
      return;
    }
    const ok = await pregnancyRepository.deletePhoto(req.userId, id);
    if (!ok) {
      res.status(404).json({ error: 'Photo not found' });
      return;
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

// --- Checklist --------------------------------------------------------------

const getChecklist: RequestHandler = async (req, res, next) => {
  try {
    const pregnancyId = String(req.query.pregnancy_id ?? '');
    if (!pregnancyId) {
      res.status(400).json({ error: 'pregnancy_id is required' });
      return;
    }
    const items = await pregnancyRepository.listChecklist(
      req.userId,
      pregnancyId
    );
    res.json(items);
  } catch (error) {
    next(error);
  }
};

const upsertChecklist: RequestHandler = async (req, res, next) => {
  try {
    const pregnancyId = String(req.body.pregnancy_id ?? '');
    if (!pregnancyId && !req.body.id) {
      res.status(400).json({ error: 'pregnancy_id is required' });
      return;
    }
    const body = UpsertChecklistItemBodySchema.safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    const saved = await pregnancyRepository.upsertChecklistItem(
      req.userId,
      pregnancyId,
      { ...body.data, id: req.body.id }
    );
    res.json(saved);
  } catch (error) {
    next(error);
  }
};

// --- Appointments -----------------------------------------------------------

const createAppointment: RequestHandler = async (req, res, next) => {
  try {
    const body = CreateAppointmentBodySchema.safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    const saved = await pregnancyRepository.createAppointment(
      req.userId,
      body.data
    );
    res.status(201).json(saved);
  } catch (error) {
    next(error);
  }
};

const updateAppointmentHandler: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (typeof id !== 'string' || !UUID_RE.test(id)) {
      res.status(400).json({ error: 'Invalid appointment id' });
      return;
    }
    const body = UpdateAppointmentBodySchema.safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    const updated = await pregnancyRepository.updateAppointment(
      req.userId,
      id,
      body.data
    );
    if (!updated) {
      res.status(404).json({ error: 'Appointment not found' });
      return;
    }
    res.json(updated);
  } catch (error) {
    next(error);
  }
};

const listAppointmentsHandler: RequestHandler = async (req, res, next) => {
  try {
    const upcoming = req.query.upcoming === 'true';
    const items = await pregnancyRepository.listAppointments(
      req.userId,
      upcoming
    );
    res.json(items);
  } catch (error) {
    next(error);
  }
};

const deleteAppointmentHandler: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (typeof id !== 'string' || !UUID_RE.test(id)) {
      res.status(400).json({ error: 'Invalid appointment id' });
      return;
    }
    const ok = await pregnancyRepository.deleteAppointment(req.userId, id);
    if (!ok) {
      res.status(404).json({ error: 'Appointment not found' });
      return;
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

void gestationalAge;

router.get('/current', getCurrent);
router.post('/', createPregnancy);
router.put('/:id', updatePregnancy);
router.delete('/:id', deletePregnancy);
router.get('/overview', getOverview);

router.post('/kicks/start', startKick);
router.put('/kicks/:id', updateKick);
router.get('/kicks', listKicks);

router.post('/contractions', createContraction);
router.put('/contractions/:id', updateContraction);
router.get('/contractions', listContractionsHandler);

router.post('/photos', checkInPhotoUpload.single('photo'), uploadPhoto);
router.get('/photos', listPhotos);
router.delete('/photos/:id', deletePhoto);

router.get('/checklist', getChecklist);
router.put('/checklist', upsertChecklist);
router.post('/checklist', upsertChecklist);

router.post('/appointments', createAppointment);
router.put('/appointments/:id', updateAppointmentHandler);
router.get('/appointments', listAppointmentsHandler);
router.delete('/appointments/:id', deleteAppointmentHandler);

export default router;
