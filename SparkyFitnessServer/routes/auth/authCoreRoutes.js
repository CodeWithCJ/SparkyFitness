const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { authenticate } = require('../../middleware/authMiddleware');
const { JWT_SECRET } = require('../../security/encryption');
const { loginValidation, registerValidation, forgotPasswordValidation, resetPasswordValidation, magicLinkRequestValidation } = require('../../validation/authValidation');
const { validationResult } = require('express-validator');
const authService = require('../../services/authService');
const oidcProviderRepository = require('../../models/oidcProviderRepository');
const { log } = require('../../config/logging');

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Logs in a user
 *     tags: [Identity & Security]
 *     description: Authenticates a user with an email and password.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful.
 *       202:
 *         description: MFA is required.
 *       401:
 *         description: Invalid credentials or login method disabled.
 */
router.post('/login', loginValidation, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password } = req.body;

  try {
    const settings = await authService.getLoginSettings();
    const providers = await oidcProviderRepository.getOidcProviders();
    const activeOidcProviders = providers.filter(p => p.is_active);
    const isOidcFullyEnabled = settings.oidc.enabled && activeOidcProviders.length > 0;

    if (!settings.email.enabled && !isOidcFullyEnabled) {
      log('warn', 'Login attempt with no methods enabled. Forcing email/password login as a fallback.');
      settings.email.enabled = true;
    }

    const authResult = await authService.loginUser(email, password, settings);

    if (authResult.status === 'MFA_REQUIRED') {
      return res.status(202).json(authResult);
    }

    res.cookie('token', authResult.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000
    });
    res.status(200).json({ message: 'Login successful', userId: authResult.userId, role: authResult.role });
  } catch (error) {
    if (error.message === 'Invalid credentials.' || error.message === 'Email/Password login is disabled.') {
      return res.status(401).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * @swagger
 * /auth/settings:
 *   get:
 *     summary: Get login settings
 *     tags: [Identity & Security]
 *     description: Retrieves the current login settings, including enabled authentication methods (email/password, OIDC) and active OIDC providers.
 *     responses:
 *       200:
 *         description: Login settings retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 email:
 *                   type: object
 *                   properties:
 *                     enabled:
 *                       type: boolean
 *                       description: Whether email/password login is enabled.
 *                 oidc:
 *                   type: object
 *                   properties:
 *                     enabled:
 *                       type: boolean
 *                       description: Whether OIDC login is enabled and at least one provider is active.
 *                     providers:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                             description: The ID of the OIDC provider.
 *                           display_name:
 *                             type: string
 *                             description: The display name of the OIDC provider.
 *                           logo_url:
 *                             type: string
 *                             description: The URL to the OIDC provider's logo.
 *                 warning:
 *                   type: string
 *                   nullable: true
 *                   description: A warning message if no login methods are enabled, indicating a fallback to email/password.
 *       500:
 *         description: Server error.
 */
router.get('/settings', async (req, res, next) => {
  try {
    const settings = await authService.getLoginSettings();
    const providers = await oidcProviderRepository.getOidcProviders();
    const activeOidcProviders = providers.filter(p => p.is_active);

    const isOidcFullyEnabled = settings.oidc.enabled && activeOidcProviders.length > 0;

    let warning = null;
    if (!settings.email.enabled && !isOidcFullyEnabled) {
      const warningMessage = 'No login methods were enabled. Email/password login has been temporarily enabled as a fallback. Please review the authentication settings.';
      log('warn', warningMessage);
      settings.email.enabled = true;
      warning = warningMessage;
    }

    const loginProviders = {
      email: {
        enabled: settings.email.enabled,
      },
      oidc: {
        enabled: isOidcFullyEnabled,
        providers: activeOidcProviders.map(({ id, display_name, logo_url }) => ({ id, display_name, logo_url })),
      },
      warning,
    };

    res.status(200).json(loginProviders);
  } catch (error) {
    log('error', 'Error fetching login providers settings:', error);
    next(error);
  }
});

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Logs out a user
 *     tags: [Identity & Security]
 *     description: Clears the user's session and authentication cookies.
 *     responses:
 *       200:
 *         description: Logout successful.
 */
router.post('/logout', async (req, res, next) => {
  const providerId = req.session?.providerId;

  req.session.destroy(async (err) => {
    if (err) {
      return next(err);
    }

    res.clearCookie('sparky.sid');
    res.clearCookie('token');

    if (providerId) {
      try {
        const provider = await oidcProviderRepository.getOidcProviderById(providerId);

        if (provider && provider.end_session_endpoint) {
          const frontendUrl = process.env.SPARKY_FITNESS_FRONTEND_URL || 'http://localhost:3000';
          const endSessionUrl = `${provider.end_session_endpoint}?post_logout_redirect_uri=${frontendUrl}/`;
          return res.status(200).json({
            message: 'Logout successful.',
            redirectUrl: endSessionUrl
          });
        } else {
          console.warn(`OIDC end_session_endpoint not found for providerId: ${providerId}. Proceeding with local logout.`);
        }
      } catch (oidcError) {
        console.error('Error fetching OIDC provider for logout:', oidcError);
      }
    }

    res.status(200).json({ message: 'Logout successful.' });
  });
});

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Registers a new user
 *     tags: [Identity & Security]
 *     description: Creates a new user account.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - full_name
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *               full_name:
 *                 type: string
 *     responses:
 *       201:
 *         description: User registered successfully.
 *       400:
 *         description: Invalid request body.
 *       403:
 *         description: New user registration is disabled.
 *       409:
 *         description: A user with this email already exists.
 */
router.post('/register', registerValidation, async (req, res, next) => {
  if (process.env.SPARKY_FITNESS_DISABLE_SIGNUP === 'true') {
    return res.status(403).json({ error: 'New user registration is currently disabled.' });
  }
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password, full_name } = req.body;

  try {
    const { userId, token } = await authService.registerUser(email, password, full_name);
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000
    });
    res.status(201).json({ message: 'User registered successfully', userId, role: 'user' });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'User with this email already exists.' });
    }
    next(error);
  }
});

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Request password reset
 *     tags: [Identity & Security]
 *     description: Sends a password reset email to the user if an account with the provided email exists.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: The email address of the user requesting a password reset.
 *     responses:
 *       200:
 *         description: If a user with that email exists, a password reset email has been sent.
 *       400:
 *         description: Invalid request body.
 *       500:
 *         description: Server error.
 */
