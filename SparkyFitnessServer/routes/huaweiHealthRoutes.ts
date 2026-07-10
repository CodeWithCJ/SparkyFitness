import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import huaweiHealthOAuthService from '../integrations/huaweihealth/huaweiHealthOAuthService.js';
import huaweiHealthSyncService from '../integrations/huaweihealth/huaweiHealthSyncService.js';
import { HuaweiHealthError } from '../integrations/huaweihealth/huaweiHealthErrors.js';
import {
  HuaweiHealthCallbackBodySchema,
  HuaweiHealthSyncBodySchema,
} from '../schemas/huaweiHealthSchemas.js';
import { log } from '../config/logging.js';

const router = express.Router();

function handleHuaweiError(
  error: unknown,
  res: Response,
  _next: NextFunction
): void {
  if (error instanceof HuaweiHealthError) {
    log('warn', `HUAWEI Health request failed with ${error.code}.`);
    res.status(error.statusCode).json({ error: { code: error.code } });
    return;
  }

  // Provider responses can contain sensitive account context. Keep unknown
  // failures out of the API body and logs while returning a stable client key.
  log('error', 'Unexpected HUAWEI Health integration failure.');
  res.status(500).json({ error: { code: 'HUAWEI_INTERNAL_ERROR' } });
}

router.get(
  '/authorize',
  authMiddleware.authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await huaweiHealthOAuthService.createAuthorizationRequest(
        req.userId,
        req.authenticatedUserId
      );
      res.status(200).json(result);
    } catch (error) {
      handleHuaweiError(error, res, next);
    }
  }
);

router.post(
  '/callback',
  authMiddleware.authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = HuaweiHealthCallbackBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'HUAWEI_CALLBACK_INVALID' },
      });
      return;
    }

    try {
      const result = await huaweiHealthOAuthService.exchangeCodeForTokens(
        req.userId,
        req.authenticatedUserId,
        parsed.data.code,
        parsed.data.state
      );
      res.status(200).json(result);
    } catch (error) {
      handleHuaweiError(error, res, next);
    }
  }
);

router.get(
  '/status',
  authMiddleware.authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const status = await huaweiHealthOAuthService.getStatus(
        req.userId,
        req.authenticatedUserId
      );
      res.status(200).json(status);
    } catch (error) {
      handleHuaweiError(error, res, next);
    }
  }
);

router.post(
  '/sync',
  authMiddleware.authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = HuaweiHealthSyncBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'HUAWEI_SYNC_INVALID' } });
      return;
    }

    try {
      const result = await huaweiHealthSyncService.sync(
        req.userId,
        req.authenticatedUserId,
        parsed.data
      );
      res.status(200).json(result);
    } catch (error) {
      handleHuaweiError(error, res, next);
    }
  }
);

router.post(
  '/disconnect',
  authMiddleware.authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await huaweiHealthOAuthService.disconnect(
        req.userId,
        req.authenticatedUserId
      );
      res.status(200).json({ connected: false, ...result });
    } catch (error) {
      handleHuaweiError(error, res, next);
    }
  }
);

export default router;
