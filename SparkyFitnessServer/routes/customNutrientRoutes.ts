import express from 'express';
import customNutrientService from '../services/customNutrientService.js';
import { EnsureCatalogNutrientsBodySchema } from '../schemas/customNutrientSchemas.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { log } from '../config/logging.js';
import { SUPPLEMENT_NUTRIENT_VIEW_GROUPS } from '@workspace/shared';
const router = express.Router();
// Apply authentication middleware to all routes
router.use(authenticate);
/**
 * @swagger
 * tags:
 *   name: Nutrition & Meals
 *   description: Food database, meal planning, meal types, and nutritional tracking.
 */
/**
 * @swagger
 * components:
 *   schemas:
 *     CustomNutrient:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           description: The unique identifier for the custom nutrient.
 *         user_id:
 *           type: string
 *           format: uuid
 *           description: The ID of the user who owns the custom nutrient.
 *         name:
 *           type: string
 *           description: The name of the custom nutrient.
 *         unit:
 *           type: string
 *           description: The unit of measurement for the custom nutrient.
 *         aliases:
 *           type: array
 *           items:
 *             type: string
 *           description: Alternate nutrient names online food providers may use, matched (case-insensitively) on import.
 *         created_at:
 *           type: string
 *           format: date-time
 *           description: The date and time when the custom nutrient was created.
 *         updated_at:
 *           type: string
 *           format: date-time
 *           description: 'The date and time when the custom nutrient was last updated.'
 *       required:
 *         - id
 *         - user_id
 *         - name
 *         - unit
 */
/**
 * @swagger
 * /custom-nutrients:
 *   post:
 *     summary: Create a new custom nutrient
 *     tags: [Nutrition & Meals]
 *     description: Creates a new custom nutrient for the authenticated user.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - unit
 *             properties:
 *               name:
 *                 type: string
 *                 description: The name of the custom nutrient.
 *               unit:
 *                 type: string
 *                 description: The unit of measurement for the custom nutrient.
 *               aliases:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Alternate nutrient names online food providers may use for this nutrient.
 *     responses:
 *       201:
 *         description: The new custom nutrient was created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CustomNutrient'
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       500:
 *         description: Failed to create custom nutrient.
 */
router.post('/', async (req, res, next) => {
  try {
    const { name, unit, aliases, forSupplement } = req.body;
    // A nutrient created from the supplement picker is scoped to the goal/report views
    // rather than the settings-page default, which also includes `food_database` and
    // would put an always-0.0 column on every food row. The client sends intent, not a
    // view-group list, so it cannot pick where nutrients surface.
    const newCustomNutrient = await customNutrientService.createCustomNutrient(
      req.userId,
      {
        name,
        unit,
        aliases,
        viewGroups: forSupplement ? SUPPLEMENT_NUTRIENT_VIEW_GROUPS : undefined,
      }
    );
    res.status(201).json(newCustomNutrient);
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    log('error', `Error creating custom nutrient: ${error.message}`, {
      userId: req.userId,
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      error: error.stack,
    });
    next(error);
  }
});
/**
 * @swagger
 * /custom-nutrients/from-catalog:
 *   post:
 *     summary: Find-or-create custom nutrients from the canonical micronutrient catalog
 *     tags: [Nutrition & Meals]
 *     description: >
 *       Ensures the authenticated user has a custom nutrient for each supplied canonical
 *       catalog id, seeded with the catalog's name, unit, aliases and Daily Value.
 *       Idempotent: ids the user already has (matched by name or alias) are skipped, as are
 *       catalog entries that are already first-class nutrient columns.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - catalogIds
 *             properties:
 *               catalogIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Canonical micronutrient catalog ids (e.g. "vitamin_d", "magnesium").
 *     responses:
 *       200:
 *         description: The user's custom nutrients after seeding.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 resolved:
 *                   type: array
 *                   description: Each requested catalog id mapped to the nutrient key to store against.
 *                   items:
 *                     type: object
 *                     properties:
 *                       catalogId:
 *                         type: string
 *                       name:
 *                         type: string
 *                         description: The custom nutrient's actual name (may pre-date the catalog).
 *                       fixedField:
 *                         type: string
 *                         description: Set when the nutrient is a built-in column rather than a custom nutrient.
 *                 created:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/CustomNutrient'
 *                 nutrients:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/CustomNutrient'
 *       400:
 *         description: catalogIds must be an array of strings.
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       500:
 *         description: Failed to seed custom nutrients.
 */
