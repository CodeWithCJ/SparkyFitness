import express, { RequestHandler } from 'express';
import {
  CreateMedicationBodySchema,
  UpdateMedicationBodySchema,
  CreateScheduleBodySchema,
  CreatePenBodySchema,
  UpdatePenBodySchema,
  CreateInjectionBodySchema,
  UpdateInjectionBodySchema,
  CreateTitrationStepBodySchema,
  UpdateTitrationStepBodySchema,
  MedicationIdParamSchema,
  ListMedicationsQuerySchema,
  SerumCurveQuerySchema,
  CreateMedicationEntryBodySchema,
  UpdateMedicationEntryBodySchema,
  ListMedicationEntriesQuerySchema,
  UpdateMedicationDisplayPreferencesBodySchema,
  DisplayPreferenceParamsSchema,
} from '../../schemas/medicationSchemas.js';
import { UuidParamSchema } from '../../schemas/measurementSchemas.js';
import checkPermissionMiddleware from '../../middleware/checkPermissionMiddleware.js';
import onBehalfOfMiddleware from '../../middleware/onBehalfOfMiddleware.js';
import medicationRepository from '../../models/medicationRepository.js';
import medicationPenRepository from '../../models/medicationPenRepository.js';
import injectionRepository from '../../models/injectionRepository.js';
import titrationRepository from '../../models/titrationRepository.js';
import glp1Service from '../../services/glp1Service.js';
import medicationEntryRepository from '../../models/medicationEntryRepository.js';
import medicationDisplayPreferenceRepository from '../../models/medicationDisplayPreferenceRepository.js';
import { loadUserTimezone } from '../../utils/timezoneLoader.js';
import { todayInZone } from '@workspace/shared';

const router = express.Router();

// Caregivers may manage a dependent's medications via the on-behalf-of header,
// gated by the 'diary' permission. Owners are unaffected.
router.use(onBehalfOfMiddleware);
router.use(checkPermissionMiddleware('medications'));

