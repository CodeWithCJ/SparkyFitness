import express from 'express';
import {
  importFitResponseSchema,
  attachExerciseEntryWatchTelemetryRequestSchema,
} from '@workspace/shared';
import { authenticate } from '../middleware/authMiddleware.js';
import checkPermissionMiddleware from '../middleware/checkPermissionMiddleware.js';
import exerciseService from '../services/exerciseService.js';
import exerciseEntryService from '../services/exerciseEntryService.js';
import fitImportService from '../services/fitImportService.js';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'mult... Remove this comment to see the full error message
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { createUploadMiddleware } from '../middleware/uploadMiddleware.js';
import {
  demoGuard,
  demoUploadGuard,
} from '../middleware/demoGuardMiddleware.js';
import { canAccessUserData } from '../utils/permissionUtils.js';
import { isValidUuid } from '../utils/uuidUtils.js';
import { fileURLToPath } from 'url';
import {
  attachExerciseEntryGpsTrackRequestSchema,
  attachExerciseEntryLapsRequestSchema,
  attachExerciseEntryDistanceSeriesRequestSchema,
  setExerciseEntryDistanceRequestSchema,
  setExerciseEntryEffortRequestSchema,
  setCalorieLinkRequestSchema,
  isEntryTimeString,
} from '@workspace/shared';
import exerciseCalorieLinkService, {
  CalorieLinkError,
} from '../services/exerciseCalorieLinkService.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const baseUploadsDir = process.env.SPARKY_FITNESS_CUSTOM_UPLOADS_DIRECTORY
  ? path.resolve(process.env.SPARKY_FITNESS_CUSTOM_UPLOADS_DIRECTORY)
  : path.join(__dirname, '../uploads');
