import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'
import request from 'supertest';
import express from 'express';
import moodRoutes from '../routes/moodRoutes.js';
import moodRepository, { hasMoodContent } from '../models/moodRepository.js';

vi.mock('../models/moodRepository.js');

vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn().mockResolvedValue('America/New_York'),
}));

vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: vi.fn((req, res, next) => {
    req.userId = 'testUserId';
    next();
  }),
}));

vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  default: vi.fn(() => (req: any, res: any, next: any) => next()),
}));

const app = express();
app.use(express.json());
app.use('/mood', moodRoutes);

const V2 = { 'X-Mood-Model-Version': '2' };
const EMPTY_MESSAGE =
  'A check-in needs at least one of mood, energy, focus, notes or tags.';
const upsertInput = (call = 0) =>
  vi.mocked(moodRepository.upsertLegacyMoodEntry).mock.calls[call]![1];
const storedValue = () => upsertInput().moodValue;

describe('Mood Routes', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // The module is auto-mocked; the content rule is the real one.
    const actual = await vi.importActual<
      typeof import('../models/moodRepository.js')
    >('../models/moodRepository.js');
    vi.mocked(hasMoodContent).mockImplementation(actual.hasMoodContent);
    vi.mocked(moodRepository.upsertLegacyMoodEntry).mockResolvedValue({
      id: 'mood-1',
    } as never);
    vi.mocked(moodRepository.createCheckin).mockResolvedValue({
      id: 'mood-2',
      mood_value: null,
      energy_value: 2,
      entry_timestamp: '2026-10-20T14:00:00.000Z',
      source: 'manual',
    } as never);
  });

  describe('POST /mood', () => {
    it('stores a value already inside the scale untouched', async () => {
      await request(app)
        .post('/mood')
        .send({ mood_value: 70, entry_date: '2026-06-01' })
        .expect(201);

      expect(storedValue()).toBe(70);
    });

    // This route was the one path to the column that checked neither the type
    // nor the range, which is how values below the scale got in: before #2495
    // the check-in picker wrote the raw band midpoint, 8 for Sad.
    it('brings a value below the scale up to its minimum', async () => {
      await request(app)
        .post('/mood')
        .send({ mood_value: 8, entry_date: '2026-06-01' })
        .expect(201);

      // 8 and 10 are both Sad, so the day keeps the mood it meant.
      expect(storedValue()).toBe(10);
    });

    it('brings a value above the scale down to its maximum', async () => {
      await request(app)
        .post('/mood')
        .send({ mood_value: 140, entry_date: '2026-06-01' })
        .expect(201);

      expect(storedValue()).toBe(100);
    });

    it('rounds to what the integer column can hold', async () => {
      await request(app)
        .post('/mood')
        .send({ mood_value: 62.4, entry_date: '2026-06-01' })
        .expect(201);

      expect(storedValue()).toBe(62);
    });

    it('rejects a value that is not a number rather than letting the column fail', async () => {
      const res = await request(app)
        .post('/mood')
        .send({ mood_value: 'great', entry_date: '2026-06-01' })
        .expect(400);

      // The column name must not reach the response; that is what the existing
      // required-field guard above it exists to prevent.
      expect(res.body.message).toBe('Mood value must be a number.');
      expect(JSON.stringify(res.body)).not.toContain('mood_entries');
      expect(moodRepository.upsertLegacyMoodEntry).not.toHaveBeenCalled();
    });

    it('gives a row inserted for a past day local noon, not the save time', async () => {
      await request(app)
        .post('/mood')
        .send({ mood_value: 70, entry_date: '2026-06-01' })
        .expect(201);

      expect(upsertInput().entryTimestamp).toEqual(
        new Date('2026-06-01T16:00:00.000Z')
      );
    });

    it('still requires the field to be present at all', async () => {
      await request(app)
        .post('/mood')
        .send({ entry_date: '2026-06-01' })
        .expect(400);

      expect(moodRepository.upsertLegacyMoodEntry).not.toHaveBeenCalled();
    });

    describe('energy and focus', () => {
      const ratingsArg = () => {
        const { energyValue, focusValue } = ratingsInput();
        return { energyValue, focusValue };
      };
      const ratingsInput = () =>
        vi.mocked(moodRepository.upsertLegacyMoodEntry).mock.calls[0]![1];

      it('passes energy and focus through', async () => {
        await request(app)
          .post('/mood')
          .send({
            mood_value: 70,
            entry_date: '2026-10-20',
            energy_value: 4,
            focus_value: 2,
          })
          .expect(201);

        expect(ratingsArg()).toStrictEqual({ energyValue: 4, focusValue: 2 });
      });

      it('leaves ratings an older client never sent for the repository to keep', async () => {
        await request(app)
          .post('/mood')
          .send({ mood_value: 70, entry_date: '2026-10-20' })
          .expect(201);

        expect(ratingsArg()).toStrictEqual({
          energyValue: undefined,
          focusValue: undefined,
        });
      });

      it('forwards an explicit null so a cleared rating is cleared', async () => {
        await request(app)
          .post('/mood')
          .send({
            mood_value: 70,
            entry_date: '2026-10-20',
            energy_value: null,
          })
          .expect(201);

        expect(ratingsArg()).toStrictEqual({
          energyValue: null,
          focusValue: undefined,
        });
      });

      it.each([0, 6, 2.5, '4'])(
        'rejects energy %p before touching the database',
        async (bad) => {
          const res = await request(app)
            .post('/mood')
            .send({
              mood_value: 70,
              entry_date: '2026-10-20',
              energy_value: bad,
            })
            .expect(400);

          expect(res.body.message).toBe(
            'Energy and focus must be whole numbers from 1 to 5.'
          );
          expect(moodRepository.upsertLegacyMoodEntry).not.toHaveBeenCalled();
        }
      );
    });
  });

  describe('PUT /mood/:id', () => {
    const patchArg = () =>
      vi.mocked(moodRepository.updateMoodEntryFields).mock.calls[0]![2];

    beforeEach(() => {
      vi.mocked(moodRepository.updateMoodEntryFields).mockResolvedValue({
        id: 'mood-1',
      } as never);
    });

    it('clamps a supplied value the same way', async () => {
      await request(app)
        .put('/mood/mood-1')
        .send({ mood_value: 8 })
        .expect(200);

      expect(patchArg().moodValue).toBe(10);
    });

    it('leaves an omitted value for the update to keep', async () => {
      await request(app)
        .put('/mood/mood-1')
        .send({ notes: 'just a note' })
        .expect(200);

      expect(patchArg().moodValue).toBeUndefined();
    });

    it('passes only the rating that was sent', async () => {
      await request(app)
        .put('/mood/mood-1')
        .send({ focus_value: 5 })
        .expect(200);

      expect(patchArg().energyValue).toBeUndefined();
      expect(patchArg().focusValue).toBe(5);
    });

    it('rejects an out-of-range rating', async () => {
      const res = await request(app)
        .put('/mood/mood-1')
        .send({ focus_value: 9 })
        .expect(400);

      expect(res.body.message).toBe(
        'Energy and focus must be whole numbers from 1 to 5.'
      );
      expect(moodRepository.updateMoodEntryFields).not.toHaveBeenCalled();
    });

    it('treats null notes as keep for a legacy client', async () => {
      await request(app)
        .put('/mood/mood-1')
        .send({ notes: null, mood_value: 50 })
        .expect(200);

      expect(patchArg().notes).toBeUndefined();
    });

    it('returns 404 when the entry does not exist', async () => {
      vi.mocked(moodRepository.updateMoodEntryFields).mockResolvedValue(
        undefined
      );
      await request(app).put('/mood/nope').send({ notes: 'x' }).expect(404);
    });

    describe('with the v2 header', () => {
      // 10:00 on 2026-10-20 in New York.
      const storedTimestamp = '2026-10-20T14:00:00.000Z';

      beforeEach(() => {
        vi.mocked(moodRepository.getMoodEntryById).mockResolvedValue({
          id: 'mood-1',
          source: 'manual',
          entry_date: '2026-10-20',
          entry_timestamp: new Date(storedTimestamp),
        } as never);
      });

      it('clears notes on an explicit null', async () => {
        await request(app)
          .put('/mood/mood-1')
          .set(V2)
          .send({ notes: null })
          .expect(200);

        expect(patchArg()).toStrictEqual({ notes: null });
      });

      it('clears mood, tags, energy and focus on explicit nulls', async () => {
        await request(app)
          .put('/mood/mood-1')
          .set(V2)
          .send({
            mood_value: null,
            mood_tags: null,
            energy_value: null,
            focus_value: null,
          })
          .expect(200);

        expect(patchArg()).toStrictEqual({
          moodValue: null,
          moodTags: null,
          energyValue: null,
          focusValue: null,
        });
      });

      it('derives entry_date from a new timestamp in the user timezone', async () => {
        await request(app)
          .put('/mood/mood-1')
          .set(V2)
          .send({ entry_timestamp: '2026-10-21T02:30:00Z' })
          .expect(200);

        // 02:30 UTC is still the 20th in New York.
        expect(patchArg()).toStrictEqual({
          entryTimestamp: '2026-10-21T02:30:00Z',
          entryDate: '2026-10-20',
        });
      });

      it('keeps the day when the stored timestamp is sent back unchanged', async () => {
        // The same instant written with an offset, as an edit form might echo it.
        await request(app)
          .put('/mood/mood-1')
          .set(V2)
          .send({
            mood_value: 70,
            entry_timestamp: '2026-10-20T10:00:00-04:00',
          })
          .expect(200);

        expect(patchArg().entryDate).toBeUndefined();
        expect(patchArg().moodValue).toBe(70);
      });

      it('moves the day when the new time crosses midnight in the user timezone', async () => {
        await request(app)
          .put('/mood/mood-1')
          .set(V2)
          .send({ entry_timestamp: '2026-10-21T04:30:00Z' })
          .expect(200);

        // 04:30 UTC is 00:30 on the 21st in New York.
        expect(patchArg()).toStrictEqual({
          entryTimestamp: '2026-10-21T04:30:00Z',
          entryDate: '2026-10-21',
        });
      });

      it('returns 404 without updating when the check-in is missing or not yours', async () => {
        vi.mocked(moodRepository.getMoodEntryById).mockResolvedValue(undefined);
        await request(app)
          .put('/mood/nope')
          .set(V2)
          .send({ notes: 'x' })
          .expect(404);

        expect(moodRepository.getMoodEntryById).toHaveBeenCalledWith(
          'nope',
          'testUserId'
        );
        expect(moodRepository.updateMoodEntryFields).not.toHaveBeenCalled();
      });

      it('refuses to edit a Garmin mood with 409', async () => {
        vi.mocked(moodRepository.getMoodEntryById).mockResolvedValue({
          id: 'mood-g',
          source: 'garmin',
          entry_timestamp: new Date(storedTimestamp),
        } as never);
        const res = await request(app)
          .put('/mood/mood-g')
          .set(V2)
          .send({ mood_value: 70 })
          .expect(409);

        expect(res.body).toStrictEqual({
          message: "Moods from Garmin or imports can't be edited.",
        });
        expect(moodRepository.updateMoodEntryFields).not.toHaveBeenCalled();
      });

      it('trusts an explicit entry_date sent with the timestamp', async () => {
        await request(app)
          .put('/mood/mood-1')
          .set(V2)
          .send({
            entry_timestamp: '2026-10-21T02:30:00Z',
            entry_date: '2026-10-21',
          })
          .expect(200);

        expect(patchArg().entryDate).toBe('2026-10-21');
      });

      it('rejects an impossible entry_date', async () => {
        await request(app)
          .put('/mood/mood-1')
          .set(V2)
          .send({ entry_date: '2026-13-01' })
          .expect(400);

        expect(moodRepository.updateMoodEntryFields).not.toHaveBeenCalled();
      });

      it('rejects a null entry_timestamp', async () => {
        await request(app)
          .put('/mood/mood-1')
          .set(V2)
          .send({ entry_timestamp: null })
          .expect(400);

        expect(moodRepository.updateMoodEntryFields).not.toHaveBeenCalled();
      });

      it('maps the has-content constraint violation to the 400 message', async () => {
        vi.mocked(moodRepository.updateMoodEntryFields).mockRejectedValue(
          Object.assign(new Error('check violation'), {
            code: '23514',
            constraint: 'mood_entries_has_content',
          })
        );
        const res = await request(app)
          .put('/mood/mood-1')
          .set(V2)
          .send({ mood_value: null })
          .expect(400);

        expect(res.body).toStrictEqual({ message: EMPTY_MESSAGE });
      });

      it('does not swallow other check violations', async () => {
        vi.mocked(moodRepository.updateMoodEntryFields).mockRejectedValue(
          Object.assign(new Error('other'), {
            code: '23514',
            constraint: 'something_else',
          })
        );
        await request(app)
          .put('/mood/mood-1')
          .set(V2)
          .send({ mood_value: null })
          .expect(500);
      });
    });
  });

  describe('legacy clients on a day with an AI energy-only check-in', () => {
    it('saves mood twice through the legacy upsert and never creates a row', async () => {
      for (const mood_value of [60, 80]) {
        await request(app)
          .post('/mood')
          .send({ mood_value, entry_date: '2026-10-20' })
          .expect(201);
      }

      expect(moodRepository.upsertLegacyMoodEntry).toHaveBeenCalledTimes(2);
      expect(moodRepository.createCheckin).not.toHaveBeenCalled();
      expect(moodRepository.updateMoodEntryFields).not.toHaveBeenCalled();
    });
  });

  describe('POST /mood with the v2 header', () => {
    it('inserts a new check-in each time', async () => {
      for (let i = 0; i < 2; i++) {
        await request(app)
          .post('/mood')
          .set(V2)
          .send({ mood_value: 70, entry_date: '2026-10-20' })
          .expect(201);
      }

      expect(moodRepository.createCheckin).toHaveBeenCalledTimes(2);
      expect(moodRepository.upsertLegacyMoodEntry).not.toHaveBeenCalled();
    });

    it('accepts an energy-only check-in and returns the row as stored', async () => {
      const res = await request(app)
        .post('/mood')
        .set(V2)
        .send({ energy_value: 2 })
        .expect(201);

      expect(res.body.mood_value).toBeNull();
      expect(res.body.source).toBe('manual');
      expect(res.body.entry_timestamp).toBe('2026-10-20T14:00:00.000Z');
      const input = vi.mocked(moodRepository.createCheckin).mock.calls[0]![1];
      expect(input.energyValue).toBe(2);
      expect(input.moodValue).toBeUndefined();
      expect(input.entryDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('derives entry_date from the timestamp in the user timezone', async () => {
      await request(app)
        .post('/mood')
        .set(V2)
        .send({ mood_value: 50, entry_timestamp: '2026-10-21T02:30:00Z' })
        .expect(201);

      const input = vi.mocked(moodRepository.createCheckin).mock.calls[0]![1];
      expect(input.entryDate).toBe('2026-10-20');
      expect(input.entryTimestamp).toBe('2026-10-21T02:30:00Z');
    });

    it('trusts an explicit entry_date', async () => {
      await request(app)
        .post('/mood')
        .set(V2)
        .send({ mood_value: 50, entry_date: '2026-10-19' })
        .expect(201);

      expect(
        vi.mocked(moodRepository.createCheckin).mock.calls[0]![1].entryDate
      ).toBe('2026-10-19');
    });

    it('stamps a past day sent without a time at local noon', async () => {
      await request(app)
        .post('/mood')
        .set(V2)
        .send({ mood_value: 50, entry_date: '2026-06-01' })
        .expect(201);

      const input = vi.mocked(moodRepository.createCheckin).mock.calls[0]![1];
      expect(input.entryDate).toBe('2026-06-01');
      // Noon EDT, so the check-in stays on its own day.
      expect(input.entryTimestamp).toEqual(
        new Date('2026-06-01T16:00:00.000Z')
      );
    });

    it.each([
      {},
      { notes: '   ' },
      { notes: '\n\t' },
      { mood_tags: [] },
      { mood_tags: [''] },
    ])('rejects %j as an empty check-in', async (body) => {
      const res = await request(app)
        .post('/mood')
        .set(V2)
        .send(body)
        .expect(400);

      expect(res.body).toStrictEqual({ message: EMPTY_MESSAGE });
      expect(moodRepository.createCheckin).not.toHaveBeenCalled();
    });

    it('keeps rejecting a non-numeric mood and an out-of-range rating', async () => {
      const mood = await request(app)
        .post('/mood')
        .set(V2)
        .send({ mood_value: 'great' })
        .expect(400);
      expect(mood.body.message).toBe('Mood value must be a number.');

      const energy = await request(app)
        .post('/mood')
        .set(V2)
        .send({ energy_value: 9 })
        .expect(400);
      expect(energy.body.message).toBe(
        'Energy and focus must be whole numbers from 1 to 5.'
      );
      expect(moodRepository.createCheckin).not.toHaveBeenCalled();
    });

    it.each([
      { energy_value: 2, entry_date: '2026-02-30' },
      { energy_value: 2, entry_timestamp: 'not-a-date' },
    ])('rejects the impossible date in %j with 400', async (body) => {
      await request(app).post('/mood').set(V2).send(body).expect(400);
      expect(moodRepository.createCheckin).not.toHaveBeenCalled();
    });

    it('treats a header below 2 as legacy', async () => {
      await request(app)
        .post('/mood')
        .set({ 'X-Mood-Model-Version': '1' })
        .send({ energy_value: 2 })
        .expect(400);
    });
  });

  describe('GET /mood/date/:entryDate', () => {
    const row = { id: 'm', mood_value: 70, source: 'manual' };

    it('returns one object for a legacy client', async () => {
      vi.mocked(moodRepository.getLegacyMoodEntryForDate).mockResolvedValue(
        row as never
      );
      const res = await request(app).get('/mood/date/2026-10-20').expect(200);

      expect(res.body).toStrictEqual(row);
      expect(moodRepository.getCheckinsForDate).not.toHaveBeenCalled();
    });

    it('falls back to legacy for an unparseable version header', async () => {
      vi.mocked(moodRepository.getLegacyMoodEntryForDate).mockResolvedValue(
        row as never
      );
      const res = await request(app)
        .get('/mood/date/2026-10-20')
        .set({ 'X-Mood-Model-Version': 'banana' })
        .expect(200);

      expect(Array.isArray(res.body)).toBe(false);
      expect(moodRepository.getCheckinsForDate).not.toHaveBeenCalled();
    });

    it('returns {} for a legacy client when there is nothing', async () => {
      vi.mocked(moodRepository.getLegacyMoodEntryForDate).mockResolvedValue(
        undefined
      );
      const res = await request(app).get('/mood/date/2026-10-20').expect(200);

      expect(res.body).toStrictEqual({});
    });

    it('returns the time-ordered array for a v2 client', async () => {
      vi.mocked(moodRepository.getCheckinsForDate).mockResolvedValue([
        row,
        { ...row, id: 'n' },
      ] as never);
      const res = await request(app)
        .get('/mood/date/2026-10-20')
        .set(V2)
        .expect(200);

      expect(res.body).toHaveLength(2);
    });

    it('returns [] for a v2 client when there is nothing', async () => {
      vi.mocked(moodRepository.getCheckinsForDate).mockResolvedValue([]);
      const res = await request(app)
        .get('/mood/date/2026-10-20')
        .set(V2)
        .expect(200);

      expect(res.body).toStrictEqual([]);
    });

    it('varies on the version header, since it changes the body', async () => {
      vi.mocked(moodRepository.getLegacyMoodEntryForDate).mockResolvedValue(
        undefined
      );
      vi.mocked(moodRepository.getCheckinsForDate).mockResolvedValue([]);
      const legacy = await request(app).get('/mood/date/2026-10-20');
      const v2 = await request(app).get('/mood/date/2026-10-20').set(V2);

      expect(legacy.headers.vary).toContain('X-Mood-Model-Version');
      expect(v2.headers.vary).toContain('X-Mood-Model-Version');
    });
  });

  describe('GET /mood', () => {
    const query = '?startDate=2026-10-01&endDate=2026-10-31';

    it('serves one row per day to a legacy client', async () => {
      vi.mocked(moodRepository.getLegacyMoodEntriesInRange).mockResolvedValue(
        []
      );
      await request(app).get(`/mood${query}`).expect(200);

      expect(moodRepository.getLegacyMoodEntriesInRange).toHaveBeenCalledWith(
        'testUserId',
        '2026-10-01',
        '2026-10-31'
      );
      expect(moodRepository.getMoodEntriesByUserId).not.toHaveBeenCalled();
    });

    it('varies on the version header, since it changes the body', async () => {
      vi.mocked(moodRepository.getLegacyMoodEntriesInRange).mockResolvedValue(
        []
      );
      const res = await request(app).get(`/mood${query}`).expect(200);

      expect(res.headers.vary).toContain('X-Mood-Model-Version');
    });

    it('serves every row to a v2 client', async () => {
      vi.mocked(moodRepository.getMoodEntriesByUserId).mockResolvedValue([]);
      await request(app).get(`/mood${query}`).set(V2).expect(200);

      expect(moodRepository.getMoodEntriesByUserId).toHaveBeenCalledWith(
        'testUserId',
        '2026-10-01',
        '2026-10-31'
      );
      expect(moodRepository.getLegacyMoodEntriesInRange).not.toHaveBeenCalled();
    });
  });
});
