const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const checkPermissionMiddleware = require('../middleware/checkPermissionMiddleware'); // Import the new middleware
const exerciseService = require('../services/exerciseService');
const exerciseEntryService = require('../services/exerciseEntryService'); // New import for exercise entry service
const workoutPresetService = require('../services/workoutPresetService'); // Import workoutPresetService
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { createUploadMiddleware } = require('../middleware/uploadMiddleware');

// Function to sanitize filename
const sanitizeFilename = (filename) => {
  return filename.replace(/[^a-zA-Z0-9_.-]/g, '_').substring(0, 50);
};

// Custom storage for exercise entries
const exerciseEntryStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const dir = path.join(__dirname, `../uploads/exercise_entries/${today}`);
    fs.mkdir(dir, { recursive: true }, (err) => {
      if (err) return cb(err);
      cb(null, dir);
    });
  },
  filename: (req, file, cb) => {
    const shortUuid = uuidv4().split('-')[0];
    const timestamp = Date.now();
    const sanitizedOriginalName = sanitizeFilename(file.originalname);
    const newFilename = `${shortUuid}_${timestamp}_${sanitizedOriginalName}`;
    cb(null, newFilename);
  }
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
 *                 type: number
 *           description: Details of sets performed (reps, weight, duration).
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
      const hasPermission = await require('../utils/permissionUtils').canAccessUserData(userId, 'diary', req.userId); // Permission check
      if (!hasPermission) return res.status(403).json({ error: 'Forbidden' });
    }

    const entries = await exerciseService.getExerciseEntriesByDate(req.userId, targetUserId, selectedDate);
    res.status(200).json(entries);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
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
 *       500:
 *         description: Failed to create exercise entry.
 */
router.post('/', authenticate, upload.single('image'), async (req, res, next) => {
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
          console.error("Error parsing sets from FormData:", e);
          return res.status(400).json({ error: "Invalid format for sets." });
        }
      }
    } else {
      // For application/json, the data is the body itself
      entryData = req.body;
    }
    const { exercise_id, duration_minutes, calories_burned, entry_date, notes, sets, reps, weight, workout_plan_assignment_id, distance, avg_heart_rate, activity_details } = entryData;
    if (activity_details && typeof activity_details === 'string') {
      try {
        entryData.activity_details = JSON.parse(activity_details);
      } catch (e) {
        console.error("Error parsing activity_details from FormData:", e);
        return res.status(400).json({ error: "Invalid format for activity_details." });
      }
    }

    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    if (exercise_id && !uuidRegex.test(exercise_id)) {
      return res.status(400).json({ error: 'Exercise ID must be a valid UUID.' });
    }

    let imageUrl = entryData.image_url || null;
    if (req.file) {
      // Construct the URL path for the image
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      imageUrl = `/uploads/exercise_entries/${today}/${req.file.filename}`;
    }

    let targetUserId = req.body.user_id || req.userId;
    // Check permission if explicitly creating for another user
    if (req.body.user_id && req.body.user_id !== req.userId) {
      const hasPermission = await require('../utils/permissionUtils').canAccessUserData(req.body.user_id, 'diary', req.userId); // Permission check
      if (!hasPermission) return res.status(403).json({ error: 'Forbidden' });
    }

    const newEntry = await exerciseService.createExerciseEntry(targetUserId, req.originalUserId || req.userId, {
      exercise_id,
      duration_minutes,
      calories_burned,
      entry_date,
      notes,
      sets,
      reps,
      weight,
      workout_plan_assignment_id,
      image_url: imageUrl,
      distance,
      avg_heart_rate,
      activity_details,
    });
    res.status(201).json(newEntry);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

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
 *                             type: number
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
 *       500:
 *         description: Failed to log workout from plan.
 */
router.post('/from-plan', authenticate, async (req, res, next) => {
  try {
    const { workout_plan_template_id, workout_plan_assignment_id, entry_date, exercises } = req.body;
    const loggedEntries = [];
    for (const exerciseData of exercises) {
      const newEntry = await exerciseService.createExerciseEntry(req.userId, req.originalUserId || req.userId, {
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
      });
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
    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    if (!exerciseId || !uuidRegex.test(exerciseId)) {
      return res.status(400).json({ error: 'Exercise ID is required and must be a valid UUID.' });
    }
    const history = await exerciseService.getExerciseHistory(req.userId, exerciseId, limit);
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
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  if (!id || !uuidRegex.test(id)) {
    return res.status(400).json({ error: 'Exercise Entry ID is required and must be a valid UUID.' });
  }
  try {
    const entry = await exerciseService.getExerciseEntryById(req.userId, id);
    res.status(200).json(entry);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    if (error.message === 'Exercise entry not found.') {
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
 *         description: Exercise entry not found.
 *       500:
 *         description: Failed to update exercise entry.
 */
router.put('/:id', authenticate, upload.single('image'), async (req, res, next) => {
  const { id } = req.params;
  let updateData;
  if (req.is('multipart/form-data')) {
    updateData = { ...req.body };
    if (updateData.sets && typeof updateData.sets === 'string') {
      try {
        updateData.sets = JSON.parse(updateData.sets);
      } catch (e) {
        console.error("Error parsing sets from FormData:", e);
        return res.status(400).json({ error: "Invalid format for sets." });
      }
    }
  } else {
    updateData = req.body;
  }

  if (updateData.activity_details && typeof updateData.activity_details === 'string') {
    try {
      updateData.activity_details = JSON.parse(updateData.activity_details);
    } catch (e) {
      console.error("Error parsing activity_details from FormData:", e);
      return res.status(400).json({ error: "Invalid format for activity_details." });
    }
  }

  // Extract new fields from updateData
  const { distance, avg_heart_rate } = updateData;

  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  if (!id || !uuidRegex.test(id)) {
    return res.status(400).json({ error: 'Exercise Entry ID is required and must be a valid UUID.' });
  }

  if (req.file) {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    updateData.image_url = `/uploads/exercise_entries/${today}/${req.file.filename}`;
  }

  // Add new fields to updateData
  updateData.distance = distance;
  updateData.avg_heart_rate = avg_heart_rate;
  // activity_details is already in updateData if present in req.body
  try {
    const updatedEntry = await exerciseService.updateExerciseEntry(req.userId, req.originalUserId || req.userId, id, updateData);
    res.status(200).json(updatedEntry);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    if (error.message === 'Exercise entry not found or not authorized to update.') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

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
 *         description: Exercise ID, start date, or end date is missing.
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
  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'Start date and end date are required for progress data.' });
  }

  try {
    const progressData = await exerciseService.getExerciseProgressData(req.userId, exerciseId, startDate, endDate);
    res.status(200).json(progressData);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    if (error.message === 'Exercise not found.') {
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
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  if (!id || !uuidRegex.test(id)) {
    return res.status(400).json({ error: 'Exercise Entry ID is required and must be a valid UUID.' });
  }
  try {
    const result = await exerciseService.deleteExerciseEntry(req.userId, id);
    res.status(200).json(result);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    if (error.message === 'Exercise entry not found or not authorized to delete.') {
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
 *                             type: number
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
      return res.status(400).json({ error: 'Invalid data format. Expected an array of entries.' });
    }
    const result = await exerciseEntryService.importExerciseEntriesFromCsv(req.userId, req.originalUserId || req.userId, entries);
    res.status(201).json(result);
  } catch (error) {
    if (error.status === 409) {
      return res.status(409).json({ error: error.message, details: error.details });
    }
    next(error);
  }
});

module.exports = router;
