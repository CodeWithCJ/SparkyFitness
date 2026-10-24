import express from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authMiddleware.js';
import { demoGuard } from '../../middleware/demoGuardMiddleware.js';
import { isMcpOAuthEnabled } from '../../models/globalSettingsRepository.js';
import {
  listOAuthAuthorizations,
  revokeOAuthAuthorization,
} from '../../models/oauthClientRepository.js';

const router = express.Router();
const authorizationParamsSchema = z.object({
  consentId: z.string().uuid(),
});

router.get(
  '/user/oauth-authorizations',
  authenticate,
  async (req, res, next) => {
    try {
      if (!(await isMcpOAuthEnabled())) {
        return res.json({ enabled: false, authorizations: [] });
      }
      const authorizations = await listOAuthAuthorizations(
        req.authenticatedUserId
      );
      return res.json({ enabled: true, authorizations });
    } catch (error) {
      return next(error);
    }
  }
);

router.delete(
  '/user/oauth-authorizations/:consentId',
  authenticate,
  demoGuard,
  async (req, res, next) => {
    const parsed = authorizationParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid OAuth authorization ID.' });
    }

    try {
      const revoked = await revokeOAuthAuthorization(
        req.authenticatedUserId,
        parsed.data.consentId
      );
      if (!revoked) {
        return res.status(404).json({ error: 'Authorization not found.' });
      }
      return res.status(204).send();
    } catch (error) {
      return next(error);
    }
  }
);

export default router;
