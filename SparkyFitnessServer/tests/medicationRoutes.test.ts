import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error supertest has no bundled types in this project
import request from 'supertest';
import express from 'express';
import medicationRepository from '../models/medicationRepository.js';
import medicationPenRepository from '../models/medicationPenRepository.js';
import injectionRepository from '../models/injectionRepository.js';
import titrationRepository from '../models/titrationRepository.js';
import medicationEntryRepository from '../models/medicationEntryRepository.js';
import medicationDisplayPreferenceRepository from '../models/medicationDisplayPreferenceRepository.js';
import glp1Service from '../services/glp1Service.js';
import medicationRoutes from '../routes/v2/medicationRoutes.js';

vi.mock('../models/medicationRepository.js');
vi.mock('../models/medicationPenRepository.js');
vi.mock('../models/injectionRepository.js');
vi.mock('../models/titrationRepository.js');
vi.mock('../models/medicationEntryRepository.js');
vi.mock('../models/medicationDisplayPreferenceRepository.js');
vi.mock('../services/glp1Service.js');
vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  default: vi.fn(
    () =>
      (
        req: express.Request,
        res: express.Response,
        next: express.NextFunction
      ) =>
        next()
  ),
}));
vi.mock('../middleware/onBehalfOfMiddleware.js', () => ({
  default: (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => next(),
}));

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  if (req.headers.cookie && req.headers.cookie.includes('userId=')) {
    const m = req.headers.cookie.match(/userId=([^;]+)/);
    if (m) req.userId = m[1];
  }
  next();
});
app.use('/api/v2/medications', medicationRoutes);

const UID = '550e8400-e29b-41d4-a716-446655440000';
const cookie = ['userId=testUser'];