// Function to sanitize filename
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sanitizeFilename = (filename: any) => {
  return filename.replace(/[^a-zA-Z0-9_.-]/g, '_').substring(0, 50);
};
// Custom storage for exercise entries
const exerciseEntryStorage = multer.diskStorage({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  destination: (req: any, file: any, cb: any) => {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const dir = path.join(baseUploadsDir, `exercise_entries/${today}`);
    fs.mkdir(dir, { recursive: true }, (err) => {
      if (err) return cb(err);
      cb(null, dir);
    });
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filename: (req: any, file: any, cb: any) => {
    const shortUuid = uuidv4().split('-')[0];
    const timestamp = Date.now();
    const sanitizedOriginalName = sanitizeFilename(file.originalname);
    const newFilename = `${shortUuid}_${timestamp}_${sanitizedOriginalName}`;
    cb(null, newFilename);
  },
});
const upload = createUploadMiddleware(exerciseEntryStorage);
// Apply diary permission check to all exercise entry routes
router.use(checkPermissionMiddleware('diary'));
/**
 * @swagger
 * tags:
 *   name: Fitness & Workouts
 *   description: Exercise database, workout presets, and activity logging.
 */
/**
 * @swagger
 * components:
 *   schemas:
 *     ExerciseEntry:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           description: The unique identifier for the exercise entry.
 *         user_id:
 *           type: string
 *           format: uuid
 *           description: The ID of the user who owns the exercise entry.
 *         exercise_id:
 *           type: string
 *           format: uuid
 *           description: The ID of the exercise performed.
 *         duration_minutes:
 *           type: number
 *           description: The duration of the exercise in minutes.
 *         calories_burned:
 *           type: number
 *           description: The number of calories burned during the exercise.
 *         entry_date:
 *           type: string
 *           format: date
 *           description: The date of the exercise entry (YYYY-MM-DD).
 *         entry_time:
 *           type: string
 *           description: The wall-clock local start time of the exercise session (e.g., HH:MM). Nullable.
 *         notes:
 *           type: string
 *           description: Any additional notes for the exercise entry.
 *         sets:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               reps:
 *                 type: number
 *               weight:
 *                 type: number
 *               duration:
 *                 type: integer
 *                 description: Duration in seconds.
 *           description: Details of sets performed (reps, weight, duration in seconds).
 *         reps:
 *           type: number
 *           description: Total repetitions (if not detailed in sets).
 *         weight:
 *           type: number
 *           description: Weight used (if not detailed in sets).
 *         workout_plan_assignment_id:
 *           type: string
 *           format: uuid
 *           description: The ID of the workout plan assignment this entry belongs to.
 *         image_url:
 *           type: string
 *           format: url
 *           description: URL to an image associated with the exercise entry.
 *         distance:
 *           type: number
 *           description: Distance covered for cardio exercises.
 *         avg_heart_rate:
 *           type: number
 *           description: Average heart rate during the exercise.
 *         activity_details:
 *           type: object
 *           description: Additional activity-specific details (JSONB).
 *         created_at:
 *           type: string
 *           format: date-time
 *           description: The date and time when the exercise entry was created.
 *         updated_at:
 *           type: string
 *           format: date-time
 *           description: The date and time when the exercise entry was last updated.
 *       required:
 *         - user_id
 *         - exercise_id
 *         - entry_date
 */
/**
 * @swagger
 * /exercise-entries/by-date:
 *   get:
 *     summary: Get exercise entries by selected date
 *     tags: [Fitness & Workouts]
 *     description: Retrieves a list of all exercise entries for a specific date, passed as a query parameter.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: selectedDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: The date to retrieve exercise entries for (YYYY-MM-DD).
 *     responses:
 *       200:
 *         description: A list of exercise entries for the specified date.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ExerciseEntry'
 *       400:
 *         description: Selected date parameter is missing.
 *       403:
 *         description: User does not have permission to access this resource.
 *       500:
 *         description: Failed to fetch exercise entries.
 */
router.get('/by-date', authenticate, async (req, res, next) => {
  const { selectedDate } = req.query;
  if (!selectedDate) {
    return res.status(400).json({ error: 'Selected date is required.' });
  }
  try {
    const { userId } = req.query; // Check for userId param

    const targetUserId = userId || req.userId;

    if (userId && userId !== req.userId) {
      const hasPermission = await { canAccessUserData }.canAccessUserData(
        userId,
        'diary',

        req.userId
      ); // Permission check
      if (!hasPermission) return res.status(403).json({ error: 'Forbidden' });
    }
    const entries = await exerciseService.getExerciseEntriesByDate(
      req.userId,
      targetUserId,
      selectedDate
    );
    res.status(200).json(entries);
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    if (error.message.startsWith('Forbidden')) {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});
/**
 * @swagger
 * /exercise-entries:
 *   post:
 *     summary: Create a new exercise entry
 *     tags: [Fitness & Workouts]
 *     description: Adds a new exercise entry to the user's diary. Supports multipart/form-data for image uploads.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ExerciseEntry'
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               exercise_id:
 *                 type: string
 *                 format: uuid
 *               exercise_name:
 *                 type: string
 *                 description: Optional name stored on this entry. When omitted, the library exercise name is used.
 *               duration_minutes:
 *                 type: number
 *               calories_burned:
 *                 type: number
 *               entry_date:
 *                 type: string
 *                 format: date
 *               notes:
 *                 type: string
 *               sets:
 *                 type: string
 *                 description: JSON string of sets data.
 *               reps:
 *                 type: number
 *               weight:
 *                 type: number
 *               workout_plan_assignment_id:
 *                 type: string
 *                 format: uuid
 *               image:
 *                 type: string
 *                 format: binary
 *               distance:
 *                 type: number
 *               avg_heart_rate:
 *                 type: number
 *               activity_details:
 *                 type: string
 *                 description: JSON string of activity details.
 *     responses:
 *       201:
 *         description: The exercise entry was created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ExerciseEntry'
 *       400:
 *         description: Invalid request body or exercise ID.
 *       403:
 *         description: User does not have permission to create an exercise entry.
 *       404:
 *         description: Exercise not found.
 *       500:
 *         description: Failed to create exercise entry.
 */
router.post(
  '/',
  authenticate,
  demoUploadGuard,
  upload.single('image'),
  async (req, res, next) => {
    try {
      let entryData;
      if (req.is('multipart/form-data')) {
        // When data is FormData, fields are in req.body
        entryData = { ...req.body };
        // 'sets' is sent as a JSON string in FormData, so it needs to be parsed
        if (entryData.sets && typeof entryData.sets === 'string') {
          try {
            entryData.sets = JSON.parse(entryData.sets);
          } catch (e) {
            console.error('Error parsing sets from FormData:', e);
            return res.status(400).json({ error: 'Invalid format for sets.' });
          }
        }
      } else {
        // For application/json, the data is the body itself
        entryData = req.body;
      }
      const {
        exercise_id,
        exercise_name,
        duration_minutes,
        calories_burned,
        entry_date,
        notes,
        sets,
        reps,
        weight,
        workout_plan_assignment_id,
        distance,
        avg_heart_rate,
        activity_details,
      } = entryData;
      // FormData submits cleared inputs as empty strings; treat as "no time"
      const entry_time =
        entryData.entry_time === '' ? null : entryData.entry_time;
      if (
        entry_time !== null &&
        entry_time !== undefined &&
        !isEntryTimeString(entry_time)
      ) {
        return res.status(400).json({
          error: 'entry_time must be in HH:MM (24h) format.',
        });
      }
      if (activity_details && typeof activity_details === 'string') {
        try {
          entryData.activity_details = JSON.parse(activity_details);
        } catch (e) {
          console.error('Error parsing activity_details from FormData:', e);
          return res
            .status(400)
            .json({ error: 'Invalid format for activity_details.' });
        }
      }
      const uuidRegex =
        /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
      if (exercise_id && !uuidRegex.test(exercise_id)) {
        return res
          .status(400)
          .json({ error: 'Exercise ID must be a valid UUID.' });
      }
      let imageUrl = entryData.image_url || null;
      // @ts-expect-error TS(2339): Property 'file' does not exist on type 'Request<{}... Remove this comment to see the full error message
      if (req.file) {
        // Construct the URL path for the image
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        // @ts-expect-error TS(2339): Property 'file' does not exist on type 'Request<{}... Remove this comment to see the full error message
        imageUrl = `/uploads/exercise_entries/${today}/${req.file.filename}`;
      }

      const targetUserId = req.body.user_id || req.userId;
      // Check permission if explicitly creating for another user

      if (req.body.user_id && req.body.user_id !== req.userId) {
        const hasPermission = await { canAccessUserData }.canAccessUserData(
          req.body.user_id,
          'diary',

          req.userId
        ); // Permission check
        if (!hasPermission) return res.status(403).json({ error: 'Forbidden' });
      }
      let caloriesApplied = entryData.calories_applied;
      if (caloriesApplied === '') {
        caloriesApplied = null;
      } else if (caloriesApplied !== null && caloriesApplied !== undefined) {
        const applied = Number(caloriesApplied);
        if (!Number.isFinite(applied) || applied < 0) {
          return res
            .status(400)
            .json({ error: 'calories_applied must be a number of 0 or more.' });
        }
        caloriesApplied = applied;
      }
      const newEntry = await exerciseService.createExerciseEntry(
        targetUserId,

        req.originalUserId || req.userId,
        {
          exercise_id,
          exercise_name,
          duration_minutes,
          calories_burned,
          calories_applied: caloriesApplied,
          entry_date,
          entry_time,
          notes,
          sets,
          reps,
          weight,
          workout_plan_assignment_id,
          image_url: imageUrl,
          distance,
          avg_heart_rate,
          activity_details,
        },
        // Manual diary adds should always create a new entry, even when the
        // same exercise/date already has one (e.g. two workouts in a day).
        // Skip the "same exercise + date" merge-into-existing check unless
        // this entry is tied to a workout plan assignment, which has its own
        // assignment+date dedup that must still apply.
        { skipDuplicateCheck: !workout_plan_assignment_id }
      );
      res.status(201).json(newEntry);
    } catch (error) {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      if (error.message.startsWith('Forbidden')) {
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        return res.status(403).json({ error: error.message });
      }
      next(error);
    }
  }
);
/**
 * @swagger
 * /exercise-entries/from-plan:
 *   post:
 *     summary: Log a workout from a Workout Plan
 *     tags: [Fitness & Workouts]
 *     description: Logs exercises from a specified workout plan to the user's diary for a given date.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - entry_date
 *               - exercises
 *             properties:
 *               workout_plan_template_id:
 *                 type: string
 *                 format: uuid
 *                 description: The ID of the workout plan template (optional).
 *               workout_plan_assignment_id:
 *                 type: string
 *                 format: uuid
 *                 description: The ID of the workout plan assignment (optional).
 *               entry_date:
 *                 type: string
 *                 format: date
 *                 description: The date for which the workout is logged.
 *               exercises:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     exercise_id:
 *                       type: string
 *                       format: uuid
 *                     duration_minutes:
 *                       type: number
 *                     calories_burned:
 *                       type: number
 *                     notes:
 *                       type: string
 *                     sets:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           reps:
 *                             type: number
 *                           weight:
 *                             type: number
 *                           duration:
 *                             type: integer
 *                             description: Duration in seconds.
 *                     reps:
 *                       type: number
 *                     weight:
 *                       type: number
 *                     image_url:
 *                       type: string
 *                       format: url
 *                   required:
 *                     - exercise_id
 *                     - duration_minutes
 *                     - calories_burned
 *     responses:
 *       201:
 *         description: The exercise entries were created successfully from the plan.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ExerciseEntry'
 *       403:
 *         description: User does not have permission to log this workout.
 *       404:
 *         description: Exercise not found.
 *       500:
 *         description: Failed to log workout from plan.
 */
router.post('/from-plan', authenticate, async (req, res, next) => {
  try {
    const { workout_plan_assignment_id, entry_date, exercises } = req.body;
    const loggedEntries = [];
    for (const exerciseData of exercises) {
      const newEntry = await exerciseService.createExerciseEntry(
        req.userId,

        req.originalUserId || req.userId,
        {
          exercise_id: exerciseData.exercise_id,
          duration_minutes: exerciseData.duration_minutes,
          calories_burned: exerciseData.calories_burned,
          entry_date,
          notes: exerciseData.notes,
          sets: exerciseData.sets,
          reps: exerciseData.reps,
          weight: exerciseData.weight,
          workout_plan_assignment_id,
          image_url: exerciseData.image_url,
        }
      );
      loggedEntries.push(newEntry);
    }
    res.status(201).json(loggedEntries);
  } catch (error) {
    next(error);
  }
});
/**
 * @swagger
 * /exercise-entries/history/{exerciseId}:
 *   get:
 *     summary: Get history for a specific exercise
 *     tags: [Fitness & Workouts]
 *     description: Retrieves the historical exercise entries for a given exercise ID.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: exerciseId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the exercise to retrieve history for.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: The maximum number of history entries to return.
 *     responses:
 *       200:
 *         description: A list of historical exercise entries.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ExerciseEntry'
 *       400:
 *         description: Exercise ID is required and must be a valid UUID.
 *       403:
 *         description: User does not have permission to access this resource.
 *       500:
 *         description: Failed to fetch exercise history.
 */
router.get('/history/:exerciseId', authenticate, async (req, res, next) => {
  try {
    const { exerciseId } = req.params;
    const { limit } = req.query;
    const uuidRegex =
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    if (!exerciseId || !uuidRegex.test(exerciseId)) {
      return res
        .status(400)
        .json({ error: 'Exercise ID is required and must be a valid UUID.' });
    }
    const history = await exerciseService.getExerciseHistory(
      req.userId,
      exerciseId,
      limit
    );
    res.status(200).json(history);
  } catch (error) {
    next(error);
  }
});
/**
 * @swagger
 * /exercise-entries/{id}:
 *   get:
 *     summary: Get a specific exercise entry by ID
 *     tags: [Fitness & Workouts]
 *     description: Retrieves a single exercise entry by its ID.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the exercise entry to retrieve.
 *     responses:
 *       200:
 *         description: The requested exercise entry.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ExerciseEntry'
 *       400:
 *         description: Exercise Entry ID is required and must be a valid UUID.
 *       403:
 *         description: User does not have permission to access this resource.
 *       404:
 *         description: Exercise entry not found.
 *       500:
 *         description: Failed to fetch exercise entry.
 */
router.get('/:id', authenticate, async (req, res, next) => {
  const { id } = req.params;
  const uuidRegex =
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  if (!id || !uuidRegex.test(id)) {
    return res.status(400).json({
      error: 'Exercise Entry ID is required and must be a valid UUID.',
    });
  }
  try {
    const entry = await exerciseService.getExerciseEntryById(req.userId, id);
    res.status(200).json(entry);
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    if (error.message.startsWith('Forbidden')) {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      return res.status(403).json({ error: error.message });
    }
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    if (error.message === 'Exercise entry not found.') {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});
/**
 * @swagger
 * /exercise-entries/{id}:
 *   put:
 *     summary: Update an exercise entry
 *     tags: [Fitness & Workouts]
 *     description: Updates an existing exercise entry. Supports multipart/form-data for image uploads.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the exercise entry to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ExerciseEntry'
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               exercise_id:
 *                 type: string
 *                 format: uuid
 *               duration_minutes:
 *                 type: number
 *               calories_burned:
 *                 type: number
 *               entry_date:
 *                 type: string
 *                 format: date
 *               notes:
 *                 type: string
 *               sets:
 *                 type: string
 *                 description: JSON string of sets data.
 *               reps:
 *                 type: number
 *               weight:
 *                 type: number
 *               workout_plan_assignment_id:
 *                 type: string
 *                 format: uuid
 *               image:
 *                 type: string
 *                 format: binary
 *               distance:
 *                 type: number
 *               avg_heart_rate:
 *                 type: number
 *               activity_details:
 *                 type: string
 *                 description: JSON string of activity details.
 *     responses:
 *       200:
 *         description: The exercise entry was updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ExerciseEntry'
 *       400:
 *         description: Invalid request body or exercise entry ID.
 *       403:
 *         description: User does not have permission to update this exercise entry.
 *       404:
 *         description: Exercise entry or exercise not found.
 *       500:
 *         description: Failed to update exercise entry.
 */
router.put(
  '/:id',
  authenticate,
  demoUploadGuard,
  upload.single('image'),
  async (req, res, next) => {
    const { id } = req.params;
    let updateData;
    if (req.is('multipart/form-data')) {
      updateData = { ...req.body };
      if (updateData.sets && typeof updateData.sets === 'string') {
        try {
          updateData.sets = JSON.parse(updateData.sets);
        } catch (e) {
          console.error('Error parsing sets from FormData:', e);
          return res.status(400).json({ error: 'Invalid format for sets.' });
        }
      }
    } else {
      updateData = req.body;
    }
    if (
      updateData.activity_details &&
      typeof updateData.activity_details === 'string'
    ) {
      try {
        updateData.activity_details = JSON.parse(updateData.activity_details);
      } catch (e) {
        console.error('Error parsing activity_details from FormData:', e);
        return res
          .status(400)
          .json({ error: 'Invalid format for activity_details.' });
      }
    }
    if (updateData.distance === '') {
      // FormData cannot carry null; an empty string is the client's explicit
      // "clear distance" — without it the omitted field would fall back to
      // derive-from-sets/preserve instead of clearing.
      updateData.distance = null;
    }
    if (updateData.calories_applied === '') {
      // Same contract as distance: an empty string clears the override, so the
      // entry's own estimate counts again.
      updateData.calories_applied = null;
    }
    if (
      updateData.calories_applied !== null &&
      updateData.calories_applied !== undefined
    ) {
      const applied = Number(updateData.calories_applied);
      if (!Number.isFinite(applied) || applied < 0) {
        return res
          .status(400)
          .json({ error: 'calories_applied must be a number of 0 or more.' });
      }
      updateData.calories_applied = applied;
    }
    // Extract new fields from updateData
    const { distance, avg_heart_rate } = updateData;
    if (updateData.entry_time === '') {
      // FormData submits cleared inputs as empty strings; treat as "clear time"
      updateData.entry_time = null;
    }
    if (
      updateData.entry_time !== null &&
      updateData.entry_time !== undefined &&
      !isEntryTimeString(updateData.entry_time)
    ) {
      return res.status(400).json({
        error: 'entry_time must be in HH:MM (24h) format.',
      });
    }
    const uuidRegex =
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    if (!id || typeof id !== 'string' || !uuidRegex.test(id)) {
      return res.status(400).json({
        error: 'Exercise Entry ID is required and must be a valid UUID.',
      });
    }
    // Checked here because the database would reject it as a server error.
    if (
      updateData.exercise_id !== undefined &&
      updateData.exercise_id !== null &&
      (typeof updateData.exercise_id !== 'string' ||
        !uuidRegex.test(updateData.exercise_id))
    ) {
      return res
        .status(400)
        .json({ error: 'Exercise ID must be a valid UUID.' });
    }
    // @ts-expect-error TS(2339): Property 'file' does not exist on type 'Request<{ ... Remove this comment to see the full error message
    if (req.file) {
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      // @ts-expect-error TS(2339): Property 'file' does not exist on type 'Request<{ ... Remove this comment to see the full error message
      updateData.image_url = `/uploads/exercise_entries/${today}/${req.file.filename}`;
    }
    // Add new fields to updateData
    updateData.distance = distance;
    updateData.avg_heart_rate = avg_heart_rate;
    // activity_details is already in updateData if present in req.body
    try {
      const updatedEntry = await exerciseService.updateExerciseEntry(
        req.userId,

        req.originalUserId || req.userId,
        id,
        updateData
      );
      res.status(200).json(updatedEntry);
    } catch (error) {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      if (error.message.startsWith('Forbidden')) {
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        return res.status(403).json({ error: error.message });
      }
      if (
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        error.message.startsWith('Exercise entry not found')
      ) {
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        return res.status(404).json({ error: error.message });
      }
      next(error);
    }
  }
);
/**
 * @swagger
 * /exercise-entries/{id}/watch-telemetry:
 *   post:
 *     summary: Attach watch-measured telemetry to an exercise entry
 *     tags: [Fitness & Workouts]
 *     description: >
 *       Fills in avg/max heart rate, the HR-zone breakdown and measured
 *       active energy for an exercise entry that already exists (e.g. one
 *       created by a live workout started from a preset), from what a paired
 *       watch recorded. Active energy replaces the server's duration-based
 *       calorie estimate for that entry.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The exercise entry ID.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               hrSamples:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     t:
 *                       type: string
 *                       format: date-time
 *                     bpm:
 *                       type: number
 *               activeEnergyKcal:
 *                 type: number
 *                 description: Measured active energy for this entry, in kcal.
 *               strideLengthCm:
 *                 type: number
 *                 nullable: true
 *                 description: Stride length in cm; null clears it. Changes nothing else on the entry.
 *     responses:
 *       204:
 *         description: Telemetry attached.
 *       400:
 *         description: Invalid request body or exercise entry ID.
 *       404:
 *         description: Exercise entry not found.
 *       500:
 *         description: Failed to attach telemetry.
 */
router.post('/:id/watch-telemetry', authenticate, async (req, res, next) => {
  const { id } = req.params;
  const uuidRegex =
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  if (!id || typeof id !== 'string' || !uuidRegex.test(id)) {
    return res.status(400).json({
      error: 'Exercise Entry ID is required and must be a valid UUID.',
    });
  }
  const parsed = attachExerciseEntryWatchTelemetryRequestSchema.safeParse(
    req.body
  );
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }
  try {
    await exerciseEntryService.attachWatchTelemetryToExerciseEntry(
      req.userId,
      req.originalUserId || req.userId,
      id,
      parsed.data.hrSamples,
      parsed.data.activeEnergyKcal,
      parsed.data.durationMinutes,
      parsed.data.appleZones,
      parsed.data.strideLengthCm
    );
    res.status(204).send();
  } catch (error) {
    // Narrowed rather than suppressed with @ts-expect-error: the service
    // throws a plain Error with a `status` bolted on, and spelling that out
    // keeps the check honest if the shape ever changes.
    const status = (error as { status?: number }).status;
    const message = error instanceof Error ? error.message : '';
    if (status === 404 || message.startsWith('Exercise entry not found')) {
      return res.status(404).json({ error: message });
    }
    next(error);
  }
});
/**
 * @swagger
 * /exercise-entries/{id}/gps-track:
 *   post:
 *     summary: Attach a recorded GPS track to an exercise entry
 *     tags: [Fitness & Workouts]
 *     description: >
 *       Stores the route and per-lap splits of an activity recorded on the
 *       phone against an entry created beforehand, and fills in the speed,
 *       elevation and moving-time summary the track implies. Re-posting the
 *       same track replaces it.
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
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [points]
 *             properties:
 *               points:
 *                 type: array
 *                 minItems: 2
 *                 items:
 *                   type: object
 *                   required: [t, lat, lon]
 *                   properties:
 *                     t:
 *                       type: string
 *                       format: date-time
 *                     lat:
 *                       type: number
 *                     lon:
 *                       type: number
 *                     alt:
 *                       type: number
 *                     speed:
 *                       type: number
 *                     dist:
 *                       type: number
 *                     hacc:
 *                       type: number
 *               laps:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     lap_index:
 *                       type: integer
 *                     start_time:
 *                       type: string
 *                       format: date-time
 *                     end_time:
 *                       type: string
 *                       format: date-time
 *     responses:
 *       204:
 *         description: Track attached.
 *       400:
 *         description: Invalid request body or exercise entry ID.
 *       404:
 *         description: Exercise entry not found.
 *       500:
 *         description: Failed to attach the track.
 */
router.post(
  '/:id/gps-track',
  authenticate,
  demoGuard,
  async (req, res, next) => {
    const { id } = req.params;
    if (!id || typeof id !== 'string' || !isValidUuid(id)) {
      return res.status(400).json({
        error: 'Exercise Entry ID is required and must be a valid UUID.',
      });
    }
    const parsed = attachExerciseEntryGpsTrackRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.message });
    }
    try {
      await exerciseEntryService.attachGpsTrackToExerciseEntry(
        req.userId,
        req.originalUserId || req.userId,
        id,
        parsed.data
      );
      res.status(204).send();
    } catch (error) {
      const status = (error as { status?: number }).status;
      const message = error instanceof Error ? error.message : '';
      if (status === 404 || message.startsWith('Exercise entry not found')) {
        return res.status(404).json({ error: message });
      }
      if (status === 400) {
        return res.status(400).json({ error: message });
      }
      next(error);
    }
  }
);
/**
 * @swagger
 * /exercise-entries/{id}/laps:
 *   post:
 *     summary: Attach laps to an exercise entry that has no GPS track
 *     tags: [Fitness & Workouts]
 *     description: >
 *       Stores the lap windows of an activity recorded without a route, such
 *       as a treadmill run from the watch, with the distance estimated for
 *       each. The posted laps are the whole list: re-posting replaces any earlier
 *       ones. Entries with a GPS track get their laps from /gps-track instead
 *       and are refused with 409.
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
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [laps]
 *             properties:
 *               laps:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required: [lap_index, start_time, end_time]
 *                   properties:
 *                     lap_index:
 *                       type: integer
 *                     start_time:
 *                       type: string
 *                       format: date-time
 *                     end_time:
 *                       type: string
 *                       format: date-time
 *                     distance_meters:
 *                       type: number
 *                     avg_heart_rate:
 *                       type: number
 *     responses:
 *       204:
 *         description: Laps attached.
 *       400:
 *         description: Invalid request body or exercise entry ID.
 *       404:
 *         description: Exercise entry not found.
 *       409:
 *         description: The entry has a GPS track, which provides its own laps.
 */
router.post('/:id/laps', authenticate, demoGuard, async (req, res, next) => {
  const { id } = req.params;
  if (!id || typeof id !== 'string' || !isValidUuid(id)) {
    return res.status(400).json({
      error: 'Exercise Entry ID is required and must be a valid UUID.',
    });
  }
  const parsed = attachExerciseEntryLapsRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }
  try {
    await exerciseEntryService.attachLapsToExerciseEntry(
      req.userId,
      req.originalUserId || req.userId,
      id,
      parsed.data
    );
    res.status(204).send();
  } catch (error) {
    const status = (error as { status?: number }).status;
    const message = error instanceof Error ? error.message : '';
    if (status === 404 || message.startsWith('Exercise entry not found')) {
      return res.status(404).json({ error: message });
    }
    if (status === 400 || status === 409) {
      return res.status(status).json({ error: message });
    }
    next(error);
  }
});
/**
 * @swagger
 * /exercise-entries/{id}/distance-series:
 *   post:
 *     summary: Attach a distance-against-time series to an entry with no route
 *     tags: [Fitness & Workouts]
 *     description: >
 *       Stores `[active seconds, cumulative metres]` rows of a session
 *       recorded without a route (a treadmill run from the watch) so its pace
 *       can be charted. Re-posting replaces the series.
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
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [points]
 *             properties:
 *               points:
 *                 type: array
 *                 minItems: 2
 *                 items:
 *                   type: array
 *                   minItems: 2
 *                   maxItems: 2
 *                   items:
 *                     type: number
 *     responses:
 *       204:
 *         description: Series stored.
 *       400:
 *         description: Invalid request.
 *       404:
 *         description: Exercise entry not found.
 *   get:
 *     summary: The distance series stored for an entry
 *     tags: [Fitness & Workouts]
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
 *         description: "`{ points }`, null when the entry has no series."
 */
