const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeAccess } = require('../middleware/authMiddleware');
const exerciseService = require('../services/exerciseService');
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

// Endpoint to fetch exercise entries for a specific user and date using query parameters
router.get('/by-date', authenticateToken, authorizeAccess('exercise_log', (req) => req.userId), async (req, res, next) => {
  const { selectedDate } = req.query;
  if (!selectedDate) {
    return res.status(400).json({ error: 'Selected date is required.' });
  }
  try {
    const entries = await exerciseService.getExerciseEntriesByDate(req.userId, req.userId, selectedDate);
    res.status(200).json(entries);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

// Endpoint to insert an exercise entry
router.post('/', authenticateToken, authorizeAccess('exercise_log'), upload.single('image'), async (req, res, next) => {
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
    const { exercise_id, duration_minutes, calories_burned, entry_date, notes, sets, reps, weight, workout_plan_assignment_id } = entryData;

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

    const newEntry = await exerciseService.createExerciseEntry(req.userId, {
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
    });
    res.status(201).json(newEntry);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

// Endpoint to log a workout from a Workout Preset
router.post('/from-preset', authenticateToken, authorizeAccess('exercise_log'), async (req, res, next) => {
  try {
    const { workout_preset_id, entry_date } = req.body;

    if (!workout_preset_id || !entry_date) {
      return res.status(400).json({ error: 'Workout preset ID and entry date are required.' });
    }

    const workoutPreset = await workoutPresetService.getWorkoutPresetById(req.userId, workout_preset_id);

    if (!workoutPreset) {
      return res.status(404).json({ error: 'Workout preset not found.' });
    }

    const loggedEntries = [];
    for (const presetExercise of workoutPreset.exercises) {
      
      const newEntry = await exerciseService.createExerciseEntry(req.userId, {
        exercise_id: presetExercise.exercise_id,
        duration_minutes: presetExercise.duration || 0, // Provide a default value if null
        calories_burned: null, // Will be calculated by service if not provided
        entry_date,
        notes: presetExercise.notes,
        sets: presetExercise.sets,
        reps: presetExercise.reps,
        weight: presetExercise.weight,
        image_url: presetExercise.image_url,
      });
      loggedEntries.push(newEntry);
    }
    res.status(201).json(loggedEntries);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

// Endpoint to log a workout from a Workout Plan
router.post('/from-plan', authenticateToken, authorizeAccess('exercise_log'), async (req, res, next) => {
  try {
    const { workout_plan_template_id, workout_plan_assignment_id, entry_date, exercises } = req.body;
    const loggedEntries = [];
    for (const exerciseData of exercises) {
      const newEntry = await exerciseService.createExerciseEntry(req.userId, {
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

// Endpoint to get history for a specific exercise
router.get('/history/:exerciseId', authenticateToken, authorizeAccess('exercise_log'), async (req, res, next) => {
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

// Endpoint to fetch an exercise entry by ID
router.get('/:id', authenticateToken, authorizeAccess('exercise_log'), async (req, res, next) => {
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

// Endpoint to fetch exercise entries for a specific user and date (path parameters)

// Endpoint to update an exercise entry
router.put('/:id', authenticateToken, authorizeAccess('exercise_log'), upload.single('image'), async (req, res, next) => {
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
  
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  if (!id || !uuidRegex.test(id)) {
    return res.status(400).json({ error: 'Exercise Entry ID is required and must be a valid UUID.' });
  }

  if (req.file) {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    updateData.image_url = `/uploads/exercise_entries/${today}/${req.file.filename}`;
  }

  try {
    const updatedEntry = await exerciseService.updateExerciseEntry(req.userId, id, updateData);
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

router.get('/progress/:exerciseId', authenticateToken, authorizeAccess('exercise_log'), async (req, res, next) => {
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

// Endpoint to delete an exercise entry
router.delete('/:id', authenticateToken, authorizeAccess('exercise_log'), async (req, res, next) => {
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

module.exports = router;