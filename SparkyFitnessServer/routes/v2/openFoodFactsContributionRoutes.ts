import express, { type RequestHandler } from 'express';
import {
  OpenFoodFactsFoodParamsSchema,
  OpenFoodFactsPreviewRequestSchema,
  OpenFoodFactsPreviewResponseSchema,
  OpenFoodFactsConfirmRequestSchema,
  OpenFoodFactsConfirmResponseSchema,
} from '../../schemas/openFoodFactsContributionSchemas.js';
import {
  previewOpenFoodFactsContribution,
  confirmOpenFoodFactsContribution,
} from '../../services/openFoodFactsManualContributionService.js';

const router = express.Router();

const ownerOnly: RequestHandler = (req, res, next) => {
  if (!req.authenticatedUserId || req.userId !== req.authenticatedUserId) {
    res
      .status(403)
      .json({ error: 'Only the food owner can publish to Open Food Facts.' });
    return;
  }
  next();
};

function contributionHandler(confirm: boolean): RequestHandler {
  return async (req, res) => {
    const params = OpenFoodFactsFoodParamsSchema.safeParse(req.params);
    const body = (
      confirm
        ? OpenFoodFactsConfirmRequestSchema
        : OpenFoodFactsPreviewRequestSchema
    ).safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({
        error:
          'A single food, product language, photo and the required confirmations must be provided.',
      });
      return;
    }
    try {
      const result = confirm
        ? OpenFoodFactsConfirmResponseSchema.parse(
            await confirmOpenFoodFactsContribution(
              req.userId,
              req.authenticatedUserId,
              params.data.foodId,
              body.data
            )
          )
        : OpenFoodFactsPreviewResponseSchema.parse(
            await previewOpenFoodFactsContribution(
              req.userId,
              req.authenticatedUserId,
              params.data.foodId,
              body.data
            )
          );
      res.json(result);
    } catch (error) {
      const status =
        error instanceof Error &&
        'statusCode' in error &&
        typeof error.statusCode === 'number'
          ? error.statusCode
          : 500;
      // Do not log or serialize the request, image, provider or session.
      res.status(status).json({
        error:
          status !== 500 && error instanceof Error
            ? error.message
            : 'Open Food Facts contribution failed. Check the product before retrying.',
      });
    }
  };
}

/**
 * @swagger
 * /api/v2/foods/{foodId}/openfoodfacts/preview:
 *   post:
 *     summary: Preview one owned packaging-derived food and a selected JPEG without publishing
 *     tags: [Foods]
 *     parameters:
 *       - in: path
 *         name: foodId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [productLanguage, imageType, imageBase64]
 *             properties:
 *               productLanguage: { type: string, example: en }
 *               imageType: { type: string, enum: [front, nutrition, packaging] }
 *               imageBase64: { type: string, description: JPEG base64 without a data URL prefix, at most 4 MB decoded }
 *     responses:
 *       200: { description: Exact outgoing fields, sanitized photo, account scope and a signed ten-minute preview }
 *       400: { description: Ineligible food or invalid photo }
 *       403: { description: Owner-only or server permission disabled }
 * /api/v2/foods/{foodId}/openfoodfacts/contribute:
 *   post:
 *     summary: Explicitly publish one unchanged preview with separate data and photo-rights consent
 *     tags: [Foods]
 *     parameters:
 *       - in: path
 *         name: foodId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [productLanguage, imageType, imageBase64, previewToken, confirm, confirmImageRights]
 *             properties:
 *               productLanguage: { type: string }
 *               imageType: { type: string, enum: [front, nutrition, packaging] }
 *               imageBase64: { type: string }
 *               previewToken: { type: string }
 *               confirm: { type: boolean, enum: [true] }
 *               confirmImageRights: { type: boolean, enum: [true] }
 *     responses:
 *       200: { description: Success or explicit partial result if the photo was saved but product data was not confirmed }
 *       400: { description: Missing confirmations or invalid input }
 *       403: { description: Owner-only or server permission disabled }
 *       409: { description: Preview expired or food, photo, upstream revision or account changed }
 */
router.post(
  '/:foodId/openfoodfacts/preview',
  ownerOnly,
  contributionHandler(false)
);
router.post(
  '/:foodId/openfoodfacts/contribute',
  ownerOnly,
  contributionHandler(true)
);

export default router;