router.post(
  '/:id/distance-series',
  authenticate,
  demoGuard,
  async (req, res, next) => {
    const { id } = req.params;
    if (!id || typeof id !== 'string' || !isValidUuid(id)) {
      return res.status(400).json({
        error: 'Exercise Entry ID is required and must be a valid UUID.',
      });
    }
    const parsed = attachExerciseEntryDistanceSeriesRequestSchema.safeParse(
      req.body
    );
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.message });
    }
    try {
      await exerciseEntryService.attachDistanceSeriesToExerciseEntry(
        req.userId,
        req.originalUserId || req.userId,
        id,
        parsed.data
      );
      res.status(204).send();
    } catch (error) {
      const status = (error as { status?: number }).status;
      const message = error instanceof Error ? error.message : '';
      if (status === 404 || message.startsWith('Exercise entry not found')) {
        return res.status(404).json({ error: message });
      }
      next(error);
    }
  }
);
router.get('/:id/distance-series', authenticate, async (req, res, next) => {
  const { id } = req.params;
  if (!id || typeof id !== 'string' || !isValidUuid(id)) {
    return res.status(400).json({
      error: 'Exercise Entry ID is required and must be a valid UUID.',
    });
  }
  try {
    const points = await exerciseEntryService.getExerciseEntryDistanceSeries(
      req.originalUserId || req.userId,
      id
    );
    res.status(200).json({ points });
  } catch (error) {
    next(error);
  }
});
/**
 * @swagger
 * /exercise-entries/{id}/distance:
 *   post:
 *     summary: Set the distance of an entry that has no GPS track
 *     tags: [Fitness & Workouts]
 *     description: >
 *       Corrects the distance of a treadmill run to what the machine showed.
 *       Only the distance changes (the entry, its set and any laps, which are
 *       scaled to match); heart rate and measured energy are kept. An entry
 *       with a GPS track gets its distance from the route and is refused.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [distance_km]
 *             properties:
 *               distance_km: { type: number, exclusiveMinimum: 0, maximum: 1000 }
 *     responses:
 *       204:
 *         description: Distance updated.
 *       400:
 *         description: Invalid request body or exercise entry ID.
 *       404:
 *         description: Exercise entry not found.
 *       409:
 *         description: The entry has a GPS track, which provides its distance.
 */
