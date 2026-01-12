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


/**
 * @swagger
 * /exercises:
 *   get:
 *     summary: Retrieve a list of exercises with search, filter, and pagination
 *     tags:
 *       - Exercise & Workouts
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: searchTerm
 *         schema:
 *           type: string
 *         description: Search term for exercise names.
 *       - in: query
 *         name: categoryFilter
 *         schema:
 *           type: string
 *         description: Filter by exercise category.
 *       - in: query
 *         name: ownershipFilter
 *         schema:
 *           type: string
 *         description: Filter by exercise ownership (e.g., 'user', 'public').
 *       - in: query
 *         name: equipmentFilter
 *         schema:
 *           type: string
 *         description: Comma-separated list of equipment to filter by.
 *       - in: query
 *         name: muscleGroupFilter
 *         schema:
 *           type: string
 *         description: Comma-separated list of muscle groups to filter by.
 *       - in: query
 *         name: currentPage
 *         schema:
 *           type: integer
 *           default: 1
 *         description: The current page number for pagination.
 *       - in: query
 *         name: itemsPerPage
 *         schema:
 *           type: integer
 *           default: 10
 *         description: The number of items to return per page.
 *     responses:
 *       200:
 *         description: A list of exercises and the total count.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 exercises:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Exercise'
 *                 totalCount:
 *                   type: integer
 *                   description: Total number of exercises matching the criteria.
 *       403:
 *         description: Forbidden, if the user does not have access.
 *       500:
 *         description: Server error.
 */
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

/**
 * @swagger
 * /exercises/suggested:
 *   get:
 *     summary: Retrieve a list of suggested exercises
 *     tags:
 *       - Exercise & Workouts
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 5
 *         description: The maximum number of suggested exercises to return.
 *     responses:
 *       200:
 *         description: A list of suggested exercises.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Exercise'
 *       403:
 *         description: Forbidden, if the user does not have access.
 *       500:
 *         description: Server error.
 */
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

/**
 * @swagger
 * /exercises/recent:
 *   get:
 *     summary: Retrieve a list of recently performed exercises
 *     tags:
 *       - Exercise & Workouts
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 5
 *         description: The maximum number of recent exercises to return.
 *     responses:
 *       200:
 *         description: A list of recent exercises.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Exercise'
 *       403:
 *         description: Forbidden, if the user does not have access.
 *       500:
 *         description: Server error.
 */
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

/**
 * @swagger
 * /exercises/top:
 *   get:
 *     summary: Retrieve a list of top exercises
 *     tags:
 *       - Exercise & Workouts
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 5
 *         description: The maximum number of top exercises to return.
 *     responses:
 *       200:
 *         description: A list of top exercises.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Exercise'
 *       403:
 *         description: Forbidden, if the user does not have access.
 *       500:
 *         description: Server error.
 */
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

/**
 * @swagger
 * /exercises/search:
 *   get:
 *     summary: Search for exercises
 *     tags:
 *       - Exercise & Workouts
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: searchTerm
 *         schema:
 *           type: string
 *         description: Term to search for in exercise names.
 *       - in: query
 *         name: equipmentFilter
 *         schema:
 *           type: string
 *         description: Comma-separated list of equipment to filter by.
 *       - in: query
 *         name: muscleGroupFilter
 *         schema:
 *           type: string
 *         description: Comma-separated list of muscle groups to filter by.
 *     responses:
 *       200:
 *         description: A list of exercises matching the search criteria.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Exercise'
 *       403:
 *         description: Forbidden, if the user does not have access.
 *       500:
 *         description: Server error.
 */
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

/**
 * @swagger
 * /exercises/search-external:
 *   get:
 *     summary: Search for exercises from external providers like Wger
 *     tags:
 *       - Exercise & Workouts
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: query
 *         schema:
 *           type: string
 *         description: Search term for external exercise names.
 *       - in: query
 *         name: providerId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the external provider (e.g., Wger).
 *       - in: query
 *         name: providerType
 *         schema:
 *           type: string
 *         required: true
 *         description: The type of the external provider.
 *       - in: query
 *         name: equipmentFilter
 *         schema:
 *           type: string
 *         description: Comma-separated list of equipment to filter by.
 *       - in: query
 *         name: muscleGroupFilter
 *         schema:
 *           type: string
 *         description: Comma-separated list of muscle groups to filter by.
 *     responses:
 *       200:
 *         description: A list of external exercises matching the search criteria.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Exercise'
 *       400:
 *         description: Bad request, if search query/filters or provider details are missing.
 *       500:
 *         description: Server error.
 */
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

/**
 * @swagger
 * /exercises/equipment:
 *   get:
 *     summary: Retrieve a list of available exercise equipment types
 *     tags:
 *       - Exercise & Workouts
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: A list of equipment types.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: string
 *       500:
 *         description: Server error.
 */