/**
 * @swagger
 * tags:
 *   - name: Medications & GLP-1
 *     description: Medication cabinet, schedules, GLP-1 injections, pen/vial inventory, titration, and modeled PK/site-rotation.
 *
 * /v2/medications:
 *   get:
 *     summary: List the user's medications
 *     tags: [Medications & GLP-1]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: glp1Only
 *         schema: { type: boolean }
 *       - in: query
 *         name: activeOnly
 *         schema: { type: boolean }
 *     responses:
 *       200: { description: A list of medications. }
 *   post:
 *     summary: Create a medication
 *     tags: [Medications & GLP-1]
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [name], properties: { name: { type: string }, is_glp1: { type: boolean }, type_id: { type: string }, strength_value: { type: number }, strength_unit: { type: string } } }
 *     responses:
 *       201: { description: Created. }
 *       400: { description: Invalid request. }
 *
 * /v2/medications/{id}:
 *   get:
 *     summary: Get a medication (with schedules)
 *     tags: [Medications & GLP-1]
 *     security: [{ cookieAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     responses:
 *       200: { description: The medication. }
 *       404: { description: Not found. }
 *   put:
 *     summary: Update a medication (partial)
 *     tags: [Medications & GLP-1]
 *     security: [{ cookieAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     responses:
 *       200: { description: Updated. }
 *       404: { description: Not found. }
 *   delete:
 *     summary: Delete a medication (cascades)
 *     tags: [Medications & GLP-1]
 *     security: [{ cookieAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     responses:
 *       204: { description: Deleted. }
 *       404: { description: Not found. }
 *
 * /v2/medications/{medicationId}/schedules:
 *   post:
 *     summary: Add a schedule rule to a medication
 *     tags: [Medications & GLP-1]
 *     security: [{ cookieAuth: [] }]
 *     parameters: [{ in: path, name: medicationId, required: true, schema: { type: string, format: uuid } }]
 *     responses: { 201: { description: Created. }, 400: { description: Invalid request. } }
 * /v2/medications/schedules/{id}:
 *   delete:
 *     summary: Delete a schedule rule
 *     tags: [Medications & GLP-1]
 *     security: [{ cookieAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     responses: { 204: { description: Deleted. }, 404: { description: Not found. } }
 *
 * /v2/medications/{medicationId}/pens:
 *   get:
 *     summary: List pens/vials for a medication
 *     tags: [Medications & GLP-1]
 *     security: [{ cookieAuth: [] }]
 *     parameters: [{ in: path, name: medicationId, required: true, schema: { type: string, format: uuid } }]
 *     responses: { 200: { description: Pen/vial inventory. } }
 *   post:
 *     summary: Add a pen/vial (concentration, volume, BUD, doses)
 *     tags: [Medications & GLP-1]
 *     security: [{ cookieAuth: [] }]
 *     parameters: [{ in: path, name: medicationId, required: true, schema: { type: string, format: uuid } }]
 *     responses: { 201: { description: Created. }, 400: { description: Invalid request. } }
 * /v2/medications/pens/{id}:
 *   put:
 *     summary: Update a pen/vial
 *     tags: [Medications & GLP-1]
 *     security: [{ cookieAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     responses: { 200: { description: Updated. }, 404: { description: Not found. } }
 *   delete:
 *     summary: Delete a pen/vial
 *     tags: [Medications & GLP-1]
 *     security: [{ cookieAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     responses: { 204: { description: Deleted. }, 404: { description: Not found. } }
 *
 * /v2/medications/{medicationId}/injections:
 *   get:
 *     summary: List injections for a medication
 *     tags: [Medications & GLP-1]
 *     security: [{ cookieAuth: [] }]
 *     parameters: [{ in: path, name: medicationId, required: true, schema: { type: string, format: uuid } }]
 *     responses: { 200: { description: Injection history. } }
 * /v2/medications/injections:
 *   post:
 *     summary: Log an injection (optionally deduct from a pen/vial; auto-picks the pen when deduct_pen is set without pen_id)
 *     tags: [Medications & GLP-1]
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [medication_id], properties: { medication_id: { type: string, format: uuid }, pen_id: { type: string, format: uuid }, site: { type: string }, dose_mg: { type: number }, deduct_pen: { type: boolean } } }
 *     responses: { 201: { description: Created (returns injection + updated pen). }, 400: { description: Invalid request. } }
 * /v2/medications/injections/{id}:
 *   put:
 *     summary: Update an injection (timing, site, dose, notes — not pen deduction)
 *     tags: [Medications & GLP-1]
 *     security: [{ cookieAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     responses: { 200: { description: Updated. }, 404: { description: Not found. } }
 *   delete:
 *     summary: Delete an injection (credits the dose back to its pen when one was deducted)
 *     tags: [Medications & GLP-1]
 *     security: [{ cookieAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     responses: { 204: { description: Deleted. }, 404: { description: Not found. } }
 *
 * /v2/medications/{medicationId}/titration:
 *   get:
 *     summary: List titration/taper steps
 *     tags: [Medications & GLP-1]
 *     security: [{ cookieAuth: [] }]
 *     parameters: [{ in: path, name: medicationId, required: true, schema: { type: string, format: uuid } }]
 *     responses: { 200: { description: Titration plan steps. } }
 *   post:
 *     summary: Add a titration/taper step
 *     tags: [Medications & GLP-1]
 *     security: [{ cookieAuth: [] }]
 *     parameters: [{ in: path, name: medicationId, required: true, schema: { type: string, format: uuid } }]
 *     responses: { 201: { description: Created. }, 400: { description: Invalid request. } }
 * /v2/medications/titration/{id}:
 *   put:
 *     summary: Update a titration step
 *     tags: [Medications & GLP-1]
 *     security: [{ cookieAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     responses: { 200: { description: Updated. }, 404: { description: Not found. } }
 *   delete:
 *     summary: Delete a titration step
 *     tags: [Medications & GLP-1]
 *     security: [{ cookieAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     responses: { 204: { description: Deleted. }, 404: { description: Not found. } }
 *
 * /v2/medications/{medicationId}/glp1/serum-curve:
 *   get:
 *     summary: Modeled GLP-1 serum-level curve (PK model, not measured)
 *     tags: [Medications & GLP-1]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: medicationId, required: true, schema: { type: string, format: uuid } }
 *       - { in: query, name: fromDay, schema: { type: number } }
 *       - { in: query, name: toDay, schema: { type: number } }
 *       - { in: query, name: stepDays, schema: { type: number } }
 *     responses:
 *       200: { description: Sampled curve + current modeled level + disclaimer. }
 *       404: { description: Medication not found. }
 * /v2/medications/{medicationId}/glp1/site-suggestion:
 *   get:
 *     summary: Suggest the next injection site (rotation + lipo rest window)
 *     tags: [Medications & GLP-1]
 *     security: [{ cookieAuth: [] }]
 *     parameters: [{ in: path, name: medicationId, required: true, schema: { type: string, format: uuid } }]
 *     responses: { 200: { description: Suggested site + resting sites + zone map. } }
 *
 * /v2/medications/entries:
 *   get:
 *     summary: List logged adherence doses, merged with GLP-1 injection logs
 *     description: Injection rows are folded into the same feed and flagged with entry_type='injection'; their id is an injection id, so update/delete them via the /injections endpoints.
 *     tags: [Medications & GLP-1]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: query, name: fromDate, schema: { type: string, format: date } }
 *       - { in: query, name: toDate, schema: { type: string, format: date } }
 *       - { in: query, name: medicationId, schema: { type: string, format: uuid } }
 *     responses: { 200: { description: Logged doses (adherence entries + injections). } }
 *   post:
 *     summary: Log an adherence dose (taken/skipped/snoozed/prn_taken)
 *     tags: [Medications & GLP-1]
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [medication_id], properties: { medication_id: { type: string, format: uuid }, schedule_id: { type: string, format: uuid }, status: { type: string, enum: [taken, skipped, snoozed, prn_taken] }, taken_at: { type: string, format: date-time }, entry_date: { type: string, format: date }, notes: { type: string } } }
 *     responses: { 201: { description: Created. }, 400: { description: Invalid request. } }
 * /v2/medications/entries/{id}:
 *   put:
 *     summary: Update a logged dose (e.g. correct the taken-at time or notes)
 *     tags: [Medications & GLP-1]
 *     security: [{ cookieAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { status: { type: string, enum: [taken, skipped, snoozed, prn_taken] }, taken_at: { type: string, format: date-time }, scheduled_for: { type: string, format: date-time }, entry_date: { type: string, format: date }, notes: { type: string } } }
 *     responses: { 200: { description: Updated. }, 404: { description: Not found. } }
 *   delete:
 *     summary: Delete a logged dose
 *     tags: [Medications & GLP-1]
 *     security: [{ cookieAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     responses: { 204: { description: Deleted. }, 404: { description: Not found. } }
 *
 * /v2/medications/display-preferences:
 *   get:
 *     summary: List the user's medication display preferences
 *     tags: [Medications & GLP-1]
 *     security: [{ cookieAuth: [] }]
 *     responses: { 200: { description: Display preferences per view group and platform. } }
 * /v2/medications/display-preferences/{viewGroup}/{platform}:
 *   put:
 *     summary: Upsert the visible items for a view group and platform
 *     tags: [Medications & GLP-1]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: viewGroup, required: true, schema: { type: string } }
 *       - { in: path, name: platform, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [visible_items], properties: { visible_items: { type: array, items: { type: string } } } }
 *     responses: { 200: { description: Upserted preference. }, 400: { description: Invalid request. } }
 *   delete:
 *     summary: Delete a display preference for a view group and platform
 *     tags: [Medications & GLP-1]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: viewGroup, required: true, schema: { type: string } }
 *       - { in: path, name: platform, required: true, schema: { type: string } }
 *     responses: { 204: { description: Deleted. }, 404: { description: Not found. } }
 */

