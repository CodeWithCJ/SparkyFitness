const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { authenticate } = require('../../middleware/authMiddleware');
const { JWT_SECRET } = require('../../security/encryption');
const { mfaValidation, emailMfaValidation, verifyRecoveryCodeValidation } = require('../../validation/authValidation');
const { validationResult } = require('express-validator');
const authService = require('../../services/authService');

/**
 * @swagger
 * /auth/mfa/status:
 *   get:
 *     summary: Get MFA status
 *     tags: [Authentication & Users]
 *     description: Retrieves the Multi-Factor Authentication (MFA) status for the authenticated user.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: MFA status retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 mfa_totp_enabled:
 *                   type: boolean
 *                   description: True if TOTP MFA is enabled.
 *                 mfa_email_enabled:
 *                   type: boolean
 *                   description: True if Email MFA is enabled.
 *                 mfa_recovery_codes_enabled:
 *                   type: boolean
 *                   description: True if MFA recovery codes are enabled.
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       500:
 *         description: Server error.
 */
router.get('/mfa/status', authenticate, async (req, res, next) => {
  try {
    const status = await authService.getMfaStatus(req.userId);
    res.status(200).json(status);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /auth/mfa/setup/totp:
 *   post:
 *     summary: Setup TOTP MFA
 *     tags: [Authentication & Users]
 *     description: Initiates the setup process for Time-based One-Time Password (TOTP) MFA, returning a secret and OTPAuth URL.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: TOTP setup initiated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 secret:
 *                   type: string
 *                   description: The TOTP secret key.
 *                 otpauthUrl:
 *                   type: string
 *                   description: The OTPAuth URL for QR code generation.
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       500:
 *         description: Server error.
 */
router.post('/mfa/setup/totp', authenticate, async (req, res, next) => {
  try {
    const user = await authService.getUser(req.userId);
    const { secret, otpauthUrl } = await authService.generateTotpSecret(user.id, user.email);
    res.status(200).json({ secret, otpauthUrl });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /auth/mfa/verify/totp:
 *   post:
 *     summary: Verify TOTP code
 *     tags: [Authentication & Users]
 *     description: Verifies a TOTP code provided by the user. If successful, issues a new JWT token.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *             properties:
 *               code:
 *                 type: string
 *                 description: The TOTP code to verify.
 *     responses:
 *       200:
 *         description: TOTP verified and login successful.
 *       400:
 *         description: Invalid request body.
 *       401:
 *         description: Invalid TOTP code or unauthorized.
 *       500:
 *         description: Server error.
 */
router.post('/mfa/verify/totp', authenticate, mfaValidation, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const { code } = req.body;
  try {
    const isValid = await authService.verifyTotpCode(req.userId, code);
    if (isValid) {
      const user = await authService.getUser(req.userId);
      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "30d" });

      await authService.updateUserMfaSettings(req.userId, null, true, null, null, null, null, null);

      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000
      });
      res.status(200).json({ message: 'TOTP verified and login successful.', userId: user.id, email: user.email, role: user.role, token });
    } else {
      res.status(401).json({ error: 'Invalid TOTP code.' });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /auth/mfa/enable/totp:
 *   post:
 *     summary: Enable TOTP MFA
 *     tags: [Authentication & Users]
 *     description: Enables TOTP MFA for the authenticated user after successful verification of a TOTP code.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *             properties:
 *               code:
 *                 type: string
 *                 description: The TOTP code to verify and enable.
 *     responses:
 *       200:
 *         description: TOTP enabled successfully.
 *       400:
 *         description: Invalid request body.
 *       401:
 *         description: Invalid TOTP code or unauthorized.
 *       500:
 *         description: Server error.
 */
router.post('/mfa/enable/totp', authenticate, mfaValidation, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const { code } = req.body;
  try {
    const isValid = await authService.verifyTotpCode(req.userId, code);
    if (isValid) {
      await authService.updateUserMfaSettings(req.userId, null, true, null, null, null, null, null);
      res.status(200).json({ message: 'TOTP enabled successfully.' });
    } else {
      res.status(401).json({ error: 'Invalid TOTP code.' });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /auth/mfa/disable/totp:
 *   post:
 *     summary: Disable TOTP MFA
 *     tags: [Authentication & Users]
 *     description: Disables TOTP MFA for the authenticated user.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: TOTP disabled successfully.
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       500:
 *         description: Server error.
 */
router.post('/mfa/disable/totp', authenticate, async (req, res, next) => {
  try {
    await authService.updateUserMfaSettings(req.userId, null, false, null, null, null, null, null);
    res.status(200).json({ message: 'TOTP disabled successfully.' });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /auth/mfa/enable/email:
 *   post:
 *     summary: Enable Email MFA
 *     tags: [Authentication & Users]
 *     description: Enables Email MFA for the authenticated user.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Email MFA enabled successfully.
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       500:
 *         description: Server error.
 */
router.post('/mfa/enable/email', authenticate, async (req, res, next) => {
  try {
    await authService.updateUserMfaSettings(req.userId, null, null, true, null, null, null, null);
    res.status(200).json({ message: 'Email MFA enabled successfully.' });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /auth/mfa/disable/email:
 *   post:
 *     summary: Disable Email MFA
 *     tags: [Authentication & Users]
 *     description: Disables Email MFA for the authenticated user.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Email MFA disabled successfully.
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       500:
 *         description: Server error.
 */
router.post('/mfa/disable/email', authenticate, async (req, res, next) => {
  try {
    await authService.updateUserMfaSettings(req.userId, null, null, false, null, null, null, null);
    res.status(200).json({ message: 'Email MFA disabled successfully.' });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /auth/mfa/request-email-code:
 *   post:
 *     summary: Request Email MFA code
 *     tags: [Authentication & Users]
 *     description: Requests an Email MFA code to be sent to the authenticated user's email address.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Email MFA code sent.
 *       400:
 *         description: Email MFA is not enabled for this user.
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       500:
 *         description: Server error.
 */
router.post('/mfa/request-email-code', authenticate, async (req, res, next) => {
  try {
    const user = await authService.getUser(req.userId);
    if (!user.mfa_email_enabled) {
      return res.status(400).json({ error: 'Email MFA is not enabled for this user.' });
    }
    const code = await authService.generateEmailMfaCode(req.userId);
    await authService.sendEmailMfaCode(user.email, code);
    res.status(200).json({ message: 'Email MFA code sent.' });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /auth/mfa/verify-email-code:
 *   post:
 *     summary: Verify Email MFA code
 *     tags: [Authentication & Users]
 *     description: Verifies an Email MFA code provided by the user. If successful, issues a new JWT token.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *             properties:
 *               code:
 *                 type: string
 *                 description: The Email MFA code to verify.
 *     responses:
 *       200:
 *         description: Email MFA code verified. Login successful.
 *       400:
 *         description: Invalid request body.
 *       401:
 *         description: Invalid or expired email MFA code or unauthorized.
 *       500:
 *         description: Server error.
 */
router.post('/mfa/verify-email-code', authenticate, mfaValidation, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const { code, userId: bodyUserId } = req.body;
  try {
    const user = await authService.verifyEmailMfaCode(req.userId, code);
    if (user) {
      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "30d" });
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000
      });
      res.status(200).json({ message: 'Email MFA code verified. Login successful.', userId: user.id, email: user.email, role: user.role, token });
    } else {
      res.status(401).json({ error: 'Invalid or expired email MFA code.' });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /auth/mfa/recovery-codes:
 *   post:
 *     summary: Generate MFA recovery codes
 *     tags: [Authentication & Users]
 *     description: Generates a new set of MFA recovery codes for the authenticated user.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Recovery codes generated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 recoveryCodes:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: An array of new recovery codes.
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       500:
 *         description: Server error.
 */
router.post('/mfa/recovery-codes', authenticate, async (req, res, next) => {
  try {
    const codes = await authService.generateRecoveryCodes(req.userId);
    res.status(200).json({ recoveryCodes: codes });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /auth/mfa/verify-recovery-code:
 *   post:
 *     summary: Verify MFA recovery code
 *     tags: [Authentication & Users]
 *     description: Verifies an MFA recovery code. If successful, issues a new JWT token.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *               - userId
 *             properties:
 *               code:
 *                 type: string
 *                 description: The recovery code to verify.
 *               userId:
 *                 type: string
 *                 format: uuid
 *                 description: The ID of the user attempting to log in with a recovery code.
 *     responses:
 *       200:
 *         description: Recovery code verified. Login successful.
 *       400:
 *         description: Invalid request body.
 *       401:
 *         description: Invalid recovery code.
 *       404:
 *         description: User not found.
 *       500:
 *         description: Server error.
 */
router.post('/mfa/verify-recovery-code', verifyRecoveryCodeValidation, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const { code, userId } = req.body;

  try {
    const targetUserId = userId;
    const isValid = await authService.verifyRecoveryCode(targetUserId, code);
    if (isValid) {
      const user = await authService.getUser(targetUserId);
      if (!user) {
        return res.status(404).json({ error: 'User not found after recovery code verification.' });
      }
      const token = jwt.sign({ userId: targetUserId }, JWT_SECRET, { expiresIn: "30d" });
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000
      });
      res.status(200).json({ message: 'Recovery code verified. Login successful.', userId: targetUserId, role: user.role, token });
    } else {
      res.status(401).json({ error: 'Invalid recovery code.' });
    }
  } catch (error) {
    next(error);
  }
});

module.exports = router;