const express = require('express');
const router = express.Router();
const { authenticate, isAdmin } = require('../middleware/authMiddleware');
const authService = require('../services/authService');
const globalSettingsRepository = require('../models/globalSettingsRepository');
const userRepository = require('../models/userRepository');
const { log } = require('../config/logging');
const { body, validationResult } = require('express-validator');

// All admin auth routes require authentication and admin privileges
router.use(authenticate);
router.use(isAdmin);

// Route to get global MFA mandatory setting
router.get('/settings/mfa-mandatory', async (req, res, next) => {
  try {
    const isMfaMandatory = await globalSettingsRepository.getMfaMandatorySetting();
    res.status(200).json({ isMfaMandatory });
  } catch (error) {
    log('error', 'Error fetching global MFA mandatory setting:', error);
    next(error);
  }
});

// Route to update global MFA mandatory setting
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

// Route for admins to reset a user's MFA
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