const express = require('express');
const router = express.Router();
const { authenticate, isAdmin } = require('../middleware/authMiddleware');
const authService = require('../services/authService');
const globalSettingsRepository = require('../models/globalSettingsRepository');
const userRepository = require('../models/userRepository');
const { log } = require('../config/logging');
const { body, validationResult } = require('express-validator');
/**
 * @swagger
 * tags:
 *   name: Identity & Security
 *   description: User authentication, registration, profiles, MFA, family access, and API keys.
 */

// All admin auth routes require authentication and admin privileges
router.use(authenticate);
router.use(isAdmin);

/**
 * @swagger
 * /admin/auth/settings/mfa-mandatory:
 *   get:
 *     summary: Get global MFA mandatory setting
 *     tags: [Identity & Security]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Global MFA mandatory setting.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isMfaMandatory:
 *                   type: boolean
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       500:
 *         description: Server error.
 */
router.get('/settings/mfa-mandatory', async (req, res, next) => {
  try {
    const isMfaMandatory = await globalSettingsRepository.getMfaMandatorySetting();
    res.status(200).json({ isMfaMandatory });
  } catch (error) {
    log('error', 'Error fetching global MFA mandatory setting:', error);
    next(error);
  }
});

/**
 * @swagger
 * /admin/auth/settings/mfa-mandatory:
 *   put:
 *     summary: Update global MFA mandatory setting
 *     tags: [Identity & Security]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               isMfaMandatory:
 *                 type: boolean
 *             required:
 *               - isMfaMandatory
 *     responses:
 *       200:
 *         description: Global MFA mandatory setting updated.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid request body.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       500:
 *         description: Server error.
 */
router.put('/settings/mfa-mandatory',
  body('isMfaMandatory').isBoolean().withMessage('isMfaMandatory must be a boolean value.'),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { isMfaMandatory } = req.body;
    try {
      await globalSettingsRepository.setMfaMandatorySetting(isMfaMandatory);
      await authService.logAdminAction(req.userId, null, 'GLOBAL_MFA_SETTING_UPDATED', { isMfaMandatory });
      res.status(200).json({ message: `Global MFA mandatory setting updated to ${isMfaMandatory}.` });
    } catch (error) {
      log('error', 'Error updating global MFA mandatory setting:', error);
      next(error);
    }
  }
);

/**
 * @swagger
 * /admin/auth/users/{userId}/mfa/reset:
 *   post:
 *     summary: Reset a user's MFA
 *     tags: [Identity & Security]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: The ID of the user whose MFA to reset.
 *     responses:
 *       200:
 *         description: User MFA reset successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: User not found.
 *       500:
 *         description: Server error.
 */
router.post('/users/:userId/mfa/reset', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const user = await userRepository.findUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    await authService.resetUserMfa(req.userId, userId);
    res.status(200).json({ message: `MFA for user ${userId} has been reset.` });
  } catch (error) {
    log('error', `Error resetting MFA for user ${req.params.userId} by admin ${req.userId}:`, error);
    next(error);
  }
});

module.exports = router;