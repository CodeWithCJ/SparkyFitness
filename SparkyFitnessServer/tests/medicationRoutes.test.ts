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
vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn(async () => 'America/New_York'),
  resolveTemplateStartDay: vi.fn(async () => '2026-07-28'),
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

    it('files a backdated entry under the day it was administered, not today', async () => {
      vi.mocked(injectionRepository.createInjection).mockResolvedValue({
        id: 'inj-1',
      });
      await request(app)
        .post('/api/v2/medications/injections')
        .set('Cookie', cookie)
        .send({
          medication_id: UID,
          injected_at: '2026-06-24T15:45:00.000Z',
        });
      expect(injectionRepository.createInjection).toHaveBeenCalledWith(
        'testUser',
        expect.objectContaining({ entry_date: '2026-06-24' })
      );
    });

    it('resolves the day in the user timezone, not UTC', async () => {
      vi.mocked(injectionRepository.createInjection).mockResolvedValue({
        id: 'inj-1',
      });
      await request(app)
        .post('/api/v2/medications/injections')
        .set('Cookie', cookie)
        .send({
          medication_id: UID,
          injected_at: '2026-06-25T02:00:00.000Z',
        });
      expect(injectionRepository.createInjection).toHaveBeenCalledWith(
        'testUser',
        expect.objectContaining({ entry_date: '2026-06-24' })
      );
    });

    it('honors an explicit entry_date over the administration time', async () => {
      vi.mocked(injectionRepository.createInjection).mockResolvedValue({
        id: 'inj-1',
      });
      await request(app)
        .post('/api/v2/medications/injections')
        .set('Cookie', cookie)
        .send({
          medication_id: UID,
          injected_at: '2026-06-24T15:45:00.000Z',
          entry_date: '2026-06-30',
        });
      expect(injectionRepository.createInjection).toHaveBeenCalledWith(
        'testUser',
        expect.objectContaining({ entry_date: '2026-06-30' })
      );
    });

    it('falls back to today when no administration time is supplied', async () => {
      vi.mocked(injectionRepository.createInjection).mockResolvedValue({
        id: 'inj-1',
      });
      await request(app)
        .post('/api/v2/medications/injections')
        .set('Cookie', cookie)
        .send({ medication_id: UID });
      const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
      expect(injectionRepository.createInjection).toHaveBeenCalledWith(
        'testUser',
        expect.objectContaining({ entry_date: today })
      );
    });
  });

  describe('PUT /api/v2/medications/injections/:id', () => {
    it('updates an injection', async () => {
      const updated = { id: UID, site: 'right_thigh', dose_mg: 0.5 };
      vi.mocked(injectionRepository.updateInjection).mockResolvedValue(updated);
      const res = await request(app)
        .put(`/api/v2/medications/injections/${UID}`)
        .set('Cookie', cookie)
        .send({ site: 'right_thigh', dose_mg: 0.5 });
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(updated);
      expect(injectionRepository.updateInjection).toHaveBeenCalledWith(
        'testUser',
        UID,
        expect.objectContaining({ site: 'right_thigh', dose_mg: 0.5 })
      );
    });

    it('moves entry_date when the administration time is corrected', async () => {
      vi.mocked(injectionRepository.updateInjection).mockResolvedValue({
        id: UID,
      });
      await request(app)
        .put(`/api/v2/medications/injections/${UID}`)
        .set('Cookie', cookie)
        .send({ injected_at: '2026-07-01T22:00:00.000Z' });
      expect(injectionRepository.updateInjection).toHaveBeenCalledWith(
        'testUser',
        UID,
        expect.objectContaining({ entry_date: '2026-07-01' })
      );
    });

    it('leaves entry_date alone when the administration time is unchanged', async () => {
      vi.mocked(injectionRepository.updateInjection).mockResolvedValue({
        id: UID,
      });
      await request(app)
        .put(`/api/v2/medications/injections/${UID}`)
        .set('Cookie', cookie)
        .send({ site: 'right_thigh' });
      const arg = vi.mocked(injectionRepository.updateInjection).mock
        .calls[0][2];
      expect(arg).not.toHaveProperty('entry_date');
    });

    it('honors an explicit entry_date alongside a corrected time', async () => {
      vi.mocked(injectionRepository.updateInjection).mockResolvedValue({
        id: UID,
      });
      await request(app)
        .put(`/api/v2/medications/injections/${UID}`)
        .set('Cookie', cookie)
        .send({
          injected_at: '2026-07-01T22:00:00.000Z',
          entry_date: '2026-07-05',
        });
      expect(injectionRepository.updateInjection).toHaveBeenCalledWith(
        'testUser',
        UID,
        expect.objectContaining({ entry_date: '2026-07-05' })
      );
    });

    it('returns 404 when the injection is missing', async () => {
      vi.mocked(injectionRepository.updateInjection).mockResolvedValue(null);
      const res = await request(app)
        .put(`/api/v2/medications/injections/${UID}`)
        .set('Cookie', cookie)
        .send({ site: 'right_thigh' });
      expect(res.statusCode).toBe(404);
    });

    it('returns 400 for an invalid uuid', async () => {
      const res = await request(app)
        .put('/api/v2/medications/injections/not-a-uuid')
        .set('Cookie', cookie)
        .send({ site: 'right_thigh' });
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

  describe('Schedules', () => {
    it('adds a schedule', async () => {
      const schedule = { id: 'sched-1', schedule_type_id: 'daily' };
      vi.mocked(medicationRepository.addSchedule).mockResolvedValue(schedule);
      const res = await request(app)
        .post(`/api/v2/medications/${UID}/schedules`)
        .set('Cookie', cookie)
        .send({ schedule_type_id: 'daily', time_of_day: '08:00' });
      expect(res.statusCode).toBe(201);
      expect(res.body).toEqual(schedule);
      expect(medicationRepository.addSchedule).toHaveBeenCalledWith(
        'testUser',
        UID,
        expect.objectContaining({ schedule_type_id: 'daily' })
      );
    });

    it('returns 400 when schedule_type_id is missing on create', async () => {
      const res = await request(app)
        .post(`/api/v2/medications/${UID}/schedules`)
        .set('Cookie', cookie)
        .send({ time_of_day: '08:00' });
      expect(res.statusCode).toBe(400);
      expect(medicationRepository.addSchedule).not.toHaveBeenCalled();
    });

    it('updates a schedule, passing explicit-null discriminators through', async () => {
      const updated = { id: UID, schedule_type_id: 'daily' };
      vi.mocked(medicationRepository.updateSchedule).mockResolvedValue(updated);
      const res = await request(app)
        .put(`/api/v2/medications/schedules/${UID}`)
        .set('Cookie', cookie)
        .send({
          schedule_type_id: 'daily',
          time_of_day: '09:00',
          dose_amount: 2,
          days_of_week: null,
          interval_days: null,
          day_of_month: null,
          cycle_on_days: null,
          cycle_off_days: null,
          with_meal: null,
          prn_reason: null,
          prn_max_per_day: null,
          start_date: null,
          end_date: null,
          active: true,
        });
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(updated);
      expect(medicationRepository.updateSchedule).toHaveBeenCalledWith(
        'testUser',
        UID,
        expect.objectContaining({
          schedule_type_id: 'daily',
          time_of_day: '09:00',
          dose_amount: 2,
          days_of_week: null,
          interval_days: null,
          day_of_month: null,
          cycle_on_days: null,
          cycle_off_days: null,
          with_meal: null,
          prn_reason: null,
          prn_max_per_day: null,
          start_date: null,
          end_date: null,
          active: true,
        })
      );
    });

    it('returns 200 with the current row on an empty update', async () => {
      const current = { id: UID, schedule_type_id: 'weekly' };
      vi.mocked(medicationRepository.updateSchedule).mockResolvedValue(current);
      const res = await request(app)
        .put(`/api/v2/medications/schedules/${UID}`)
        .set('Cookie', cookie)
        .send({});
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(current);
    });

    it('returns 404 when the schedule to update is missing', async () => {
      vi.mocked(medicationRepository.updateSchedule).mockResolvedValue(null);
      const res = await request(app)
        .put(`/api/v2/medications/schedules/${UID}`)
        .set('Cookie', cookie)
        .send({ time_of_day: '09:00' });
      expect(res.statusCode).toBe(404);
    });

    it('returns 400 when updating with an out-of-range weekday', async () => {
      const res = await request(app)
        .put(`/api/v2/medications/schedules/${UID}`)
        .set('Cookie', cookie)
        .send({ days_of_week: [9] });
      expect(res.statusCode).toBe(400);
      expect(medicationRepository.updateSchedule).not.toHaveBeenCalled();
    });

    it('deletes a schedule', async () => {
      vi.mocked(medicationRepository.deleteSchedule).mockResolvedValue(true);
      const res = await request(app)
        .delete(`/api/v2/medications/schedules/${UID}`)
        .set('Cookie', cookie);
      expect(res.statusCode).toBe(204);
    });

    it('returns 404 when the schedule to delete is missing', async () => {
      vi.mocked(medicationRepository.deleteSchedule).mockResolvedValue(false);
      const res = await request(app)
        .delete(`/api/v2/medications/schedules/${UID}`)
        .set('Cookie', cookie);
      expect(res.statusCode).toBe(404);
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

    it('updates a titration step', async () => {
      const updated = { id: UID, dose_mg: 1, status: 'active' };
      vi.mocked(titrationRepository.updateStep).mockResolvedValue(updated);
      const res = await request(app)
        .put(`/api/v2/medications/titration/${UID}`)
        .set('Cookie', cookie)
        .send({ dose_mg: 1, status: 'active' });
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(updated);
      expect(titrationRepository.updateStep).toHaveBeenCalledWith(
        'testUser',
        UID,
        expect.objectContaining({ dose_mg: 1, status: 'active' })
      );
    });

    it('returns 404 when the titration step is missing', async () => {
      vi.mocked(titrationRepository.updateStep).mockResolvedValue(null);
      const res = await request(app)
        .put(`/api/v2/medications/titration/${UID}`)
        .set('Cookie', cookie)
        .send({ dose_mg: 1 });
      expect(res.statusCode).toBe(404);
    });

    it('returns 400 when updating with an invalid status', async () => {
      const res = await request(app)
        .put(`/api/v2/medications/titration/${UID}`)
        .set('Cookie', cookie)
        .send({ status: 'bogus' });
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
        anchorDate: '2026-01-01T09:00:00.000Z',
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
    it('lists medication entries merged with injections', async () => {
      const entries = [
        {
          id: 'inj-1',
          medication_id: UID,
          status: 'taken',
          entry_type: 'injection',
        },
        {
          id: 'entry-1',
          medication_id: UID,
          status: 'taken',
          entry_type: 'entry',
        },
      ];
      vi.mocked(
        medicationEntryRepository.listEntriesWithInjections
      ).mockResolvedValue(entries);
      const res = await request(app)
        .get(
          '/api/v2/medications/entries?fromDate=2026-06-01&toDate=2026-06-30'
        )
        .set('Cookie', cookie);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(entries);
      expect(
        medicationEntryRepository.listEntriesWithInjections
      ).toHaveBeenCalledWith(
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

    it('updates an entry (edit the taken-at time)', async () => {
      const updated = {
        id: UID,
        medication_id: UID,
        status: 'prn_taken',
        taken_at: '2026-06-25T08:30:00.000Z',
      };
      vi.mocked(medicationEntryRepository.updateEntry).mockResolvedValue(
        updated
      );
      const res = await request(app)
        .put(`/api/v2/medications/entries/${UID}`)
        .set('Cookie', cookie)
        .send({
          taken_at: '2026-06-25T08:30:00.000Z',
          entry_date: '2026-06-25',
        });
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(updated);
      expect(medicationEntryRepository.updateEntry).toHaveBeenCalledWith(
        'testUser',
        UID,
        expect.objectContaining({ taken_at: '2026-06-25T08:30:00.000Z' })
      );
    });

    it('returns 404 when the entry to update is missing', async () => {
      vi.mocked(medicationEntryRepository.updateEntry).mockResolvedValue(null);
      const res = await request(app)
        .put(`/api/v2/medications/entries/${UID}`)
        .set('Cookie', cookie)
        .send({ notes: 'later' });
      expect(res.statusCode).toBe(404);
    });

    it('returns 400 when updating with an invalid status', async () => {
      const res = await request(app)
        .put(`/api/v2/medications/entries/${UID}`)
        .set('Cookie', cookie)
        .send({ status: 'bogus' });
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