router.post(
  '/:id/distance',
  authenticate,
  demoGuard,
  async (req, res, next) => {
    const { id } = req.params;
    if (!id || typeof id !== 'string' || !isValidUuid(id)) {
      return res.status(400).json({
        error: 'Exercise Entry ID is required and must be a valid UUID.',
      });
    }
    const parsed = setExerciseEntryDistanceRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.message });
    }
    try {
      await exerciseEntryService.setExerciseEntryDistance(
        req.userId,
        req.originalUserId || req.userId,
        id,
        parsed.data
      );
      res.status(204).send();
    } catch (error) {
      const status = (error as { status?: number }).status;
      const message = error instanceof Error ? error.message : '';
      if (status === 404 || message.startsWith('Exercise entry not found')) {
        return res.status(404).json({ error: message });
      }
      if (status === 400 || status === 409) {
        return res.status(status).json({ error: message });
      }
      next(error);
    }
  }
);
/**
 * @swagger
 * /exercise-entries/{id}/effort:
 *   post:
 *     summary: Set how hard a workout felt
 *     tags: [Fitness & Workouts]
 *     description: >
 *       Stores the person's 1 (easy) to 10 (maximal) rating of a workout. For
 *       an entry that belongs to a strength session the rating is stored on
 *       every entry of that session. Sending it again replaces it.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [rating]
 *             properties:
 *               rating: { type: integer, minimum: 1, maximum: 10 }
 *     responses:
 *       204:
 *         description: Effort saved.
 *       400:
 *         description: Invalid request body or exercise entry ID.
 *       404:
 *         description: Exercise entry not found.
 */
