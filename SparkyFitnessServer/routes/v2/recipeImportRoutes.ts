import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import { ZodError } from 'zod';
import { authenticate } from '../../middleware/authMiddleware.js';
import { createRequireSelfActor } from '../../middleware/requireSelfMiddleware.js';
import service from '../../services/recipeImportService.js';
import { RecipeImportError } from '../../services/recipeImportMath.js';
import {
  recipeImportPreviewRequestSchema,
  recipeImportSaveRequestSchema,
  recipeImportSuggestionRequestSchema,
  recipeImportBrowseQuerySchema,
  recipeImportProviderParamsSchema,
  recipeImportMealParamsSchema,
  recipeImportSyncBodySchema,
} from '../../schemas/recipeImportSchemas.js';
const router = express.Router();
router.use(authenticate);
router.use(
  createRequireSelfActor({
    action: 'recipe import or nutrition sync',
    message:
      'Recipe import and nutrition sync are only available for your own account.',
  })
);
const actor = (req: Request) =>
  req.originalUserId || req.authenticatedUserId || req.userId;
/**
 * @swagger
 * /v2/recipe-imports/mealie/{providerId}/recipes:
 *   get:
 *     summary: Browse a personal Mealie provider without importing foods
 *     tags: [Foods & Nutrition]
 *     security: [{cookieAuth: []}]
 *     parameters:
 *       - {in: path, name: providerId, required: true, schema: {type: string, format: uuid}}
 *       - {in: query, name: search, schema: {type: string}}
 *       - {in: query, name: page, schema: {type: integer, minimum: 1}}
 *     responses:
 *       200: {description: Recipe summaries and pagination}
 *       403: {description: Owner-only provider access required}
 *       502: {description: Provider unavailable}
 * /v2/recipe-imports/mealie/preview:
 *   post:
 *     summary: Preview original Mealie ingredients and reusable confirmed mappings
 *     tags: [Foods & Nutrition]
 *     security: [{cookieAuth: []}]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: {type: object, required: [providerId, recipeSlug], properties: {providerId: {type: string, format: uuid}, recipeSlug: {type: string}}}
 *     responses:
 *       200: {description: Source fingerprint and every ingredient with review issues}
 *       400: {description: Invalid request}
 *       403: {description: Owner-only}
 * /v2/recipe-imports/mealie/suggest:
 *   post:
 *     summary: Retrieve real food candidates and optional unconfirmed AI selections
 *     description: Never creates foods or meals. External matches must use the existing provider detail and food import flow before saving local mappings. Shared RecipeImportSuggestionRequest is the complete request contract.
 *     tags: [Foods & Nutrition]
 *     security: [{cookieAuth: []}]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: {$ref: '#/components/schemas/RecipeImportSuggestionRequest'}
 *     responses:
 *       200: {description: Actual candidate identities, nutrition and optional selected candidate IDs}
 *       409: {description: Source changed; preview again}
 *       422: {description: No active AI configuration}
 * /v2/recipe-imports/mealie/save:
 *   post:
 *     summary: Save a reviewed ingredient-based meal and private provenance atomically
 *     description: RecipeImportSaveRequest accepts confirmed local foodId/variantId quantities only. The server reads authoritative nutrition. Optional finishedWeightGrams changes the meal serving denominator, never ingredient nutrition.
 *     tags: [Foods & Nutrition]
 *     security: [{cookieAuth: []}]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: {$ref: '#/components/schemas/RecipeImportSaveRequest'}
 *     responses:
 *       201: {description: Meal ID, source provenance, batch nutrition and portion denominator}
 *       409: {description: Mealie recipe changed}
 *       422: {description: Incomplete mappings, incompatible units or linked recipe}
 * /v2/recipe-imports/{mealId}/source:
 *   get:
 *     summary: Read owner-only recipe provenance for an imported meal
 *     tags: [Foods & Nutrition]
 *     security: [{cookieAuth: []}]
 *     parameters:
 *       - {in: path, name: mealId, required: true, schema: {type: string, format: uuid}}
 *     responses:
 *       200: {description: RecipeImportSource with sync eligibility and last confirmed sync time}
 *       404: {description: No readable import source}
 * /v2/recipe-imports/{mealId}/sync-preview:
 *   get:
 *     summary: Review current saved-meal nutrition per current Mealie serving without writing
 *     tags: [Foods & Nutrition]
 *     security: [{cookieAuth: []}]
 *     parameters:
 *       - {in: path, name: mealId, required: true, schema: {type: string, format: uuid}}
 *     responses:
 *       200:
 *         description: Current and proposed nutrition, source-change warning and confirmation fingerprint
 *         content:
 *           application/json:
 *             schema: {$ref: '#/components/schemas/RecipeImportSyncPreview'}
 *       403: {description: Owner-only}
 *       422: {description: Incomplete saved nutrition or invalid current Mealie servings}
 * /v2/recipe-imports/{mealId}/sync-nutrition:
 *   post:
 *     summary: Confirm nutrition writeback per current Mealie serving
 *     description: Re-reads the source and current saved meal; a reviewed confirmationFingerprint allows source or saved-meal edits without reimporting, but rejects changes since that preview. Older empty-body requests require an unchanged source. PATCHes only nutrition, retaining unknown existing nutrients. A remote edit between validation and PATCH cannot be atomically locked by Mealie.
 *     tags: [Foods & Nutrition]
 *     security: [{cookieAuth: []}]
 *     parameters:
 *       - {in: path, name: mealId, required: true, schema: {type: string, format: uuid}}
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: {$ref: '#/components/schemas/RecipeImportSyncRequest'}
 *     responses:
 *       200: {description: Confirmed update and refreshed provenance}
 *       409: {description: Preview changed or a legacy client needs source-change confirmation}
 *       422: {description: Incomplete saved nutrition or invalid current Mealie servings}
 *       502: {description: Mealie did not confirm the update}
 */