router.get('/equipment', authenticate, async (req, res, next) => {
  try {
    const equipmentTypes = await exerciseService.getAvailableEquipment();
    res.status(200).json(equipmentTypes);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /exercises/muscle-groups:
 *   get:
 *     summary: Retrieve a list of available exercise muscle groups
 *     tags:
 *       - Exercise & Workouts
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: A list of muscle groups.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: string
 *       500:
 *         description: Server error.
 */
router.get('/muscle-groups', authenticate, async (req, res, next) => {
  try {
    const muscleGroups = await exerciseService.getAvailableMuscleGroups();
    res.status(200).json(muscleGroups);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /exercises/wger-filters:
 *   get:
 *     summary: Retrieve unique Wger muscle groups and equipment not present in local database
 *     tags:
 *       - Exercise & Workouts
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: An object containing lists of unique muscle groups and equipment from Wger.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 uniqueMuscles:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: List of muscle groups from Wger not present locally.
 *                 uniqueEquipment:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: List of equipment from Wger not present locally.
 *       500:
 *         description: Server error.
 */
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

/**
 * @swagger
 * /exercises/names:
 *   get:
 *     summary: Retrieve exercise names based on muscle and equipment filters
 *     tags:
 *       - Exercise & Workouts
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: muscle
 *         schema:
 *           type: string
 *         description: Filter by muscle group.
 *       - in: query
 *         name: equipment
 *         schema:
 *           type: string
 *         description: Filter by equipment type.
 *     responses:
 *       200:
 *         description: A list of exercise names.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: string
 *       500:
 *         description: Server error.
 */

router.get('/names', authenticate, async (req, res, next) => {
  try {
    const { muscle, equipment } = req.query;
    const exerciseNames = await reportRepository.getExerciseNames(req.userId, muscle, equipment);
    res.status(200).json(exerciseNames);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /exercises/add-external:
 *   post:
 *     summary: Add an external exercise (e.g., from Wger) to the user's exercises
 *     tags:
 *       - Exercise & Workouts
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - wgerExerciseId
 *             properties:
 *               wgerExerciseId:
 *                 type: integer
 *                 description: The ID of the external exercise from Wger.
 *     responses:
 *       201:
 *         description: The newly created exercise.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Exercise'
 *       400:
 *         description: Bad request, if Wger exercise ID is missing.
 *       500:
 *         description: Server error.
 */
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

/**
 * @swagger
 * /exercises/add-nutritionix-exercise:
 *   post:
 *     summary: Add a Nutritionix exercise to the user's exercises
 *     tags:
 *       - Exercise & Workouts
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Nutritionix exercise data.
 *             example:
 *               name: "Dumbbell Bicep Curl"
 *               category: "Strength"
 *               equipment: ["Dumbbell"]
 *               muscle_groups: ["Biceps"]
 *               description: "Curl dumbbells to work biceps."
 *               external_id: "nutritionix_12345"
 *               external_provider: "Nutritionix"
 *     responses:
 *       201:
 *         description: The newly created exercise.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Exercise'
 *       400:
 *         description: Bad request, if Nutritionix exercise data is missing.
 *       500:
 *         description: Server error.
 */
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

/**
 * @swagger
 * /exercises/:
 *   post:
 *     summary: Create a new exercise
 *     tags:
 *       - Exercise & Workouts
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               exerciseData:
 *                 type: string
 *                 description: JSON string of exercise data (name, category, equipment, muscle_groups, description, instructions, is_public).
 *                 example: '{"name": "Push-up", "category": "Strength", "equipment": ["None"], "muscle_groups": ["Chest", "Triceps"], "description": "A classic bodyweight exercise.", "instructions": ["Start in a plank position.", "Lower your body until your chest nearly touches the floor.", "Push back up to the starting position."], "is_public": true}'
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Array of image files for the exercise.
 *     responses:
 *       201:
 *         description: The newly created exercise.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Exercise'
 *       400:
 *         description: Bad request, if exercise data is invalid.
 *       500:
 *         description: Server error.
 */
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
/**
 * @swagger
 * /exercises/import:
 *   post:
 *     summary: Import exercises from a CSV file
 *     tags:
 *       - Exercise & Workouts
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: CSV file containing exercise data.
 *     responses:
 *       201:
 *         description: Result of the import operation.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 importedCount:
 *                   type: integer
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: string
 *       500:
 *         description: Server error.
 */
router.post('/import', authenticate, upload.single('file'), async (req, res, next) => {
  try {
    const result = await exerciseService.importExercisesFromCSV(req.userId, req.file.path);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /exercises/import-json:
 *   post:
 *     summary: Import exercises from a JSON array
 *     tags:
 *       - Exercise & Workouts
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - exercises
 *             properties:
 *               exercises:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/Exercise'
 *                 description: Array of exercise objects to import.
 *     responses:
 *       201:
 *         description: Result of the import operation.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 importedCount:
 *                   type: integer
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: string
 *       400:
 *         description: Bad request, if data format is invalid.
 *       409:
 *         description: Conflict, if there are duplicate exercises.
 *       500:
 *         description: Server error.
 */
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
/**
 * @swagger
 * /exercises/{id}:
 *   put:
 *     summary: Update an existing exercise
 *     tags:
 *       - Exercise & Workouts
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: The ID of the exercise to update.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               exerciseData:
 *                 type: string
 *                 description: JSON string of exercise data to update (name, category, equipment, muscle_groups, description, instructions, is_public, images - existing image URLs).
 *                 example: '{"name": "Updated Push-up", "category": "Strength", "equipment": ["None"], "muscle_groups": ["Chest", "Triceps"], "description": "An updated classic bodyweight exercise.", "instructions": ["Start in a plank position.", "Lower your body until your chest nearly touches the floor.", "Push back up to the starting position."], "is_public": true, "images": ["http://example.com/old_image.jpg"]}'
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: New image files for the exercise.
 *     responses:
 *       200:
 *         description: The updated exercise object.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Exercise'
 *       400:
 *         description: Bad request, if exercise ID is invalid or data is malformed.
 *       403:
 *         description: Forbidden, if the user does not have access to update the exercise.
 *       404:
 *         description: Exercise not found.
 *       500:
 *         description: Server error.
 */
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

/**
 * @swagger
 * /exercises/{id}/deletion-impact:
 *   get:
 *     summary: Get the impact of deleting an exercise
 *     tags:
 *       - Exercise & Workouts
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: The ID of the exercise to check deletion impact for.
 *     responses:
 *       200:
 *         description: An object detailing the impact of deletion.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 canDelete:
 *                   type: boolean
 *                   description: Indicates if the exercise can be safely deleted.
 *                 linkedEntries:
 *                   type: integer
 *                   description: Number of exercise entries linked to this exercise.
 *                 message:
 *                   type: string
 *                   description: A message explaining the deletion impact.
 *       400:
 *         description: Bad request, if exercise ID is invalid.
 *       403:
 *         description: Forbidden, if the user does not have access.
 *       404:
 *         description: Exercise not found.
 *       500:
 *         description: Server error.
 */
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
/**
 * @swagger
 * /exercises/{id}:
 *   delete:
 *     summary: Delete an exercise by its ID
 *     tags:
 *       - Exercise & Workouts
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: The ID of the exercise to delete.
 *       - in: query
 *         name: forceDelete
 *         schema:
 *           type: boolean
 *           default: false
 *         description: If true, forces deletion even if there are linked entries.
 *     responses:
 *       200:
 *         description: Exercise deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: Bad request, if exercise ID is invalid.
 *       403:
 *         description: Forbidden, if the user does not have access to delete the exercise.
 *       404:
 *         description: Exercise not found.
 *       500:
 *         description: Server error.
 */
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


/**
 * @swagger
 * /exercises/needs-review:
 *   get:
 *     summary: Retrieve a list of exercises needing review
 *     tags:
 *       - Exercise & Workouts
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: A list of exercises that need review.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Exercise'
 *       500:
 *         description: Server error.
 */
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

/**
 * @swagger
 * /exercises/update-snapshot:
 *   post:
 *     summary: Update the snapshot of exercise entries for a given exercise
 *     tags:
 *       - Exercise & Workouts
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - exerciseId
 *             properties:
 *               exerciseId:
 *                 type: string
 *                 format: uuid
 *                 description: The ID of the exercise for which to update snapshots.
 *     responses:
 *       200:
 *         description: Result of the snapshot update operation.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: Bad request, if exercise ID is missing.
 *       500:
 *         description: Server error.
 */
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
/**
 * @swagger
 * /exercises/garmin-activity-details/{exerciseEntryId}:
 *   get:
 *     summary: Retrieve Garmin activity details by exercise entry ID
 *     tags:
 *       - Exercise & Workouts
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: exerciseEntryId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: The ID of the exercise entry to retrieve Garmin details for.
 *     responses:
 *       200:
 *         description: Garmin activity details.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 garminActivityId:
 *                   type: string
 *                 activityType:
 *                   type: string
 *                 duration:
 *                   type: number
 *                 calories:
 *                   type: number
 *                 distance:
 *                   type: number
 *       400:
 *         description: Bad request, if exercise entry ID is invalid.
 *       404:
 *         description: Garmin activity details not found for this exercise entry.
 *       500:
 *         description: Server error.
 */
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

/**
 * @swagger
 * /exercises/activity-details/{exerciseEntryId}/{providerName}:
 *   get:
 *     summary: Retrieve activity details by exercise entry ID and provider
 *     tags:
 *       - Exercise & Workouts
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: exerciseEntryId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: The ID of the exercise entry to retrieve activity details for.
 *       - in: path
 *         name: providerName
 *         schema:
 *           type: string
 *         required: true
 *         description: The name of the external provider (e.g., 'Garmin').
 *     responses:
 *       200:
 *         description: Activity details from the specified provider.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 activityId:
 *                   type: string
 *                 activityType:
 *                   type: string
 *                 duration:
 *                   type: number
 *                 calories:
 *                   type: number
 *                 distance:
 *                   type: number
 *       400:
 *         description: Bad request, if exercise entry ID or provider name is invalid.
 *       404:
 *         description: Activity details not found for this exercise entry and provider.
 *       500:
 *         description: Server error.
 */
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