import express from 'express';
import {
  clampStoredMoodValue,
  instantForDay,
  instantToDay,
  isDayString,
  MOOD_MODEL_VERSION,
  MOOD_MODEL_VERSION_HEADER,
  moodCheckinCreateBodySchema,
  moodCheckinUpdateBodySchema,
  moodRatingsBodySchema,
} from '@workspace/shared';
import moodRepository, {
  hasMoodContent,
  type MoodEntryPatch,
  type MoodRatingsInput,
} from '../models/moodRepository.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import { authenticate } from '../middleware/authMiddleware.js';
import checkPermissionMiddleware from '../middleware/checkPermissionMiddleware.js';
const router = express.Router();

// Null when the body carries an out-of-range or non-integer rating.
function parseMoodRatings(body: unknown): MoodRatingsInput | null {
  const ratings = moodRatingsBodySchema.safeParse(body ?? {});
  if (!ratings.success) return null;
  return {
    energyValue: ratings.data.energy_value,
    focusValue: ratings.data.focus_value,
  };
}

const RATINGS_MESSAGE = 'Energy and focus must be whole numbers from 1 to 5.';
const EMPTY_CHECKIN_MESSAGE =
  'A check-in needs at least one of mood, energy, focus, notes or tags.';
const DERIVED_EDIT_MESSAGE = "Moods from Garmin or imports can't be edited.";

// Clients that send X-Mood-Model-Version >= 2 get several check-ins per day;
// everyone else keeps the one-mood-per-day behaviour.
function moodModelVersion(req: express.Request): number {
  return Number(req.header(MOOD_MODEL_VERSION_HEADER)) || 1;
}
function isV2(req: express.Request): boolean {
  return moodModelVersion(req) >= MOOD_MODEL_VERSION;
}

function isHasContentViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23514' &&
    'constraint' in error &&
    error.constraint === 'mood_entries_has_content'
  );
}

// 400 body for a v2 body that fails the schema: ratings keep their message.
function invalidBodyMessage(issues: { path: PropertyKey[] }[]): string {
  const ratingField = issues.some(
    (issue) =>
      issue.path[0] === 'energy_value' || issue.path[0] === 'focus_value'
  );
  return ratingField ? RATINGS_MESSAGE : 'Invalid mood check-in.';
}

// Clamps a supplied mood onto the stored scale. Undefined when absent, null
// when it is not a number.
function clampSuppliedMood(value: unknown): number | null | undefined {
  if (value === null || value === undefined) return undefined;
  return clampStoredMoodValue(value);
}

// Where a new check-in sits in time. Without a day it takes the timestamp's
// day in the user's timezone; without a timestamp it takes now when the day is
// today and local noon otherwise, so the time never falls on another day.
async function placeCheckin(
  userId: string,
  entryDate: string | undefined,
  entryTimestamp: string | undefined
): Promise<{ entryDate: string; entryTimestamp: string | Date }> {
  const tz = await loadUserTimezone(userId);
  const day = entryDate ?? instantToDay(entryTimestamp ?? new Date(), tz);
  return {
    entryDate: day,
    entryTimestamp: entryTimestamp ?? instantForDay(day, tz),
  };
}

// Moving a check-in to another instant moves it to that instant's day in the
// user's timezone. A timestamp sent back unchanged, as an edit form that posts
// the whole check-in does, moves nothing.
async function dayOfMovedCheckin(
  userId: string,
  entryTimestamp: string | Date | undefined,
  storedTimestamp: string | Date
): Promise<string | undefined> {
  if (entryTimestamp === undefined) return undefined;
  const moved =
    new Date(entryTimestamp).getTime() !== new Date(storedTimestamp).getTime();
  if (!moved) return undefined;
  return instantToDay(entryTimestamp, await loadUserTimezone(userId));
}
router.use(authenticate);
// Mood entries are check-in data (RLS uses the check-in policy). Guard every
// endpoint with the matching permission: GET maps to checkin_read (also allows
// can_view_reports), writes require can_manage_checkin. This replaces the prior
// ad-hoc, wrong-domain ('diary') manual checks that blocked check-in delegates.
router.use(checkPermissionMiddleware('checkin'));