router.get('/mealie/:providerId/recipes', async (req, res, next) => {
  try {
    const { providerId } = recipeImportProviderParamsSchema.parse(req.params);
    const query = recipeImportBrowseQuerySchema.parse(req.query);
    res.json(
      await service.browse(
        req.userId,
        actor(req),
        providerId,
        query.search,
        query.page
      )
    );
  } catch (error) {
    next(error);
  }
});
router.post('/mealie/preview', async (req, res, next) => {
  try {
    res.json(
      await service.preview(
        req.userId,
        actor(req),
        recipeImportPreviewRequestSchema.parse(req.body)
      )
    );
  } catch (error) {
    next(error);
  }
});
router.post('/mealie/suggest', async (req, res, next) => {
  try {
    res.json(
      await service.suggest(
        req.userId,
        actor(req),
        recipeImportSuggestionRequestSchema.parse(req.body)
      )
    );
  } catch (error) {
    next(error);
  }
});
router.post('/mealie/save', async (req, res, next) => {
  try {
    res
      .status(201)
      .json(
        await service.save(
          req.userId,
          actor(req),
          recipeImportSaveRequestSchema.parse(req.body)
        )
      );
  } catch (error) {
    next(error);
  }
});
router.get('/:mealId/source', async (req, res, next) => {
  try {
    res.json(
      await service.getSource(
        req.userId,
        actor(req),
        recipeImportMealParamsSchema.parse(req.params).mealId
      )
    );
  } catch (error) {
    next(error);
  }
});
router.post('/:mealId/sync-nutrition', async (req, res, next) => {
  try {
    const input = recipeImportSyncBodySchema.parse(req.body ?? {});
    res.json(
      await service.syncNutrition(
        req.userId,
        actor(req),
        recipeImportMealParamsSchema.parse(req.params).mealId,
        input
      )
    );
  } catch (error) {
    next(error);
  }
});
router.get('/:mealId/sync-preview', async (req, res, next) => {
  try {
    res.json(
      await service.previewNutritionSync(
        req.userId,
        actor(req),
        recipeImportMealParamsSchema.parse(req.params).mealId
      )
    );
  } catch (error) {
    next(error);
  }
});
router.use(
  (error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (error instanceof ZodError) {
      res.status(400).json({
        error: 'Invalid recipe import request.',
        code: 'INVALID_REQUEST',
        details: error.flatten(),
      });
      return;
    }
    if (error instanceof RecipeImportError) {
      res.status(error.status).json({ error: error.message, code: error.code });
      return;
    }
    next(error);
  }
);
export default router;