router.post('/:id/effort', authenticate, demoGuard, async (req, res, next) => {
  const { id } = req.params;
  if (!id || typeof id !== 'string' || !isValidUuid(id)) {
    return res.status(400).json({
      error: 'Exercise Entry ID is required and must be a valid UUID.',
    });
  }
  const parsed = setExerciseEntryEffortRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }
  try {
    await exerciseEntryService.setExerciseEntryEffort(
      req.userId,
      req.originalUserId || req.userId,
      id,
      parsed.data
    );
    res.status(204).send();
  } catch (error) {
    const status = (error as { status?: number }).status;
    const message = error instanceof Error ? error.message : '';
    if (status === 404 || message.startsWith('Exercise entry not found')) {
      return res.status(404).json({ error: message });
    }
    next(error);
  }
});
/**
 * @swagger
 * /exercise-entries/{id}/calorie-link/suggestions:
 *   get:
 *     summary: Synced workouts that may be the same session
 *     tags: [Fitness & Workouts]
 *     description: >
 *       For a workout logged in SparkyFitness (the entry, or any entry of its
 *       strength session), lists that day's synced workouts that could be the
 *       same session. `match` is `sets_within` when every set with a completion
 *       time falls inside the synced workout's window (plus 10 minutes),
 *       `overlap` when only the workout's own times overlap, and null when the
 *       person has to decide. Also returns the current link, if any.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Candidates and the current link.
 *       400:
 *         description: Invalid entry ID, or the entry was not logged in SparkyFitness.
 *       404:
 *         description: Exercise entry not found.
 * /exercise-entries/{id}/calorie-link:
 *   put:
 *     summary: Link a workout to a synced workout so its calories count once
 *     tags: [Fitness & Workouts]
 *     description: >
 *       Links the workout to a synced one and sets what each counts in the
 *       daily balance (`calories_applied`); both keep their own
 *       `calories_burned`. `resolution` is `sparkyfitness`, `synced`, `higher`,
 *       `lower`, `average` or `custom` (then `custom_calories` is the session's
 *       total). Replaces an earlier link of the same workout.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [synced_entry_id, resolution]
 *             properties:
 *               synced_entry_id: { type: string, format: uuid }
 *               resolution:
 *                 type: string
 *                 enum: [sparkyfitness, synced, higher, lower, average, custom]
 *               custom_calories: { type: number, minimum: 0 }
 *     responses:
 *       200:
 *         description: >
 *           Linked. `applied` lists what each entry of the workout now counts
 *           (`calories_applied`, null for its own estimate).
 *       400:
 *         description: Invalid body, or an entry that cannot be linked.
 *       404:
 *         description: Entry not found.
 *       409:
 *         description: The synced workout is linked to another workout.
 *   delete:
 *     summary: Remove a calorie link
 *     tags: [Fitness & Workouts]
 *     description: >
 *       Clears the link and the counted calories on both sides, so each counts
 *       its own estimate again.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204:
 *         description: Unlinked.
 *       404:
 *         description: Entry not found, or it is not linked.
 */
