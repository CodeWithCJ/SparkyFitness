import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import { aiUnitConversionRequestSchema } from '@workspace/shared';
import {
  estimateUnitConversion,
  NoAiServiceError,
  AiConversionsDisabledError,
  IncompatibleRequestError,
  ProviderResponseError,
} from '../services/aiUnitConversionService.js';
import { log } from '../config/logging.js';

const router = express.Router();

/**
 * @swagger
 * /ai/convert-unit:
 *   post:
 *     summary: AI-estimated cross-category food unit conversion
 *     tags: [AI]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Estimated conversion with confidence.
 *       400:
 *         description: Units are incompatible for AI conversion.
 *       403:
 *         description: AI-assisted conversions disabled for this user.
 *       404:
 *         description: No AI service configured.
 *       502:
 *         description: AI provider error or malformed response.
 */
router.post('/convert-unit', authenticate, async (req, res, next) => {
  const validation = aiUnitConversionRequestSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({
      code: 'invalid_request',
      error: 'Request body failed schema validation.',
      issues: validation.error.issues,
    });
  }

  try {
    const result = await estimateUnitConversion(
      req.authenticatedUserId || req.userId,
      validation.data
    );
    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof NoAiServiceError) {
      return res
        .status(404)
        .json({ code: 'no_ai_service', error: error.message });
    }
    if (error instanceof AiConversionsDisabledError) {
      return res
        .status(403)
        .json({ code: 'ai_conversions_disabled', error: error.message });
    }
    if (error instanceof IncompatibleRequestError) {
      return res
        .status(400)
        .json({ code: 'incompatible_units', error: error.message });
    }
    if (error instanceof ProviderResponseError) {
      return res
        .status(502)
        .json({ code: 'provider_error', error: error.message });
    }
    log(
      'error',
      `Unexpected error in AI unit conversion for user ${req.userId}:`,
      error
    );
    next(error);
  }
});

export default router;
