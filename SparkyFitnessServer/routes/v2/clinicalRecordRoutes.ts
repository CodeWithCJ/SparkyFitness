// @ts-expect-error TS(7016): Could not find a declaration file for module 'multer'
import multer from 'multer';
import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import { authenticate } from '../../middleware/authMiddleware.js';
import onBehalfOfMiddleware from '../../middleware/onBehalfOfMiddleware.js';
import checkPermissionMiddleware from '../../middleware/checkPermissionMiddleware.js';
import {
  previewClinicalRecord,
  executeClinicalImport,
} from '../../services/clinicalRecordIngestionService.js';
import { ValidationError } from '../../utils/errors.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

const router = express.Router();

router.use(authenticate);
router.use(onBehalfOfMiddleware);
router.use(checkPermissionMiddleware('checkin'));

function actingUsers(req: Request) {
  const targetUserId = req.userId as string;
  const authenticatedUserId = (req.originalUserId ||
    req.authenticatedUserId ||
    req.userId) as string;
  return { targetUserId, authenticatedUserId };
}

/**
 * POST /api/v2/clinical-records/preview
 * Accepts multipart/form-data with a "file" field (.xml or .zip).
 * Returns the parsed preview of vitals and lab panels without persisting.
 */
router.post(
  '/preview',
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // @ts-expect-error TS(2339): Property 'file' added by multer middleware
      if (!req.file || !req.file.buffer) {
        return res
          .status(400)
          .json({ error: 'Missing uploaded file (expected field "file")' });
      }

      let preview;
      try {
        preview = previewClinicalRecord(
          // @ts-expect-error TS(2339): Property 'file' added by multer middleware
          req.file.buffer,
          // @ts-expect-error TS(2339): Property 'file' added by multer middleware
          req.file.originalname
        );
      } catch (parseError) {
        throw new ValidationError(
          `Failed to parse clinical record: ${parseError instanceof Error ? parseError.message : String(parseError)}`
        );
      }
      res.status(200).json(preview);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v2/clinical-records/import
 * Accepts JSON body with selected vitals and labs to import.
 * Or multipart/form-data with "file" to directly ingest all contents.
 */
router.post(
  '/import',
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { targetUserId, authenticatedUserId } = actingUsers(req);

      // If file uploaded directly:
      // @ts-expect-error TS(2339): Property 'file' added by multer middleware
      if (req.file && req.file.buffer) {
        let preview;
        try {
          preview = previewClinicalRecord(
            // @ts-expect-error TS(2339): Property 'file' added by multer middleware
            req.file.buffer,
            // @ts-expect-error TS(2339): Property 'file' added by multer middleware
            req.file.originalname
          );
        } catch (parseError) {
          throw new ValidationError(
            `Failed to parse clinical record: ${parseError instanceof Error ? parseError.message : String(parseError)}`
          );
        }
        const result = await executeClinicalImport(
          targetUserId,
          {
            vitals: preview.vitals,
            labs: preview.labs,
            sourceLabel: 'mychart_clinical_import',
          },
          authenticatedUserId
        );
        return res.status(201).json(result);
      }

      // JSON payload containing confirmed/reviewed entries:
      if (!req.body || typeof req.body !== 'object') {
        return res.status(400).json({ error: 'Missing import request body' });
      }

      const result = await executeClinicalImport(
        targetUserId,
        req.body,
        authenticatedUserId
      );
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