const sendCalorieLinkError = (
  error: unknown,
  res: express.Response,
  next: express.NextFunction
) => {
  if (error instanceof CalorieLinkError) {
    return res.status(error.status).json({ error: error.message });
  }
  next(error);
};

router.get(
  '/:id/calorie-link/suggestions',
  authenticate,
  async (req, res, next) => {
    const { id } = req.params;
    if (!id || typeof id !== 'string' || !isValidUuid(id)) {
      return res.status(400).json({
        error: 'Exercise Entry ID is required and must be a valid UUID.',
      });
    }
    try {
      const suggestions =
        await exerciseCalorieLinkService.getCalorieLinkSuggestions(
          req.userId,
          req.originalUserId || req.userId,
          id
        );
      res.status(200).json(suggestions);
    } catch (error) {
      sendCalorieLinkError(error, res, next);
    }
  }
);

router.put(
  '/:id/calorie-link',
  authenticate,
  demoGuard,
  async (req, res, next) => {
    const { id } = req.params;
    if (!id || typeof id !== 'string' || !isValidUuid(id)) {
      return res.status(400).json({
        error: 'Exercise Entry ID is required and must be a valid UUID.',
      });
    }
    const parsed = setCalorieLinkRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.message });
    }
    try {
      const result = await exerciseCalorieLinkService.setCalorieLink(
        req.userId,
        req.originalUserId || req.userId,
        id,
        parsed.data
      );
      res.status(200).json(result);
    } catch (error) {
      sendCalorieLinkError(error, res, next);
    }
  }
);