router.post('/forgot-password', forgotPasswordValidation, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email } = req.body;

  try {
    await authService.forgotPassword(email);
    res.status(200).json({ message: 'If a user with that email exists, a password reset email has been sent.' });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Reset password
 *     tags: [Identity & Security]
 *     description: Resets the user's password using a valid reset token.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - newPassword
 *             properties:
 *               token:
 *                 type: string
 *                 description: The password reset token received via email.
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 description: The new password for the user.
 *     responses:
 *       200:
 *         description: Password has been reset successfully.
 *       400:
 *         description: Invalid request body or password reset token is invalid or has expired.
 *       500:
 *         description: Server error.
 */
router.post('/reset-password', resetPasswordValidation, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { token, newPassword } = req.body;

  try {
    await authService.resetPassword(token, newPassword);
    res.status(200).json({ message: 'Password has been reset successfully.' });
  } catch (error) {
    if (error.message === 'Password reset token is invalid or has expired.') {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * @swagger
 * /auth/request-magic-link:
 *   post:
 *     summary: Request a magic link for login
 *     tags: [Identity & Security]
 *     description: Sends a magic link to the user's email for passwordless login.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: The email address to send the magic link to.
 *     responses:
 *       200:
 *         description: If an account with that email exists, a magic link has been sent.
 *       400:
 *         description: Invalid request body.
 *       500:
 *         description: Server error.
 */
router.post('/request-magic-link', magicLinkRequestValidation, async (req, res, next) => {
  log('debug', `Received request for magic link. Body:`, req.body);
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    log('warn', `Magic link request validation errors:`, errors.array());
    return res.status(400).json({ errors: errors.array() });
  }
  const { email } = req.body;
  try {
    await authService.requestMagicLink(email);
    log('info', `Magic link requested for email: ${email}`);
    res.status(200).json({ message: 'If an account with that email exists, a magic link has been sent.' });
  } catch (error) {
    log('error', `Error requesting magic link for email ${email}:`, error);
    next(error);
  }
});

/**
 * @swagger
 * /auth/magic-link-login:
 *   get:
 *     summary: Log in using a magic link
 *     tags: [Identity & Security]
 *     description: Verifies a magic link token and logs in the user.
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *           description: The magic link token received via email.
 *     responses:
 *       200:
 *         description: Magic link login successful.
 *       202:
 *         description: MFA is required after magic link login.
 *       400:
 *         description: Magic link token is missing.
 *       401:
 *         description: Invalid or expired magic link token.
 *       500:
 *         description: Server error.
 */
router.get('/magic-link-login', async (req, res, next) => {
  const { token } = req.query;
  if (!token) {
    return res.status(400).json({ error: 'Magic link token is missing.' });
  }

  try {
    const authResult = await authService.verifyMagicLink(token);

    if (authResult.status === 'MFA_REQUIRED') {
      return res.status(202).json({
        status: 'MFA_REQUIRED',
        userId: authResult.userId,
        email: authResult.email,
        mfa_totp_enabled: authResult.mfa_totp_enabled,
        mfa_email_enabled: authResult.mfa_email_enabled,
        needs_mfa_setup: authResult.needs_mfa_setup,
        mfaToken: authResult.mfaToken,
      });
    }

    res.cookie('token', authResult.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000
    });
    res.status(200).json({
      message: 'Magic link login successful',
      token: authResult.token,
      userId: authResult.userId,
      role: authResult.role,
    });
  } catch (error) {
    log('error', 'Error in magic-link-login route:', error);
    res.status(401).json({ error: error.message || 'Magic link login failed.' });
  }
});

module.exports = router;
