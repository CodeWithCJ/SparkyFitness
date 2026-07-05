import express, { RequestHandler } from 'express';
import {
  UpsertCycleSettingsBodySchema,
  UpsertDailyLogBodySchema,
  DateParamSchema,
  ListLogsQuerySchema,
  ListCyclesQuerySchema,
  OverviewQuerySchema,
  DismissPromptBodySchema,
  BulkFlowLogsBodySchema,
  CreateManualCycleBodySchema,
  UpdateCycleBodySchema,
  CreateTestEntryBodySchema,
  ListTestEntriesQuerySchema,
} from '../../schemas/cycleSchemas.js';
import cycleRepository from '../../models/cycleRepository.js';
import cycleService from '../../services/cycleService.js';
import { loadUserTimezone } from '../../utils/timezoneLoader.js';
import { todayInZone } from '@workspace/shared';

const router = express.Router();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Owner-only feature: no onBehalfOf / permission middleware. authMiddleware
// (mounted globally) supplies req.userId; RLS enforces owner-only access.

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

async function birthControlMethod(userId: string): Promise<string | null> {
  const settings = await cycleRepository.getSettings(userId);
  return settings?.birth_control_method ?? null;
}

// --- Settings ---------------------------------------------------------------

const getSettings: RequestHandler = async (req, res, next) => {
  try {
    const settings = await cycleRepository.getSettings(req.userId);
    res.json(settings);
  } catch (error) {
    next(error);
  }
};

const putSettings: RequestHandler = async (req, res, next) => {
  try {
    const body = UpsertCycleSettingsBodySchema.safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    const saved = await cycleRepository.upsertSettings(req.userId, {
      ...body.data,
      mark_onboarded: body.data.mark_onboarded,
    });
    res.json(saved);
  } catch (error) {
    next(error);
  }
};

const dismissPrompt: RequestHandler = async (req, res, next) => {
  try {
    const body = DismissPromptBodySchema.safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    const saved = await cycleRepository.dismissPrompt(
      req.userId,
      body.data.key
    );
    if (!saved) {
      res.status(404).json({ error: 'Cycle settings not found' });
      return;
    }
    res.json(saved);
  } catch (error) {
    next(error);
  }
};

// --- Daily logs -------------------------------------------------------------

const listLogs: RequestHandler = async (req, res, next) => {
  try {
    const query = ListLogsQuerySchema.safeParse(req.query);
    if (!query.success) return badRequest(res, query.error);
    const logs = await cycleRepository.listLogs(
      req.userId,
      query.data.startDate,
      query.data.endDate
    );
    res.json(logs);
  } catch (error) {
    next(error);
  }
};

const getLog: RequestHandler = async (req, res, next) => {
  try {
    const params = DateParamSchema.safeParse(req.params);
    if (!params.success) return badRequest(res, params.error);
    const log = await cycleRepository.getLog(req.userId, params.data.date);
    res.json(log);
  } catch (error) {
    next(error);
  }
};

const putLog: RequestHandler = async (req, res, next) => {
  try {
    const params = DateParamSchema.safeParse(req.params);
    if (!params.success) return badRequest(res, params.error);
    const body = UpsertDailyLogBodySchema.safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    const saved = await cycleRepository.upsertLog(
      req.userId,
      params.data.date,
      body.data
    );
    await cycleService.recomputeCycles(
      req.userId,
      await birthControlMethod(req.userId)
    );
    res.json(saved);
  } catch (error) {
    next(error);
  }
};

const deleteLog: RequestHandler = async (req, res, next) => {
  try {
    const params = DateParamSchema.safeParse(req.params);
    if (!params.success) return badRequest(res, params.error);
    const ok = await cycleRepository.deleteLog(req.userId, params.data.date);
    if (!ok) {
      res.status(404).json({ error: 'Log not found' });
      return;
    }
    await cycleService.recomputeCycles(
      req.userId,
      await birthControlMethod(req.userId)
    );
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

// --- Cycles & overview ------------------------------------------------------

const listCycles: RequestHandler = async (req, res, next) => {
  try {
    const query = ListCyclesQuerySchema.safeParse(req.query);
    if (!query.success) return badRequest(res, query.error);
    const cycles = await cycleRepository.listCycles(
      req.userId,
      query.data.limit
    );
    res.json(cycles);
  } catch (error) {
    next(error);
  }
};

const getOverview: RequestHandler = async (req, res, next) => {
  try {
    const query = OverviewQuerySchema.safeParse(req.query);
    if (!query.success) return badRequest(res, query.error);
    const tz = await loadUserTimezone(req.userId);
    const today = todayInZone(tz);
    const overview = await cycleService.getOverview(
      req.userId,
      today,
      query.data.date
    );
    res.json(overview);
  } catch (error) {
    next(error);
  }
};

const bulkLogs: RequestHandler = async (req, res, next) => {
  try {
    const body = BulkFlowLogsBodySchema.safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    await cycleRepository.bulkUpsertFlowLogs(req.userId, body.data);
    await cycleService.recomputeCycles(
      req.userId,
      await birthControlMethod(req.userId)
    );
    const tz = await loadUserTimezone(req.userId);
    const today = todayInZone(tz);
    const overview = await cycleService.getOverview(req.userId, today);
    res.json(overview);
  } catch (error) {
    next(error);
  }
};

const postCycle: RequestHandler = async (req, res, next) => {
  try {
    const body = CreateManualCycleBodySchema.safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    const saved = await cycleRepository.createManualCycle(
      req.userId,
      body.data
    );
    await cycleService.recomputeCycles(
      req.userId,
      await birthControlMethod(req.userId)
    );
    res.status(201).json(saved);
  } catch (error) {
    next(error);
  }
};

const putCycle: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: 'Missing cycle id' });
      return;
    }
    if (typeof id !== 'string' || !UUID_RE.test(id)) {
      res.status(400).json({ error: 'Invalid cycle id' });
      return;
    }
    const body = UpdateCycleBodySchema.safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    const updated = await cycleRepository.updateCycle(
      req.userId,
      id,
      body.data
    );
    if (!updated) {
      res.status(404).json({ error: 'Cycle not found' });
      return;
    }
    await cycleService.recomputeCycles(
      req.userId,
      await birthControlMethod(req.userId)
    );
    res.json(updated);
  } catch (error) {
    next(error);
  }
};