router.delete(
  '/:id/calorie-link',
  authenticate,
  demoGuard,
  async (req, res, next) => {
    const { id } = req.params;
    if (!id || typeof id !== 'string' || !isValidUuid(id)) {
      return res.status(400).json({
        error: 'Exercise Entry ID is required and must be a valid UUID.',
      });
    }
    try {
      await exerciseCalorieLinkService.clearCalorieLink(
        req.userId,
        req.originalUserId || req.userId,
        id
      );
      res.status(204).send();
    } catch (error) {
      sendCalorieLinkError(error, res, next);
    }
  }
);
/**
 * @swagger
 * /exercise-entries/progress/{exerciseId}:
 *   get:
 *     summary: Get progress data for a specific exercise
 *     tags: [Fitness & Workouts]
 *     description: Retrieves progress data (e.g., weight, reps over time) for a given exercise.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: exerciseId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the exercise to retrieve progress for.
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         required: true
 *         description: The start date for the progress data (YYYY-MM-DD).
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         required: true
 *         description: The end date for the progress data (YYYY-MM-DD).
 *     responses:
 *       200:
 *         description: Progress data for the specified exercise.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   date:
 *                     type: string
 *                     format: date
 *                   value:
 *                     type: number
 *       400:
 *         description: Exercise ID is missing or not a valid UUID, or start date/end date is missing.
 *       403:
 *         description: User does not have permission to access this resource.
 *       404:
 *         description: Exercise not found.
 *       500:
 *         description: Failed to fetch exercise progress data.
 */