// Small helper to send a uniform 400 for Zod failures.
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

// --- Medications ----------------------------------------------------------

const listMedications: RequestHandler = async (req, res, next) => {
  try {
    const query = ListMedicationsQuerySchema.safeParse(req.query);
    if (!query.success) return badRequest(res, query.error);
    const meds = await medicationRepository.listMedications(req.userId, {
      glp1Only: query.data.glp1Only,
      activeOnly: query.data.activeOnly,
    });
    res.json(meds);
  } catch (error) {
    next(error);
  }
};

const createMedication: RequestHandler = async (req, res, next) => {
  try {
    const body = CreateMedicationBodySchema.safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    const med = await medicationRepository.createMedication(
      req.userId,
      body.data
    );
    res.status(201).json(med);
  } catch (error) {
    next(error);
  }
};

const getMedication: RequestHandler = async (req, res, next) => {
  try {
    const params = UuidParamSchema.safeParse(req.params);
    if (!params.success) return badRequest(res, params.error);
    const med = await medicationRepository.getMedicationById(
      req.userId,
      params.data.id
    );
    if (!med) {
      res.status(404).json({ error: 'Medication not found' });
      return;
    }
    res.json(med);
  } catch (error) {
    next(error);
  }
};

const updateMedication: RequestHandler = async (req, res, next) => {
  try {
    const params = UuidParamSchema.safeParse(req.params);
    if (!params.success) return badRequest(res, params.error);
    const body = UpdateMedicationBodySchema.safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    const med = await medicationRepository.updateMedication(
      req.userId,
      params.data.id,
      body.data
    );
    if (!med) {
      res.status(404).json({ error: 'Medication not found' });
      return;
    }
    res.json(med);
  } catch (error) {
    next(error);
  }
};