router.post('/from-catalog', async (req, res, next) => {
  try {
    const body = EnsureCatalogNutrientsBodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({
        error: 'Invalid request',
        details: body.error.flatten().fieldErrors,
      });
      return;
    }
    const result = await customNutrientService.ensureCatalogNutrients(
      req.userId,
      body.data.catalogIds
    );
    res.status(200).json(result);
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    log('error', `Error seeding catalog nutrients: ${error.message}`, {
      userId: req.userId,
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      error: error.stack,
    });
    next(error);
  }
});
/**
 * @swagger
 * /custom-nutrients:
 *   get:
 *     summary: Retrieve all custom nutrients
 *     tags: [Nutrition & Meals]
 *     description: Retrieves all custom nutrients available to the authenticated user.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: A list of custom nutrients.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/CustomNutrient'
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       500:
 *         description: Failed to fetch custom nutrients.
 */
router.get('/', async (req, res, next) => {
  try {
    const customNutrients = await customNutrientService.getCustomNutrients(
      req.userId
    );
    res.status(200).json(customNutrients);
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    log('error', `Error fetching custom nutrients: ${error.message}`, {
      userId: req.userId,
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      error: error.stack,
    });
    next(error);
  }
});
/**
 * @swagger
 * /custom-nutrients/{id}:
 *   get:
 *     summary: Retrieve a single custom nutrient by ID
 *     tags: [Nutrition & Meals]
 *     description: Retrieves a single custom nutrient by its ID.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the custom nutrient to retrieve.
 *     responses:
 *       200:
 *         description: The requested custom nutrient.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CustomNutrient'
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       404:
 *         description: Custom nutrient not found.
 *       500:
 *         description: Failed to fetch custom nutrient.
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const customNutrient = await customNutrientService.getCustomNutrientById(
      req.userId,
      id
    );
    if (customNutrient) {
      res.status(200).json(customNutrient);
    } else {
      res.status(404).json({ message: 'Custom nutrient not found.' });
    }
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    log('error', `Error fetching custom nutrient by ID: ${error.message}`, {
      userId: req.userId,
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      error: error.stack,
    });
    next(error);
  }
});
/**
 * @swagger
 * /custom-nutrients/{id}:
 *   put:
 *     summary: Update a custom nutrient
 *     tags: [Nutrition & Meals]
 *     description: Updates an existing custom nutrient.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the custom nutrient to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: The new name for the custom nutrient.
 *               unit:
 *                 type: string
 *                 description: The new unit of measurement for the custom nutrient.
 *               aliases:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Alternate nutrient names online food providers may use for this nutrient.
 *     responses:
 *       200:
 *         description: The custom nutrient was updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CustomNutrient'
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       404:
 *         description: Custom nutrient not found or unauthorized.
 *       500:
 *         description: Failed to update custom nutrient.
 */
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, unit, aliases } = req.body;
    const updatedCustomNutrient =
      await customNutrientService.updateCustomNutrient(req.userId, id, {
        name,
        unit,
        aliases,
      });
    if (updatedCustomNutrient) {
      res.status(200).json(updatedCustomNutrient);
    } else {
      res
        .status(404)
        .json({ message: 'Custom nutrient not found or unauthorized.' });
    }
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    log('error', `Error updating custom nutrient: ${error.message}`, {
      userId: req.userId,
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      error: error.stack,
    });
    next(error);
  }
});
/**
 * @swagger
 * /custom-nutrients/{id}:
 *   delete:
 *     summary: Delete a custom nutrient
 *     tags: [Nutrition & Meals]
 *     description: Deletes a specific custom nutrient and performs cascading cleanup.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the custom nutrient to delete.
 *       - in: query
 *         name: deleteAllHistory
 *         schema:
 *           type: boolean
 *         description: Whether to also remove the nutrient data from past diary entries and goals.
 *     responses:
 *       200:
 *         description: Custom nutrient deleted successfully.
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       404:
 *         description: Custom nutrient not found or unauthorized.
 *       500:
 *         description: Failed to delete custom nutrient.
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const deleteAllHistory = req.query.deleteAllHistory === 'true';
    const success = await customNutrientService.deleteCustomNutrient(
      req.userId,
      id,
      deleteAllHistory
    );
    if (success) {
      res
        .status(200)
        .json({ message: 'Custom nutrient deleted successfully.' });
    } else {
      res
        .status(404)
        .json({ message: 'Custom nutrient not found or unauthorized.' });
    }
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    log('error', `Error deleting custom nutrient: ${error.message}`, {
      userId: req.userId,
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      error: error.stack,
    });
    next(error);
  }
});
export default router;