router.get('/progress/:exerciseId', authenticate, async (req, res, next) => {
  const { exerciseId } = req.params;
  const { startDate, endDate } = req.query;
  if (!exerciseId) {
    return res.status(400).json({ error: 'Exercise ID is required.' });
  }
  if (!isValidUuid(exerciseId)) {
    // A caller can end up here with the literal path segment "null" — e.g. a
    // client deriving its exercise list from exercise_entries, whose
    // exercise_id is nullable by design for library-deleted exercises. Reject
    // it as a normal 400 rather than letting an invalid-UUID error from the
    // database surface as an unhandled 500.
    return res.status(400).json({ error: 'Invalid exercise ID.' });
  }
  if (!startDate || !endDate) {
    return res.status(400).json({
      error: 'Start date and end date are required for progress data.',
    });
  }
  try {
    const progressData = await exerciseService.getExerciseProgressData(
      req.userId,
      exerciseId,
      startDate,
      endDate
    );
    res.status(200).json(progressData);
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    if (error.message.startsWith('Forbidden')) {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      return res.status(403).json({ error: error.message });
    }
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    if (error.message === 'Exercise not found.') {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});
/**
 * @swagger
 * /exercise-entries/{id}:
 *   delete:
 *     summary: Delete an exercise entry
 *     tags: [Fitness & Workouts]
 *     description: Deletes a specific exercise entry.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the exercise entry to delete.
 *     responses:
 *       200:
 *         description: Exercise entry deleted successfully.
 *       400:
 *         description: Exercise Entry ID is required and must be a valid UUID.
 *       403:
 *         description: User does not have permission to delete this exercise entry.
 *       404:
 *         description: Exercise entry not found.
 *       500:
 *         description: Failed to delete exercise entry.
 */
router.delete('/:id', authenticate, async (req, res, next) => {
  const { id } = req.params;
  const uuidRegex =
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  if (!id || !uuidRegex.test(id)) {
    return res.status(400).json({
      error: 'Exercise Entry ID is required and must be a valid UUID.',
    });
  }
  try {
    const result = await exerciseService.deleteExerciseEntry(req.userId, id);
    res.status(200).json(result);
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    if (error.message.startsWith('Forbidden')) {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      return res.status(403).json({ error: error.message });
    }
    if (
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      error.message.startsWith('Exercise entry not found')
    ) {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});
/**
 * @swagger
 * /exercise-entries/import-history-csv:
 *   post:
 *     summary: Import historical exercise entries from CSV
 *     tags: [Fitness & Workouts]
 *     description: Imports historical exercise entries from a CSV file.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - entries
 *             properties:
 *               entries:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     exercise_id:
 *                       type: string
 *                       format: uuid
 *                     duration_minutes:
 *                       type: number
 *                     calories_burned:
 *                       type: number
 *                     entry_date:
 *                       type: string
 *                       format: date
 *                     notes:
 *                       type: string
 *                     sets:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           reps:
 *                             type: number
 *                           weight:
 *                             type: number
 *                           duration:
 *                             type: integer
 *                             description: Duration in seconds.
 *                     reps:
 *                       type: number
 *                     weight:
 *                       type: number
 *                     workout_plan_assignment_id:
 *                       type: string
 *                       format: uuid
 *                     image_url:
 *                       type: string
 *                       format: url
 *                     distance:
 *                       type: number
 *                     avg_heart_rate:
 *                       type: number
 *                     activity_details:
 *                       type: object
 *                   required:
 *                     - exercise_id
 *                     - entry_date
 *     responses:
 *       201:
 *         description: The exercise entries were imported successfully.
 *       400:
 *         description: Invalid data format. Expected an array of entries.
 *       403:
 *         description: User does not have permission to import exercise entries.
 *       409:
 *         description: Conflict, some entries could not be imported due to existing data.
 *       500:
 *         description: Failed to import exercise entries.
 */
router.post('/import-history-csv', authenticate, async (req, res, next) => {
  try {
    const { entries } = req.body;
    if (!entries || !Array.isArray(entries)) {
      return res
        .status(400)
        .json({ error: 'Invalid data format. Expected an array of entries.' });
    }
    const result = await exerciseEntryService.importExerciseEntriesFromCsv(
      req.userId,

      req.originalUserId || req.userId,
      entries
    );
    res.status(201).json(result);
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    if (error.status === 409) {
      return (
        res
          .status(409)
          // @ts-expect-error TS(2571): Object is of type 'unknown'.
          .json({ error: error.message, details: error.details })
      );
    }
    next(error);
  }
});
// Memory storage: FIT files are decoded from the buffer and never hit disk.
// Real activity files are ~0.1-5MB; the limits bound worst-case buffering.
// No fileFilter — a filter error aborts the whole batch, so non-FIT files are
// rejected per file inside the service instead.
const fitUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 10 },
});
/**
 * @swagger
 * /exercise-entries/import-fit:
 *   post:
 *     summary: Import Garmin FIT activity files as exercise diary entries.
 *     description: >
 *       Decodes up to 10 uploaded .fit files and creates one exercise entry
 *       per file, including full activity details for reports. Re-uploading a
 *       file updates the existing entry. Per-file failures are reported as
 *       rows in the results array; the response is 200 unless the request
 *       itself is invalid.
 *     tags:
 *       - Exercise Entries
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       200:
 *         description: Per-file import results.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 created:
 *                   type: number
 *                 updated:
 *                   type: number
 *                 failed:
 *                   type: number
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       fileName:
 *                         type: string
 *                       status:
 *                         type: string
 *                         enum: [created, updated, failed]
 *                       reason:
 *                         type: string
 *                       warning:
 *                         type: string
 *                       exerciseEntryId:
 *                         type: string
 *                       entryDate:
 *                         type: string
 *                         format: date
 *                       activityName:
 *                         type: string
 *                       sport:
 *                         type: string
 *       400:
 *         description: No files uploaded, or the upload exceeded size/count limits.
 *       403:
 *         description: Demo mode accounts cannot import FIT workout files.
 *       500:
 *         description: Failed to import FIT files.
 */
router.post('/import-fit', authenticate, demoGuard, (req, res, next) => {
  fitUpload.array('files', 10)(req, res, async (uploadError: unknown) => {
    if (uploadError) {
      if (uploadError instanceof multer.MulterError) {
        return res.status(400).json({
          error: `Upload rejected: ${(uploadError as Error).message}`,
        });
      }
      return next(uploadError);
    }
    try {
      // @ts-expect-error TS(2339): Property 'files' does not exist on type 'Request<{}... Remove this comment to see the full error message
      const files = req.files;
      if (!files || !Array.isArray(files) || files.length === 0) {
        return res.status(400).json({
          error:
            'No files uploaded. Attach one or more .fit files in the "files" field.',
        });
      }
      const result = await fitImportService.importFitFiles(
        req.userId,
        req.originalUserId || req.userId,
        files
      );
      res.status(200).json(importFitResponseSchema.parse(result));
    } catch (error) {
      next(error);
    }
  });
});
export default router;
