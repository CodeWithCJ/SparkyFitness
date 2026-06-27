import express, { RequestHandler } from 'express';
import {
  CreateCustomSymptomBodySchema,
  CreateCustomLocationBodySchema,
  CreateSymptomEntryBodySchema,
  ListSymptomEntriesQuerySchema,
} from '../../schemas/symptomSchemas.js';
import { UuidParamSchema } from '../../schemas/measurementSchemas.js';
import checkPermissionMiddleware from '../../middleware/checkPermissionMiddleware.js';
import onBehalfOfMiddleware from '../../middleware/onBehalfOfMiddleware.js';
import symptomRepository from '../../models/symptomRepository.js';
import { loadUserTimezone } from '../../utils/timezoneLoader.js';
import { todayInZone } from '@workspace/shared';

const router = express.Router();

// Caregivers may manage a dependent's diary via the on-behalf-of header,
// gated by the 'diary' permission.
router.use(onBehalfOfMiddleware);
router.use(checkPermissionMiddleware('diary'));

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

// --- Custom Symptoms --------------------------------------------------------

const listCustomSymptoms: RequestHandler = async (req, res, next) => {
  try {
    const list = await symptomRepository.listCustomSymptoms(req.userId);
    res.json(list);
  } catch (error) {
    next(error);
  }
};

const createCustomSymptom: RequestHandler = async (req, res, next) => {
  try {
    const body = CreateCustomSymptomBodySchema.safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    const item = await symptomRepository.createCustomSymptom(
      req.userId,
      body.data
    );
    res.status(201).json(item);
  } catch (error) {
    next(error);
  }
};

const deleteCustomSymptom: RequestHandler = async (req, res, next) => {
  try {
    const params = UuidParamSchema.safeParse(req.params);
    if (!params.success) return badRequest(res, params.error);
    const ok = await symptomRepository.deleteCustomSymptom(
      req.userId,
      params.data.id
    );
    if (!ok) {
      res.status(404).json({ error: 'Custom symptom not found' });
      return;
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

// --- Custom Symptom Locations ----------------------------------------------

const listCustomLocations: RequestHandler = async (req, res, next) => {
  try {
    const list = await symptomRepository.listCustomLocations(req.userId);
    res.json(list);
  } catch (error) {
    next(error);
  }
};

const createCustomLocation: RequestHandler = async (req, res, next) => {
  try {
    const body = CreateCustomLocationBodySchema.safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    const item = await symptomRepository.createCustomLocation(
      req.userId,
      body.data
    );
    res.status(201).json(item);
  } catch (error) {
    next(error);
  }
};

const deleteCustomLocation: RequestHandler = async (req, res, next) => {
  try {
    const params = UuidParamSchema.safeParse(req.params);
    if (!params.success) return badRequest(res, params.error);
    const ok = await symptomRepository.deleteCustomLocation(
      req.userId,
      params.data.id
    );
    if (!ok) {
      res.status(404).json({ error: 'Custom location not found' });
      return;
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

// --- Symptom Entries --------------------------------------------------------

const listEntries: RequestHandler = async (req, res, next) => {
  try {
    const query = ListSymptomEntriesQuerySchema.safeParse(req.query);
    if (!query.success) return badRequest(res, query.error);
    const list = await symptomRepository.listSymptomEntries(req.userId, {
      fromDate: query.data.fromDate ?? undefined,
      toDate: query.data.toDate ?? undefined,
      symptomName: query.data.symptomName ?? undefined,
    });
    res.json(list);
  } catch (error) {
    next(error);
  }
};

const createEntry: RequestHandler = async (req, res, next) => {
  try {
    const body = CreateSymptomEntryBodySchema.safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    // Resolve timezone-aware defaults so we don't fall back to UTC CURRENT_DATE
    if (!body.data.entry_date) {
      const tz = await loadUserTimezone(req.userId);
      body.data.entry_date = todayInZone(tz);
    }
    if (!body.data.logged_at) {
      body.data.logged_at = new Date().toISOString();
    }
    const item = await symptomRepository.createSymptomEntry(
      req.userId,
      body.data
    );
    res.status(201).json(item);
  } catch (error) {
    next(error);
  }
};

const deleteEntry: RequestHandler = async (req, res, next) => {
  try {
    const params = UuidParamSchema.safeParse(req.params);
    if (!params.success) return badRequest(res, params.error);
    const ok = await symptomRepository.deleteSymptomEntry(
      req.userId,
      params.data.id
    );
    if (!ok) {
      res.status(404).json({ error: 'Symptom entry not found' });
      return;
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

router.get('/custom', listCustomSymptoms);
router.post('/custom', createCustomSymptom);
router.delete('/custom/:id', deleteCustomSymptom);

router.get('/locations', listCustomLocations);
router.post('/locations', createCustomLocation);
router.delete('/locations/:id', deleteCustomLocation);

router.get('/entries', listEntries);
router.post('/entries', createEntry);
router.delete('/entries/:id', deleteEntry);

export default router;
