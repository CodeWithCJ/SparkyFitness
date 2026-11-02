import express, { RequestHandler } from 'express';
import { labReportScanRequestSchema } from '@workspace/shared';
import { authenticate } from '../../middleware/authMiddleware.js';
import onBehalfOfMiddleware from '../../middleware/onBehalfOfMiddleware.js';
import checkPermissionMiddleware from '../../middleware/checkPermissionMiddleware.js';
import { resolveIsAdmin } from '../../utils/adminCheck.js';
import { createUserRateLimiter } from '../../utils/userRateLimiter.js';
import {
  extractLabReport,
  matchLabReportResults,
  type LabReportScanErrorCategory,
} from '../../services/labReportScanService.js';

const router = express.Router();

/** Each scan reads a document and calls the user's AI provider, so keep it modest. */
export const SCAN_RATE_LIMIT_MAX = 10;
export const SCAN_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
export const scanRateLimiter = createUserRateLimiter(
  SCAN_RATE_LIMIT_MAX,
  SCAN_RATE_LIMIT_WINDOW_MS
);

router.use(authenticate);
router.use(onBehalfOfMiddleware);
router.use(checkPermissionMiddleware('checkin'));

/**
 * @swagger
 * /v2/lab-reports/scan:
 *   post:
 *     summary: Read a lab report (PDF or photo) with the user's AI provider
 *     description: >
 *       Nothing is saved. The report is read in memory and the results are
 *       returned for the user to review. A PDF must have a text layer; a scanned
 *       PDF is rejected and should be sent as a photo instead.
 *     tags: [Wellness & Metrics]
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [document, mime_type]
 *             properties:
 *               document: { type: string, description: Base64-encoded PDF or image }
 *               mime_type: { type: string, example: application/pdf }
 *     responses:
 *       200: { description: The results read from the report, each matched to a known marker where possible. }
 *       400: { description: Invalid request, an unsupported image type (JPEG, PNG and WebP are accepted) or an unreadable photo, or a document that is too large (a PDF over 30 pages or with more text than one prompt takes, a photo over 8 MB or 50 megapixels included). }
 *       429: { description: Too many scans in a short time. }
 *       403: { description: The AI provider URL is on a private network. }
 *       422: { description: No usable AI provider, an unreadable PDF, or the model did not return readable results. }
 *       502: { description: The AI provider failed. }
 *       504: { description: The AI provider timed out. }
 */

const LAB_REPORT_ERROR_HTTP_STATUS: Record<LabReportScanErrorCategory, number> =
  {
    no_ai_configured: 422,
    unsupported_provider: 422,
    api_key_missing: 422,
    custom_url_missing: 422,
    private_network_forbidden: 403,
    unsupported_media: 400,
    image_too_large: 400,
    document_too_large: 400,
    unreadable_pdf: 422,
    refused: 422,
    truncated: 422,
    no_content: 422,
    parse_error: 422,
    upstream_error: 502,
    timeout: 504,
  };

const scanLabReport: RequestHandler = async (req, res, next) => {
  try {
    const body = labReportScanRequestSchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({
        error: 'Invalid request',
        details: body.error.flatten(),
      });
    }
    const retryAfter = scanRateLimiter.hit(req.userId);
    if (retryAfter > 0) {
      res.set('Retry-After', String(retryAfter));
      return res
        .status(429)
        .json({ error: 'Too many lab report scans. Try again shortly.' });
    }
    const isAdmin = await resolveIsAdmin(req.user, req.authenticatedUserId);
    const result = await extractLabReport(
      body.data.document,
      body.data.mime_type,
      req.userId,
      isAdmin
    );
    if (!result.success) {
      const status = LAB_REPORT_ERROR_HTTP_STATUS[result.category] ?? 500;
      return res.status(status).json({ error: result.error });
    }
    res.json({
      report: {
        lab_name: result.report.lab_name,
        collected_on: result.report.collected_on,
        results: matchLabReportResults(result.report),
      },
    });
  } catch (error) {
    next(error);
  }
};

router.post('/scan', scanLabReport);

export default router;