// --- Custom moods (user-defined mood tags). Registered before /:id routes so
// '/custom' is not captured by the GET/PUT/DELETE '/:id' handlers. ---
router.get('/custom', async (req, res, next) => {
  try {
    const list = await moodRepository.listCustomMoods(req.userId);
    res.json(list);
  } catch (error) {
    next(error);
  }
});
router.post('/custom', async (req, res, next) => {
  try {
    const { name, display_name, icon, color } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ message: 'Name is required.' });
    }
    const created = await moodRepository.createCustomMood(req.userId, {
      name,
      display_name,
      icon,
      color,
    });
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});
router.delete('/custom/:id', async (req, res, next) => {
  try {
    const deleteAllHistory = req.query.deleteAllHistory === 'true';
    const ok = await moodRepository.deleteCustomMood(
      req.userId,
      req.params.id,
      deleteAllHistory
    );
    if (!ok) return res.status(404).json({ message: 'Custom mood not found.' });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// Mood display preferences (show/hide config). Registered before /:id.
router.get('/display-preferences', async (req, res, next) => {
  try {
    const prefs = await moodRepository.getMoodDisplayPreferences(req.userId);
    res.json(prefs);
  } catch (error) {
    next(error);
  }
});
router.put('/display-preferences', async (req, res, next) => {
  try {
    const { hidden_moods } = req.body;
    const prefs = await moodRepository.upsertMoodDisplayPreferences(
      req.userId,
      Array.isArray(hidden_moods) ? hidden_moods : []
    );
    res.json(prefs);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /mood:
 *   post:
 *     summary: Create or update a mood entry
 *     tags: [Wellness & Metrics]
 *     description: >-
 *       Without a version header, saves the day's single mood entry (creating
 *       it or updating the existing one) and requires mood_value.
 *       `X-Mood-Model-Version: 2` adds a new check-in every time, allows
 *       check-ins without a mood, and needs at least one of mood_value,
 *       energy_value, focus_value, notes or mood_tags. entry_timestamp
 *       (ISO 8601) is optional and defaults to now, or to local noon when
 *       entry_date names another day; entry_date defaults to the timestamp's
 *       day in the user's timezone.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: >-
 *               No field is required by the schema. Requests without the version
 *               header require mood_value; version 2 requests need at least one
 *               of mood_value, energy_value, focus_value, notes or mood_tags.
 *             properties:
 *               mood_value:
 *                 type: integer
 *                 description: Mood intensity on a 10-100 scale; see the MoodEntry schema for the band boundaries.
 *               notes:
 *                 type: string
 *                 description: Optional notes about the mood.
 *               energy_value:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *                 nullable: true
 *                 description: Optional energy rating from 1 to 5. Omit to keep the stored value; null clears it.
 *               focus_value:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *                 nullable: true
 *                 description: Optional focus rating from 1 to 5. Omit to keep the stored value; null clears it.
 *               entry_date:
 *                 type: string
 *                 format: date
 *                 description: The date of the entry (YYYY-MM-DD).
 *               entry_timestamp:
 *                 type: string
 *                 format: date-time
 *                 description: Version 2 only. When the check-in happened; defaults to now, or to local noon of entry_date when that is not today.
 *     responses:
 *       201:
 *         description: Mood entry created or updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MoodEntry'
 *       400:
 *         description: Mood value is required (legacy), the check-in is empty (version 2), or energy or focus is not a whole number from 1 to 5.
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal server error.
 */
router.post('/', async (req, res, next) => {
  try {
    if (isV2(req)) return await createCheckin(req, res);
    const { mood_value, mood_tags, notes, entry_date } = req.body ?? {};

    const ratingsInput = parseMoodRatings(req.body);
    if (!ratingsInput) {
      return res.status(400).json({ message: RATINGS_MESSAGE });
    }
    const userId = req.userId;
    // The one-mood-per-day contract requires a mood, so an explicit null and a
    // missing field are both rejected.
    if (mood_value === null || mood_value === undefined) {
      return res.status(400).json({ message: 'Mood value is required.' });
    }
    // The column holds whole numbers on a 10-100 scale: a value outside it
    // (such as a band midpoint of 8 for Sad) is brought into range, and an
    // unparseable one is rejected here so it never reaches the column, whose
    // error would leak its name.
    const storedMoodValue = clampStoredMoodValue(mood_value);
    if (storedMoodValue === null) {
      return res.status(400).json({ message: 'Mood value must be a number.' });
    }
    // Only a newly inserted row takes this time; updating the day's mood row
    // keeps the time it already has.
    const entryTimestamp =
      typeof entry_date === 'string' && isDayString(entry_date)
        ? instantForDay(entry_date, await loadUserTimezone(userId))
        : undefined;
    // An old client saves its one mood for the day: update the day's mood row
    // in place. It never targets a mood-less (AI energy-only) check-in.
    const savedMoodEntry = await moodRepository.upsertLegacyMoodEntry(userId, {
      moodValue: storedMoodValue,
      notes,
      moodTags: Array.isArray(mood_tags) ? mood_tags : null,
      entryDate: entry_date,
      entryTimestamp,
      ...ratingsInput,
    });
    res.status(201).json(savedMoodEntry);
  } catch (error) {
    next(error);
  }
});

// v2: every POST adds a check-in; every field is optional but one.
async function createCheckin(req: express.Request, res: express.Response) {
  const parsed = moodCheckinCreateBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res
      .status(400)
      .json({ message: invalidBodyMessage(parsed.error.issues) });
  }
  const body = parsed.data;
  const moodValue = clampSuppliedMood(body.mood_value);
  if (moodValue === null) {
    return res.status(400).json({ message: 'Mood value must be a number.' });
  }
  const input = {
    moodValue,
    notes: body.notes,
    moodTags: body.mood_tags,
    energyValue: body.energy_value,
    focusValue: body.focus_value,
  };
  if (!hasMoodContent(input)) {
    return res.status(400).json({ message: EMPTY_CHECKIN_MESSAGE });
  }
  const placed = await placeCheckin(
    req.userId,
    body.entry_date,
    body.entry_timestamp
  );
  const created = await moodRepository.createCheckin(req.userId, {
    ...input,
    ...placed,
  });
  res.status(201).json(created);
}
/**
 * @swagger
 * /mood:
 *   get:
 *     summary: Get mood entries within a date range
 *     tags: [Wellness & Metrics]
 *     description: >-
 *       Retrieves mood entries for a specific user and date range. Without a
 *       version header it returns one entry per day. `X-Mood-Model-Version: 2`
 *       returns every entry, derived ones included (see `source`), newest first.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the user to fetch entries for.
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date (YYYY-MM-DD).
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: End date (YYYY-MM-DD).
 *     responses:
 *       200:
 *         description: A list of mood entries.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/MoodEntry'
 *       400:
 *         description: Missing required query parameters.
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal server error.
 */
router.get('/', async (req, res, next) => {
  try {
    const { userId, startDate, endDate } = req.query;

    const targetUserId = (userId as string | undefined) || req.userId;
    // The version header picks the shape of the body.
    res.vary(MOOD_MODEL_VERSION_HEADER);
    if (!startDate || !endDate) {
      return res
        .status(400)
        .json({ message: 'Start date and end date are required.' });
    }
    const loadEntries = isV2(req)
      ? moodRepository.getMoodEntriesByUserId
      : moodRepository.getLegacyMoodEntriesInRange;
    const moodEntries = await loadEntries(
      targetUserId,
      startDate as string,
      endDate as string
    );
    res.json(moodEntries);
  } catch (error) {
    next(error);
  }
});
/**
 * @swagger
 * /mood/{id}:
 *   get:
 *     summary: Get a mood entry by ID
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: The mood entry.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MoodEntry'
 *       404:
 *         description: Mood entry not found.
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const moodEntry = await moodRepository.getMoodEntryById(id, req.userId);
    if (!moodEntry) {
      return res.status(404).json({ message: 'Mood entry not found.' });
    }
    res.json(moodEntry);
  } catch (error) {
    next(error);
  }
});
/**
 * @swagger
 * /mood/date/{entryDate}:
 *   get:
 *     summary: Get a mood entry by date
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: entryDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: >-
 *           The mood entry for the date, or an empty object if not found.
 *           `X-Mood-Model-Version: 2` returns an array of the day's manual
 *           check-ins in time order (empty when none).
 */
router.get('/date/:entryDate', async (req, res, next) => {
  try {
    const { entryDate } = req.params;
    const { userId } = req.query;

    const targetUserId = (userId as string | undefined) || req.userId;
    // The version header picks the shape of the body.
    res.vary(MOOD_MODEL_VERSION_HEADER);
    if (isV2(req)) {
      return res.json(
        await moodRepository.getCheckinsForDate(targetUserId, entryDate)
      );
    }
    const moodEntry = await moodRepository.getLegacyMoodEntryForDate(
      targetUserId,
      entryDate
    );
    if (!moodEntry) {
      return res.status(200).json({});
    }
    res.json(moodEntry);
  } catch (error) {
    next(error);
  }
});
/**
 * @swagger
 * /mood/{id}:
 *   put:
 *     summary: Update a mood entry
 *     tags: [Wellness & Metrics]
 *     description: >-
 *       Absent fields keep their value. Without a version header a null
 *       mood_value, notes or mood_tags also keeps it. `X-Mood-Model-Version: 2`
 *       treats an explicit null as clearing the field, and 400s when that would
 *       leave the check-in empty. entry_timestamp and entry_date cannot be null.
 *       Under version 2 only manual check-ins can be edited (Garmin and import
 *       moods return 409).
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               mood_value:
 *                 type: integer
 *                 description: Mood intensity on a 10-100 scale; see the MoodEntry schema for the band boundaries.
 *               notes:
 *                 type: string
 *               entry_timestamp:
 *                 type: string
 *                 format: date-time
 *                 description: Version 2 only. Moves the check-in; entry_date follows unless sent. Sending the stored time back unchanged moves nothing.
 *               energy_value:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *                 nullable: true
 *                 description: Optional energy rating from 1 to 5. Omit to keep the stored value; null clears it.
 *               focus_value:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *                 nullable: true
 *                 description: Optional focus rating from 1 to 5. Omit to keep the stored value; null clears it.
 *     responses:
 *       200:
 *         description: Updated mood entry.
 *       400:
 *         description: Invalid mood value or energy/focus rating.
 *       404:
 *         description: Mood entry not found.
 *       409:
 *         description: Version 2 only. The entry is a Garmin or import mood, which cannot be edited.
 */
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const v2 = isV2(req);
    const patch = v2 ? v2Patch(req) : legacyPatch(req);
    if ('error' in patch) {
      return res.status(400).json({ message: patch.error });
    }
    if (v2) {
      // Owner-scoped like the update, so a missing or foreign id is a 404.
      const stored = await moodRepository.getMoodEntryById(id, req.userId);
      if (!stored) {
        return res.status(404).json({ error: 'Mood entry not found.' });
      }
      // Garmin and import moods are rewritten on the next sync, so an edit
      // would not stick.
      if (stored.source !== 'manual') {
        return res.status(409).json({ message: DERIVED_EDIT_MESSAGE });
      }
      if (patch.value.entryDate === undefined) {
        const movedTo = await dayOfMovedCheckin(
          req.userId,
          patch.value.entryTimestamp,
          stored.entry_timestamp
        );
        if (movedTo) patch.value.entryDate = movedTo;
      }
    }
    const updatedMoodEntry = await moodRepository.updateMoodEntryFields(
      id,
      req.userId,
      patch.value
    );
    // RLS scopes the UPDATE to the caller, so a missing or not-owned id returns
    // no row. Return 404 instead of a misleading empty-body 200.
    if (!updatedMoodEntry) {
      return res.status(404).json({ error: 'Mood entry not found.' });
    }
    res.json(updatedMoodEntry);
  } catch (error) {
    if (isHasContentViolation(error)) {
      return res.status(400).json({ message: EMPTY_CHECKIN_MESSAGE });
    }
    next(error);
  }
});

type PatchResult = { value: MoodEntryPatch } | { error: string };

// Old clients: a null mood, note or tag list means "keep"; ratings keep when
// absent and clear on null.
function legacyPatch(req: express.Request): PatchResult {
  const { mood_value, notes, mood_tags } = req.body ?? {};
  const ratingsInput = parseMoodRatings(req.body);
  if (!ratingsInput) return { error: RATINGS_MESSAGE };
  // Same clamp as the create path; only a supplied value is brought into range.
  const moodValue = clampSuppliedMood(mood_value);
  if (moodValue === null) return { error: 'Mood value must be a number.' };
  return {
    value: {
      ...(moodValue !== undefined && { moodValue }),
      ...(notes !== null && notes !== undefined && { notes }),
      ...(Array.isArray(mood_tags) && { moodTags: mood_tags }),
      ...ratingsInput,
    },
  };
}

// v2: an absent field is kept and an explicit null clears it. The PUT handler
// adds the day a moved check-in lands on.
function v2Patch(req: express.Request): PatchResult {
  const parsed = moodCheckinUpdateBodySchema.safeParse(req.body ?? {});
  if (!parsed.success)
    return { error: invalidBodyMessage(parsed.error.issues) };
  const body = parsed.data;
  const moodValue =
    body.mood_value === null ? null : clampSuppliedMood(body.mood_value);
  if (moodValue === null && body.mood_value !== null) {
    return { error: 'Mood value must be a number.' };
  }
  const value: MoodEntryPatch = {
    ...(moodValue !== undefined && { moodValue }),
    ...(body.notes !== undefined && { notes: body.notes }),
    ...(body.mood_tags !== undefined && { moodTags: body.mood_tags }),
    ...(body.energy_value !== undefined && { energyValue: body.energy_value }),
    ...(body.focus_value !== undefined && { focusValue: body.focus_value }),
    ...(body.entry_timestamp !== undefined && {
      entryTimestamp: body.entry_timestamp,
    }),
    ...(body.entry_date !== undefined && { entryDate: body.entry_date }),
  };
  return { value };
}
/**
 * @swagger
 * /mood/{id}:
 *   delete:
 *     summary: Delete a mood entry
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Deleted successfully.
 *       404:
 *         description: Not found.
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const deleted = await moodRepository.deleteMoodEntry(id, req.userId);
    if (deleted) {
      res.status(204).send();
    } else {
      res
        .status(404)
        .json({ message: 'Mood entry not found or not authorized to delete.' });
    }
  } catch (error) {
    next(error);
  }
});
export default router;