describe('Medication Routes V2', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('GET /api/v2/medications', () => {
    it('lists medications for the user', async () => {
      const meds = [{ id: UID, name: 'Wegovy', is_glp1: true }];
      vi.mocked(medicationRepository.listMedications).mockResolvedValue(meds);
      const res = await request(app)
        .get('/api/v2/medications')
        .set('Cookie', cookie);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(meds);
      expect(medicationRepository.listMedications).toHaveBeenCalledWith(
        'testUser',
        expect.any(Object)
      );
    });

    it('passes glp1Only filter through', async () => {
      vi.mocked(medicationRepository.listMedications).mockResolvedValue([]);
      await request(app)
        .get('/api/v2/medications?glp1Only=true')
        .set('Cookie', cookie);
      expect(medicationRepository.listMedications).toHaveBeenCalledWith(
        'testUser',
        expect.objectContaining({ glp1Only: true })
      );
    });
  });

  describe('POST /api/v2/medications', () => {
    it('creates a medication', async () => {
      const created = { id: UID, name: 'Wegovy' };
      vi.mocked(medicationRepository.createMedication).mockResolvedValue(
        created
      );
      const res = await request(app)
        .post('/api/v2/medications')
        .set('Cookie', cookie)
        .send({
          name: 'Wegovy',
          is_glp1: true,
          strength_value: 1,
          strength_unit: 'mg',
        });
      expect(res.statusCode).toBe(201);
      expect(res.body).toEqual(created);
    });

    it('returns 400 when name is missing', async () => {
      const res = await request(app)
        .post('/api/v2/medications')
        .set('Cookie', cookie)
        .send({ is_glp1: true });
      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('error', 'Invalid request');
    });
  });

  describe('GET /api/v2/medications/:id', () => {
    it('returns a medication', async () => {
      const med = { id: UID, name: 'Wegovy', schedules: [] };
      vi.mocked(medicationRepository.getMedicationById).mockResolvedValue(med);
      const res = await request(app)
        .get(`/api/v2/medications/${UID}`)
        .set('Cookie', cookie);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(med);
    });

    it('returns 404 when not found', async () => {
      vi.mocked(medicationRepository.getMedicationById).mockResolvedValue(null);
      const res = await request(app)
        .get(`/api/v2/medications/${UID}`)
        .set('Cookie', cookie);
      expect(res.statusCode).toBe(404);
    });

    it('returns 400 for an invalid uuid', async () => {
      const res = await request(app)
        .get('/api/v2/medications/not-a-uuid')
        .set('Cookie', cookie);
      expect(res.statusCode).toBe(400);
    });
  });

  describe('DELETE /api/v2/medications/:id', () => {
    it('deletes and returns 204', async () => {
      vi.mocked(medicationRepository.deleteMedication).mockResolvedValue(true);
      const res = await request(app)
        .delete(`/api/v2/medications/${UID}`)
        .set('Cookie', cookie);
      expect(res.statusCode).toBe(204);
    });

    it('returns 404 when nothing deleted', async () => {
      vi.mocked(medicationRepository.deleteMedication).mockResolvedValue(false);
      const res = await request(app)
        .delete(`/api/v2/medications/${UID}`)
        .set('Cookie', cookie);
      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /api/v2/medications/injections', () => {
    it('logs an injection (with pen auto-deduct passthrough)', async () => {
      const result = {
        id: 'inj-1',
        site: 'left_thigh',
        pen: { doses_used: 1 },
      };
      vi.mocked(injectionRepository.createInjection).mockResolvedValue(result);
      const res = await request(app)
        .post('/api/v2/medications/injections')
        .set('Cookie', cookie)
        .send({
          medication_id: UID,
          site: 'left_thigh',
          dose_mg: 1,
          deduct_pen: true,
        });
      expect(res.statusCode).toBe(201);
      expect(res.body).toEqual(result);
      expect(injectionRepository.createInjection).toHaveBeenCalledWith(
        'testUser',
        expect.objectContaining({ medication_id: UID, deduct_pen: true })
      );
    });

    it('returns 400 when medication_id is missing', async () => {
      const res = await request(app)
        .post('/api/v2/medications/injections')
        .set('Cookie', cookie)
        .send({ site: 'left_thigh' });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('Pens', () => {
    it('creates a pen/vial', async () => {
      const pen = { id: 'pen-1', kind: 'vial', concentration_mg_ml: 2.5 };
      vi.mocked(medicationPenRepository.createPen).mockResolvedValue(pen);
      const res = await request(app)
        .post(`/api/v2/medications/${UID}/pens`)
        .set('Cookie', cookie)
        .send({
          kind: 'vial',
          concentration_mg_ml: 2.5,
          volume_ml: 1,
          doses_total: 4,
        });
      expect(res.statusCode).toBe(201);
      expect(res.body).toEqual(pen);
    });
  });

  describe('Titration / taper', () => {
    it('adds a titration step', async () => {
      const step = { id: 'step-1', dose_mg: 0.5, status: 'planned' };
      vi.mocked(titrationRepository.createStep).mockResolvedValue(step);
      const res = await request(app)
        .post(`/api/v2/medications/${UID}/titration`)
        .set('Cookie', cookie)
        .send({ dose_mg: 0.5, planned_weeks: 4, status: 'planned' });
      expect(res.statusCode).toBe(201);
      expect(res.body).toEqual(step);
      expect(titrationRepository.createStep).toHaveBeenCalledWith(
        'testUser',
        UID,
        expect.objectContaining({ dose_mg: 0.5 })
      );
    });

    it('returns 400 when dose_mg is missing', async () => {
      const res = await request(app)
        .post(`/api/v2/medications/${UID}/titration`)
        .set('Cookie', cookie)
        .send({ planned_weeks: 4 });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('GLP-1 derived', () => {
    it('returns the modeled serum curve', async () => {
      const payload = {
        drugId: 'semaglutide',
        curve: [{ day: 0, level: 1, fraction: 1 }],
        currentLevelFraction: 0.7,
        doseDays: [0],
        disclaimer: 'Modeled estimate',
      };
      vi.mocked(glp1Service.getSerumCurve).mockResolvedValue(payload);
      const res = await request(app)
        .get(`/api/v2/medications/${UID}/glp1/serum-curve`)
        .set('Cookie', cookie);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(payload);
    });

    it('returns the site suggestion', async () => {
      const payload = {
        suggestedSiteId: 'right_arm',
        restingSiteIds: ['left_thigh'],
        sites: [],
        restDays: 7,
        activeSiteIds: null,
      };
      vi.mocked(glp1Service.getSiteSuggestion).mockResolvedValue(payload);
      const res = await request(app)
        .get(`/api/v2/medications/${UID}/glp1/site-suggestion`)
        .set('Cookie', cookie);
      expect(res.statusCode).toBe(200);
      expect(res.body.suggestedSiteId).toBe('right_arm');
    });

    it('returns 404 when the medication is missing for the curve', async () => {
      vi.mocked(glp1Service.getSerumCurve).mockRejectedValue(
        new Error('Medication not found')
      );
      const res = await request(app)
        .get(`/api/v2/medications/${UID}/glp1/serum-curve`)
        .set('Cookie', cookie);
      expect(res.statusCode).toBe(404);
    });
  });

  describe('Entries', () => {
    it('lists medication entries', async () => {
      const entries = [{ id: 'entry-1', medication_id: UID, status: 'taken' }];
      vi.mocked(medicationEntryRepository.listEntries).mockResolvedValue(
        entries
      );
      const res = await request(app)
        .get(
          '/api/v2/medications/entries?fromDate=2026-06-01&toDate=2026-06-30'
        )
        .set('Cookie', cookie);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(entries);
      expect(medicationEntryRepository.listEntries).toHaveBeenCalledWith(
        'testUser',
        expect.objectContaining({
          fromDate: '2026-06-01',
          toDate: '2026-06-30',
        })
      );
    });

    it('creates a medication entry', async () => {
      const entry = { id: 'entry-1', medication_id: UID, status: 'taken' };
      vi.mocked(medicationEntryRepository.createEntry).mockResolvedValue(entry);
      const res = await request(app)
        .post('/api/v2/medications/entries')
        .set('Cookie', cookie)
        .send({
          medication_id: UID,
          status: 'taken',
          entry_date: '2026-06-25',
        });
      expect(res.statusCode).toBe(201);
      expect(res.body).toEqual(entry);
    });

    it('returns 400 when creating with invalid status', async () => {
      const res = await request(app)
        .post('/api/v2/medications/entries')
        .set('Cookie', cookie)
        .send({
          medication_id: UID,
          status: 'invalid_status',
        });
      expect(res.statusCode).toBe(400);
    });

    it('deletes an entry', async () => {
      vi.mocked(medicationEntryRepository.deleteEntry).mockResolvedValue(true);
      const res = await request(app)
        .delete(`/api/v2/medications/entries/${UID}`)
        .set('Cookie', cookie);
      expect(res.statusCode).toBe(204);
    });
  });

  describe('Display Preferences', () => {
    it('lists display preferences', async () => {
      const prefs = [
        {
          id: 'pref-1',
          view_group: 'reports',
          platform: 'web',
          visible_items: ['a'],
        },
      ];
      vi.mocked(
        medicationDisplayPreferenceRepository.getMedicationDisplayPreferences
      ).mockResolvedValue(prefs);
      const res = await request(app)
        .get('/api/v2/medications/display-preferences')
        .set('Cookie', cookie);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(prefs);
    });

    it('upserts a display preference', async () => {
      const pref = {
        id: 'pref-1',
        view_group: 'reports',
        platform: 'web',
        visible_items: ['a'],
      };
      vi.mocked(
        medicationDisplayPreferenceRepository.upsertMedicationDisplayPreference
      ).mockResolvedValue(pref);
      const res = await request(app)
        .put('/api/v2/medications/display-preferences/reports/web')
        .set('Cookie', cookie)
        .send({ visible_items: ['a'] });
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(pref);
      expect(
        medicationDisplayPreferenceRepository.upsertMedicationDisplayPreference
      ).toHaveBeenCalledWith('testUser', 'reports', 'web', ['a']);
    });

    it('deletes a display preference', async () => {
      vi.mocked(
        medicationDisplayPreferenceRepository.deleteMedicationDisplayPreference
      ).mockResolvedValue(true);
      const res = await request(app)
        .delete('/api/v2/medications/display-preferences/reports/web')
        .set('Cookie', cookie);
      expect(res.statusCode).toBe(204);
    });

    it('returns 404 when display preference to delete is not found', async () => {
      vi.mocked(
        medicationDisplayPreferenceRepository.deleteMedicationDisplayPreference
      ).mockResolvedValue(false);
      const res = await request(app)
        .delete('/api/v2/medications/display-preferences/reports/web')
        .set('Cookie', cookie);
      expect(res.statusCode).toBe(404);
    });
  });
});