const deleteCycleHandler: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: 'Missing cycle id' });
      return;
    }
    if (typeof id !== 'string' || !UUID_RE.test(id)) {
      res.status(400).json({ error: 'Invalid cycle id' });
      return;
    }
    const ok = await cycleRepository.deleteCycle(req.userId, id);
    if (!ok) {
      res.status(404).json({ error: 'Cycle not found' });
      return;
    }
    await cycleService.recomputeCycles(
      req.userId,
      await birthControlMethod(req.userId)
    );
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

const getInsightsHandler: RequestHandler = async (req, res, next) => {
  try {
    const insights = await cycleService.getInsights(req.userId);
    res.json(insights);
  } catch (error) {
    next(error);
  }
};

const postTestEntry: RequestHandler = async (req, res, next) => {
  try {
    const body = CreateTestEntryBodySchema.safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    const saved = await cycleRepository.createTestEntry(req.userId, body.data);
    res.status(201).json(saved);
  } catch (error) {
    next(error);
  }
};

const getTestEntries: RequestHandler = async (req, res, next) => {
  try {
    const query = ListTestEntriesQuerySchema.safeParse(req.query);
    if (!query.success) return badRequest(res, query.error);
    const tests = await cycleRepository.listTestEntries(
      req.userId,
      query.data.startDate,
      query.data.endDate
    );
    res.json(tests);
  } catch (error) {
    next(error);
  }
};

const deleteTestEntry: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: 'Missing test entry id' });
      return;
    }
    if (typeof id !== 'string' || !UUID_RE.test(id)) {
      res.status(400).json({ error: 'Invalid test entry id' });
      return;
    }
    const ok = await cycleRepository.deleteTestEntry(req.userId, id);
    if (!ok) {
      res.status(404).json({ error: 'Test entry not found' });
      return;
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

const getFertility: RequestHandler = async (req, res, next) => {
  try {
    const query = OverviewQuerySchema.safeParse(req.query);
    if (!query.success) return badRequest(res, query.error);
    const tz = await loadUserTimezone(req.userId);
    const today = todayInZone(tz);
    const targetDate = query.data.date ?? today;
    const fertility = await cycleService.getFertility(req.userId, targetDate);
    res.json(fertility);
  } catch (error) {
    next(error);
  }
};

const getCorrelationsHandler: RequestHandler = async (req, res, next) => {
  try {
    const correlations = await cycleService.getCorrelations(req.userId);
    res.json(correlations);
  } catch (error) {
    next(error);
  }
};

const getExportHandler: RequestHandler = async (req, res, next) => {
  try {
    const data = await cycleService.getExport(req.userId);
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="cycle-export.json"'
    );
    res.json(data);
  } catch (error) {
    next(error);
  }
};

const getDisplayPreferencesHandler: RequestHandler = async (req, res, next) => {
  try {
    const { viewGroup } = req.params;
    const platform =
      typeof req.query.platform === 'string' ? req.query.platform : 'web';
    if (!viewGroup) {
      res.status(400).json({ error: 'Missing viewGroup parameter' });
      return;
    }
    const visibleItems = await cycleRepository.getDisplayPreferences(
      req.userId,
      viewGroup as string,
      platform as string
    );
    res.json(visibleItems ?? { enabled_items: [], custom_items: [] });
  } catch (error) {
    next(error);
  }
};

const putDisplayPreferencesHandler: RequestHandler = async (req, res, next) => {
  try {
    const { viewGroup } = req.params;
    const platform =
      typeof req.query.platform === 'string' ? req.query.platform : 'web';
    if (!viewGroup) {
      res.status(400).json({ error: 'Missing viewGroup parameter' });
      return;
    }
    const saved = await cycleRepository.upsertDisplayPreferences(
      req.userId,
      viewGroup as string,
      req.body,
      platform as string
    );
    res.json(saved);
  } catch (error) {
    next(error);
  }
};

router.get('/settings', getSettings);
router.put('/settings', putSettings);
router.post('/prompts/dismiss', dismissPrompt);
router.get('/display-preferences/:viewGroup', getDisplayPreferencesHandler);
router.put('/display-preferences/:viewGroup', putDisplayPreferencesHandler);

router.get('/logs', listLogs);
router.put('/logs', bulkLogs);
router.get('/logs/:date', getLog);
router.put('/logs/:date', putLog);
router.delete('/logs/:date', deleteLog);

router.get('/cycles', listCycles);
router.post('/cycles', postCycle);
router.put('/cycles/:id', putCycle);
router.delete('/cycles/:id', deleteCycleHandler);
router.get('/overview', getOverview);
router.get('/insights', getInsightsHandler);

router.post('/tests', postTestEntry);
router.get('/tests', getTestEntries);
router.delete('/tests/:id', deleteTestEntry);
router.get('/fertility', getFertility);
router.get('/correlations', getCorrelationsHandler);
router.get('/export', getExportHandler);

export default router;