const deleteMedication: RequestHandler = async (req, res, next) => {
  try {
    const params = UuidParamSchema.safeParse(req.params);
    if (!params.success) return badRequest(res, params.error);
    const ok = await medicationRepository.deleteMedication(
      req.userId,
      params.data.id
    );
    if (!ok) {
      res.status(404).json({ error: 'Medication not found' });
      return;
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

// --- Medication Entries (Adherence) ---------------------------------------

const listEntries: RequestHandler = async (req, res, next) => {
  try {
    const query = ListMedicationEntriesQuerySchema.safeParse(req.query);
    if (!query.success) return badRequest(res, query.error);
    const entries = await medicationEntryRepository.listEntriesWithInjections(
      req.userId,
      {
        fromDate: query.data.fromDate ?? undefined,
        toDate: query.data.toDate ?? undefined,
        medicationId: query.data.medicationId ?? undefined,
      }
    );
    res.json(entries);
  } catch (error) {
    next(error);
  }
};

const createEntry: RequestHandler = async (req, res, next) => {
  try {
    const body = CreateMedicationEntryBodySchema.safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    // Resolve timezone-aware defaults so we don't fall back to UTC CURRENT_DATE
    if (!body.data.entry_date) {
      const tz = await loadUserTimezone(req.userId);
      body.data.entry_date = todayInZone(tz);
    }
    if (!body.data.taken_at) {
      body.data.taken_at = new Date().toISOString();
    }
    const entry = await medicationEntryRepository.createEntry(
      req.userId,
      body.data
    );
    res.status(201).json(entry);
  } catch (error) {
    next(error);
  }
};

const updateEntry: RequestHandler = async (req, res, next) => {
  try {
    const params = UuidParamSchema.safeParse(req.params);
    if (!params.success) return badRequest(res, params.error);
    const body = UpdateMedicationEntryBodySchema.safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    const entry = await medicationEntryRepository.updateEntry(
      req.userId,
      params.data.id,
      body.data
    );
    if (!entry) {
      res.status(404).json({ error: 'Medication entry not found' });
      return;
    }
    res.json(entry);
  } catch (error) {
    next(error);
  }
};

const deleteEntry: RequestHandler = async (req, res, next) => {
  try {
    const params = UuidParamSchema.safeParse(req.params);
    if (!params.success) return badRequest(res, params.error);
    const ok = await medicationEntryRepository.deleteEntry(
      req.userId,
      params.data.id
    );
    if (!ok) {
      res.status(404).json({ error: 'Medication entry not found' });
      return;
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

router.get('/', listMedications);
router.post('/', createMedication);
router.get('/entries', listEntries);
router.post('/entries', createEntry);
router.put('/entries/:id', updateEntry);
router.delete('/entries/:id', deleteEntry);
// --- Display Preferences --------------------------------------------------

const getDisplayPreferences: RequestHandler = async (req, res, next) => {
  try {
    const prefs =
      await medicationDisplayPreferenceRepository.getMedicationDisplayPreferences(
        req.userId
      );
    res.json(prefs);
  } catch (error) {
    next(error);
  }
};

const upsertDisplayPreference: RequestHandler = async (req, res, next) => {
  try {
    const params = DisplayPreferenceParamsSchema.safeParse(req.params);
    if (!params.success) return badRequest(res, params.error);
    const body = UpdateMedicationDisplayPreferencesBodySchema.safeParse(
      req.body
    );
    if (!body.success) return badRequest(res, body.error);
    const pref =
      await medicationDisplayPreferenceRepository.upsertMedicationDisplayPreference(
        req.userId,
        params.data.viewGroup,
        params.data.platform,
        body.data.visible_items
      );
    res.json(pref);
  } catch (error) {
    next(error);
  }
};

const deleteDisplayPreference: RequestHandler = async (req, res, next) => {
  try {
    const params = DisplayPreferenceParamsSchema.safeParse(req.params);
    if (!params.success) return badRequest(res, params.error);
    const ok =
      await medicationDisplayPreferenceRepository.deleteMedicationDisplayPreference(
        req.userId,
        params.data.viewGroup,
        params.data.platform
      );
    if (!ok) {
      res.status(404).json({ error: 'Display preference not found' });
      return;
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

router.get('/display-preferences', getDisplayPreferences);
router.put(
  '/display-preferences/:viewGroup/:platform',
  upsertDisplayPreference
);
router.delete(
  '/display-preferences/:viewGroup/:platform',
  deleteDisplayPreference
);

router.get('/:id', getMedication);
router.put('/:id', updateMedication);
router.delete('/:id', deleteMedication);

// --- Schedules ------------------------------------------------------------

const addSchedule: RequestHandler = async (req, res, next) => {
  try {
    const params = MedicationIdParamSchema.safeParse(req.params);
    if (!params.success) return badRequest(res, params.error);
    const body = CreateScheduleBodySchema.safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    const schedule = await medicationRepository.addSchedule(
      req.userId,
      params.data.medicationId,
      body.data
    );
    res.status(201).json(schedule);
  } catch (error) {
    next(error);
  }
};

const deleteSchedule: RequestHandler = async (req, res, next) => {
  try {
    const params = UuidParamSchema.safeParse(req.params);
    if (!params.success) return badRequest(res, params.error);
    const ok = await medicationRepository.deleteSchedule(
      req.userId,
      params.data.id
    );
    if (!ok) {
      res.status(404).json({ error: 'Schedule not found' });
      return;
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

router.post('/:medicationId/schedules', addSchedule);
router.delete('/schedules/:id', deleteSchedule);

// --- Pens / vials ---------------------------------------------------------

const listPens: RequestHandler = async (req, res, next) => {
  try {
    const params = MedicationIdParamSchema.safeParse(req.params);
    if (!params.success) return badRequest(res, params.error);
    const pens = await medicationPenRepository.listPens(
      req.userId,
      params.data.medicationId
    );
    res.json(pens);
  } catch (error) {
    next(error);
  }
};

const createPen: RequestHandler = async (req, res, next) => {
  try {
    const params = MedicationIdParamSchema.safeParse(req.params);
    if (!params.success) return badRequest(res, params.error);
    const body = CreatePenBodySchema.safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    const pen = await medicationPenRepository.createPen(
      req.userId,
      params.data.medicationId,
      body.data
    );
    res.status(201).json(pen);
  } catch (error) {
    next(error);
  }
};

const updatePen: RequestHandler = async (req, res, next) => {
  try {
    const params = UuidParamSchema.safeParse(req.params);
    if (!params.success) return badRequest(res, params.error);
    const body = UpdatePenBodySchema.safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    const pen = await medicationPenRepository.updatePen(
      req.userId,
      params.data.id,
      body.data
    );
    if (!pen) {
      res.status(404).json({ error: 'Pen not found' });
      return;
    }
    res.json(pen);
  } catch (error) {
    next(error);
  }
};

const deletePen: RequestHandler = async (req, res, next) => {
  try {
    const params = UuidParamSchema.safeParse(req.params);
    if (!params.success) return badRequest(res, params.error);
    const ok = await medicationPenRepository.deletePen(
      req.userId,
      params.data.id
    );
    if (!ok) {
      res.status(404).json({ error: 'Pen not found' });
      return;
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

router.get('/:medicationId/pens', listPens);
router.post('/:medicationId/pens', createPen);
router.put('/pens/:id', updatePen);
router.delete('/pens/:id', deletePen);

// --- Injections -----------------------------------------------------------

const listInjections: RequestHandler = async (req, res, next) => {
  try {
    const params = MedicationIdParamSchema.safeParse(req.params);
    if (!params.success) return badRequest(res, params.error);
    const injections = await injectionRepository.listInjections(req.userId, {
      medicationId: params.data.medicationId,
    });
    res.json(injections);
  } catch (error) {
    next(error);
  }
};

const createInjection: RequestHandler = async (req, res, next) => {
  try {
    const body = CreateInjectionBodySchema.safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    // Resolve timezone-aware defaults so we don't fall back to UTC CURRENT_DATE
    if (!body.data.entry_date) {
      const tz = await loadUserTimezone(req.userId);
      body.data.entry_date = todayInZone(tz);
    }
    if (!body.data.injected_at) {
      body.data.injected_at = new Date().toISOString();
    }
    const injection = await injectionRepository.createInjection(
      req.userId,
      body.data
    );
    res.status(201).json(injection);
  } catch (error) {
    next(error);
  }
};

const updateInjection: RequestHandler = async (req, res, next) => {
  try {
    const params = UuidParamSchema.safeParse(req.params);
    if (!params.success) return badRequest(res, params.error);
    const body = UpdateInjectionBodySchema.safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    const injection = await injectionRepository.updateInjection(
      req.userId,
      params.data.id,
      body.data
    );
    if (!injection) {
      res.status(404).json({ error: 'Injection not found' });
      return;
    }
    res.json(injection);
  } catch (error) {
    next(error);
  }
};

const deleteInjection: RequestHandler = async (req, res, next) => {
  try {
    const params = UuidParamSchema.safeParse(req.params);
    if (!params.success) return badRequest(res, params.error);
    const ok = await injectionRepository.deleteInjection(
      req.userId,
      params.data.id
    );
    if (!ok) {
      res.status(404).json({ error: 'Injection not found' });
      return;
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

router.get('/:medicationId/injections', listInjections);
router.post('/injections', createInjection);
router.put('/injections/:id', updateInjection);
router.delete('/injections/:id', deleteInjection);

// --- Titration / taper steps ---------------------------------------------

const listSteps: RequestHandler = async (req, res, next) => {
  try {
    const params = MedicationIdParamSchema.safeParse(req.params);
    if (!params.success) return badRequest(res, params.error);
    const steps = await titrationRepository.listSteps(
      req.userId,
      params.data.medicationId
    );
    res.json(steps);
  } catch (error) {
    next(error);
  }
};

const createStep: RequestHandler = async (req, res, next) => {
  try {
    const params = MedicationIdParamSchema.safeParse(req.params);
    if (!params.success) return badRequest(res, params.error);
    const body = CreateTitrationStepBodySchema.safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    const step = await titrationRepository.createStep(
      req.userId,
      params.data.medicationId,
      body.data
    );
    res.status(201).json(step);
  } catch (error) {
    next(error);
  }
};

const updateStep: RequestHandler = async (req, res, next) => {
  try {
    const params = UuidParamSchema.safeParse(req.params);
    if (!params.success) return badRequest(res, params.error);
    const body = UpdateTitrationStepBodySchema.safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    const step = await titrationRepository.updateStep(
      req.userId,
      params.data.id,
      body.data
    );
    if (!step) {
      res.status(404).json({ error: 'Titration step not found' });
      return;
    }
    res.json(step);
  } catch (error) {
    next(error);
  }
};

const deleteStep: RequestHandler = async (req, res, next) => {
  try {
    const params = UuidParamSchema.safeParse(req.params);
    if (!params.success) return badRequest(res, params.error);
    const ok = await titrationRepository.deleteStep(req.userId, params.data.id);
    if (!ok) {
      res.status(404).json({ error: 'Titration step not found' });
      return;
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

router.get('/:medicationId/titration', listSteps);
router.post('/:medicationId/titration', createStep);
router.put('/titration/:id', updateStep);
router.delete('/titration/:id', deleteStep);

// --- GLP-1 derived data (PK curve, site rotation) -------------------------

const getSerumCurve: RequestHandler = async (req, res, next) => {
  try {
    const params = MedicationIdParamSchema.safeParse(req.params);
    if (!params.success) return badRequest(res, params.error);
    const query = SerumCurveQuerySchema.safeParse(req.query);
    if (!query.success) return badRequest(res, query.error);
    const result = await glp1Service.getSerumCurve(
      req.userId,
      params.data.medicationId,
      query.data
    );
    res.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'Medication not found') {
      res.status(404).json({ error: error.message });
      return;
    }
    next(error);
  }
};

const getSiteSuggestion: RequestHandler = async (req, res, next) => {
  try {
    const params = MedicationIdParamSchema.safeParse(req.params);
    if (!params.success) return badRequest(res, params.error);
    const result = await glp1Service.getSiteSuggestion(
      req.userId,
      params.data.medicationId
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
};

router.get('/:medicationId/glp1/serum-curve', getSerumCurve);
router.get('/:medicationId/glp1/site-suggestion', getSiteSuggestion);

export default router;
