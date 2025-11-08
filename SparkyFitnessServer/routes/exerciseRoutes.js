const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const exerciseService = require('../services/exerciseService');
const reportRepository = require('../models/reportRepository');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Setup Multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const exerciseName = req.body.exerciseData ? JSON.parse(req.body.exerciseData).name : 'unknown-exercise';
    const uploadPath = path.join(__dirname, '../uploads/exercises', exerciseName.replace(/[^a-zA-Z0-9]/g, '_'));
    fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ storage: storage });


// Endpoint to fetch exercises with search, filter, and pagination
router.get('/', authenticate, async (req, res, next) => {
  const { searchTerm, categoryFilter, ownershipFilter, equipmentFilter, muscleGroupFilter, currentPage, itemsPerPage } = req.query;
  const equipmentFilterArray = equipmentFilter ? equipmentFilter.split(',') : [];
  const muscleGroupFilterArray = muscleGroupFilter ? muscleGroupFilter.split(',') : [];
 
  try {
    const { exercises, totalCount } = await exerciseService.getExercisesWithPagination(
      req.userId,
      req.userId,
      searchTerm,
      categoryFilter,
      ownershipFilter,
      equipmentFilterArray,
      muscleGroupFilterArray,
      currentPage,
      itemsPerPage
    );
    res.status(200).json({ exercises, totalCount });
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

// Endpoint to get suggested exercises
router.get('/suggested', authenticate, async (req, res, next) => {
  const { limit } = req.query;
  try {
    const suggestedExercises = await exerciseService.getSuggestedExercises(req.userId, limit);
    res.status(200).json(suggestedExercises);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

// Endpoint to get recent exercises
router.get('/recent', authenticate, async (req, res, next) => {
  const { limit } = req.query;
  try {
    const recentExercises = await exerciseService.getRecentExercises(req.userId, limit);
    res.status(200).json(recentExercises);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

// Endpoint to get top exercises
router.get('/top', authenticate, async (req, res, next) => {
  const { limit } = req.query;
  try {
    const topExercises = await exerciseService.getTopExercises(req.userId, limit);
    res.status(200).json(topExercises);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

// Endpoint to search for exercises
router.get('/search', authenticate, async (req, res, next) => {
  const { searchTerm, equipmentFilter, muscleGroupFilter } = req.query;
  const equipmentFilterArray = equipmentFilter ? equipmentFilter.split(',') : [];
  const muscleGroupFilterArray = muscleGroupFilter ? muscleGroupFilter.split(',') : [];

  // Allow broad search for internal exercises even if searchTerm and filters are empty
  try {
    const exercises = await exerciseService.searchExercises(req.userId, searchTerm, req.userId, equipmentFilterArray, muscleGroupFilterArray);
    res.status(200).json(exercises);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

// Endpoint to search for exercises from Wger
router.get('/search-external', authenticate, async (req, res, next) => {
  const { query, providerId, providerType, equipmentFilter, muscleGroupFilter } = req.query; // Get providerId and providerType from query
  const equipmentFilterArray = equipmentFilter && equipmentFilter.length > 0 ? equipmentFilter.split(',') : [];
  const muscleGroupFilterArray = muscleGroupFilter && muscleGroupFilter.length > 0 ? muscleGroupFilter.split(',') : [];

  const hasQuery = query && query.trim().length > 0;
  const hasFilters = equipmentFilterArray.length > 0 || muscleGroupFilterArray.length > 0;

  if (!hasQuery && !hasFilters) {
    return res.status(400).json({ error: 'Search query or filters are required.' });
  }
  if (!providerId || !providerType) {
    return res.status(400).json({ error: 'Provider ID and Type are required for external search.' });
  }
  try {
    const exercises = await exerciseService.searchExternalExercises(req.userId, query, providerId, providerType, equipmentFilterArray, muscleGroupFilterArray); // Pass authenticatedUserId, query, providerId, and providerType
    res.status(200).json(exercises);
  } catch (error) {
    next(error);
  }
});

router.get('/equipment', authenticate, async (req, res, next) => {
  try {
    const equipmentTypes = await exerciseService.getAvailableEquipment();
    res.status(200).json(equipmentTypes);
  } catch (error) {
    next(error);
  }
});

router.get('/muscle-groups', authenticate, async (req, res, next) => {
  try {
    const muscleGroups = await exerciseService.getAvailableMuscleGroups();
    res.status(200).json(muscleGroups);
  } catch (error) {
    next(error);
  }
});

router.get('/wger-filters', authenticate, async (req, res, next) => {
  try {
    const wgerMuscles = await wgerService.getWgerMuscleIdMap();
    const wgerEquipment = await wgerService.getWgerEquipmentIdMap();
    
    const ourMuscles = await exerciseService.getAvailableMuscleGroups();
    const ourEquipment = await exerciseService.getAvailableEquipment();

    const uniqueMuscles = Object.keys(wgerMuscles).filter(m => !ourMuscles.includes(m));
    const uniqueEquipment = Object.keys(wgerEquipment).filter(e => !ourEquipment.includes(e));

    res.status(200).json({ uniqueMuscles, uniqueEquipment });
  } catch (error) {
    next(error);
  }
});

router.get('/names', authenticate, async (req, res, next) => {
  try {
    const { muscle, equipment } = req.query;
    const exerciseNames = await reportRepository.getExerciseNames(req.userId, muscle, equipment);
    res.status(200).json(exerciseNames);
  } catch (error) {
    next(error);
  }
});

// Endpoint to add an external exercise to user's exercises
router.post('/add-external', authenticate, async (req, res, next) => {
  const { wgerExerciseId } = req.body;
  if (!wgerExerciseId) {
    return res.status(400).json({ error: 'Wger exercise ID is required.' });
  }
  try {
    const newExercise = await exerciseService.addExternalExerciseToUserExercises(req.userId, wgerExerciseId);
    res.status(201).json(newExercise);
  } catch (error) {
    next(error);
  }
});

// Endpoint to add a Nutritionix exercise to user's exercises
router.post('/add-nutritionix-exercise', authenticate, async (req, res, next) => {
  const nutritionixExerciseData = req.body;
  if (!nutritionixExerciseData) {
    return res.status(400).json({ error: 'Nutritionix exercise data is required.' });
  }
  try {
    const newExercise = await exerciseService.addNutritionixExerciseToUserExercises(req.userId, nutritionixExerciseData);
    res.status(201).json(newExercise);
  } catch (error) {
    next(error);
  }
});


// Endpoint to fetch an exercise by ID
router.get('/:id', authenticate, async (req, res, next) => {
  const { id } = req.params;
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  if (!id || !uuidRegex.test(id)) {
    return res.status(400).json({ error: 'Exercise ID is required and must be a valid UUID.' });
  }
  try {
    const exercise = await exerciseService.getExerciseById(req.userId, id);
    res.status(200).json(exercise);
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

// Endpoint to create a new exercise
router.post('/', authenticate, upload.array('images', 10), async (req, res, next) => {
  try {
    const exerciseData = JSON.parse(req.body.exerciseData);
    const imagePaths = req.files ? req.files.map(file => `${exerciseData.name.replace(/[^a-zA-Z0-9]/g, '_')}/${file.filename}`) : [];

    const newExercise = await exerciseService.createExercise(req.userId, {
      ...exerciseData,
      user_id: req.userId,
      images: imagePaths,
    });
    res.status(201).json(newExercise);
  } catch (error) {
    next(error);
  }
});
// Endpoint to import exercises from CSV (file upload)
router.post('/import', authenticate, upload.single('file'), async (req, res, next) => {
  try {
    const result = await exerciseService.importExercisesFromCSV(req.userId, req.file.path);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

// Endpoint to import exercises from JSON (from frontend table)
router.post('/import-json', authenticate, async (req, res, next) => {
  try {
    const { exercises } = req.body;
    if (!exercises || !Array.isArray(exercises)) {
      return res.status(400).json({ error: 'Invalid data format. Expected an array of exercises.' });
    }
    const result = await exerciseService.importExercisesFromJson(req.userId, exercises);
    res.status(201).json(result);
  } catch (error) {
    if (error.status === 409) {
      return res.status(409).json({ error: error.message, duplicates: error.data.duplicates });
    }
    next(error);
  }
});

// Endpoint to update an exercise
router.put('/:id', authenticate, upload.array('images', 10), async (req, res, next) => {
  const { id } = req.params;
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  if (!id || !uuidRegex.test(id)) {
    return res.status(400).json({ error: 'Exercise ID is required and must be a valid UUID.' });
  }

  try {
    const exerciseData = JSON.parse(req.body.exerciseData);
    const newImagePaths = req.files ? req.files.map(file => `${exerciseData.name.replace(/[^a-zA-Z0-9]/g, '_')}/${file.filename}`) : [];
    
    // Combine existing images with new images
    const allImages = [...(exerciseData.images || []), ...newImagePaths];

    const updatedExercise = await exerciseService.updateExercise(req.userId, id, {
      ...exerciseData,
      ...((allImages.length > 0 || !!exerciseData.images) ? { images: allImages } : { }),
    });
    res.status(200).json(updatedExercise);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    if (error.message === 'Exercise not found or not authorized to update.') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

// Endpoint to get deletion impact for an exercise
router.get('/:id/deletion-impact', authenticate, async (req, res, next) => {
    const { id } = req.params;
    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    if (!id || !uuidRegex.test(id)) {
        return res.status(400).json({ error: 'Exercise ID is required and must be a valid UUID.' });
    }
    try {
        const impact = await exerciseService.getExerciseDeletionImpact(req.userId, id);
        res.status(200).json(impact);
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

// Endpoint to delete an exercise
router.delete('/:id', authenticate, async (req, res, next) => {
  const { id } = req.params;
  const { forceDelete } = req.query; // Get forceDelete from query parameters
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  if (!id || !uuidRegex.test(id)) {
    return res.status(400).json({ error: 'Exercise ID is required and must be a valid UUID.' });
  }
  try {
    const result = await exerciseService.deleteExercise(req.userId, id, forceDelete === "true");
    // Based on the result status, return appropriate messages and status codes
    if (result.status === "deleted") {
      res.status(200).json({ message: result.message });
    } else if (result.status === "force_deleted") {
      res.status(200).json({ message: result.message });
    } else if (result.status === "hidden") {
      res.status(200).json({ message: result.message });
    } else {
      // Fallback for unexpected status
      res.status(500).json({ error: "An unexpected error occurred during deletion." });
    }
  } catch (error) {
    if (error.message.startsWith("Forbidden")) {
      return res.status(403).json({ error: error.message });
    }
    if (error.message === "Exercise not found." || error.message === "Exercise not found or not authorized to delete.") {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});


router.get(
  "/needs-review",
  authenticate,
  async (req, res, next) => {
    try {
      const exercisesNeedingReview = await exerciseService.getExercisesNeedingReview(req.userId);
      res.status(200).json(exercisesNeedingReview);
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  "/update-snapshot",
  authenticate,
  async (req, res, next) => {
    const { exerciseId } = req.body;
    if (!exerciseId) {
      return res.status(400).json({ error: "exerciseId is required." });
    }
    try {
      const result = await exerciseService.updateExerciseEntriesSnapshot(req.userId, exerciseId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
);

// Endpoint to get Garmin activity details by exercise entry ID
router.get('/garmin-activity-details/:exerciseEntryId', authenticate, async (req, res, next) => {
  const { exerciseEntryId } = req.params;
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  if (!exerciseEntryId || !uuidRegex.test(exerciseEntryId)) {
    return res.status(400).json({ error: 'Exercise Entry ID is required and must be a valid UUID.' });
  }
  try {
    const garminDetails = await exerciseService.getGarminActivityDetailsByExerciseEntryId(req.userId, exerciseEntryId);
    if (!garminDetails) {
      return res.status(404).json({ error: 'Garmin activity details not found for this exercise entry.' });
    }
    res.status(200).json(garminDetails);
  } catch (error) {
    next(error);
  }
});

// Endpoint to get activity details by exercise entry ID and provider
router.get('/activity-details/:exerciseEntryId/:providerName', authenticate, async (req, res, next) => {
  const { exerciseEntryId, providerName } = req.params;
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  if (!exerciseEntryId || !uuidRegex.test(exerciseEntryId)) {
    return res.status(400).json({ error: 'Exercise Entry ID is required and must be a valid UUID.' });
  }
  if (!providerName) {
    return res.status(400).json({ error: 'Provider name is required.' });
  }
  try {
    const activityDetails = await exerciseService.getActivityDetailsByExerciseEntryIdAndProvider(req.userId, exerciseEntryId, providerName);
    if (!activityDetails) {
      return res.status(404).json({ error: `Activity details not found for this exercise entry and provider: ${providerName}.` });
    }
    res.status(200).json(activityDetails);
  } catch (error) {
    next(error);
  }
});

module.exports = router;