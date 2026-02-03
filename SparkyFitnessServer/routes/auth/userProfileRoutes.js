const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { validationResult } = require('express-validator');
const authService = require('../../services/authService');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOADS_DIR = path.join(__dirname, '../../uploads/avatars');
const { log } = require('../../config/logging');
log('info', 'UserProfileRoutes UPLOADS_DIR:', UPLOADS_DIR);

// Ensure the uploads directory exists
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const fileExtension = path.extname(file.originalname);
    cb(null, req.userId + '-' + uniqueSuffix + fileExtension);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only images (jpeg, jpg, png, gif) are allowed.'));
    }
  }
});

/**
 * @swagger
 * /identity/user:
 *   get:
 *     summary: Get current user's information
 *     tags: [Identity & Security]
 *     description: Retrieves the profile information for the currently authenticated user.
 *     responses:
 *       200:
 *         description: The user's profile information.
 *       404:
 *         description: User not found.
 */
router.get('/user', authenticate, async (req, res, next) => {
  try {
    // Fetch both the logged-in user and the active context user
    const [authenticatedUser, activeUser] = await Promise.all([
      authService.getUser(req.authenticatedUserId),
      authService.getUser(req.userId)
    ]);

    res.status(200).json({
      // The actual logged-in user
      authenticatedUserId: authenticatedUser.id,
      authenticatedUserEmail: authenticatedUser.email,
      role: authenticatedUser.role,

      // The user context we are currently operating in
      activeUserId: activeUser.id,
      activeUserEmail: activeUser.email,
      activeUserFullName: activeUser.full_name
    });
  } catch (error) {
    // Use a more specific error check if available from the service layer
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: 'User not found.' });
    }
    next(error);
  }
});

/**
 * @swagger
 * /identity/switch-context:
 *   post:
 *     summary: Switch active user context
 *     tags: [Identity & Security]
 *     description: Switches the active user identity for the current session.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - targetUserId
 *             properties:
 *               targetUserId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Context switched successfully.
 *       403:
 *         description: Forbidden.
 *       500:
 *         description: Internal server error.
 */
router.post('/switch-context', authenticate, async (req, res, next) => {
  const { targetUserId } = req.body;
  if (!targetUserId) {
    return res.status(400).json({ error: 'targetUserId is required.' });
  }

  try {
    const { activeUserId } = await authService.switchUserContext(req.authenticatedUserId, targetUserId);

    // Set the new active user ID in the cookie
    res.cookie('sparky_active_user_id', activeUserId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/'
    });

    res.status(200).json({ message: 'Context switched successfully.', activeUserId });
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});


/**
 * @swagger
 * /identity/users/find-by-email:
 *   get:
 *     summary: Find a user by email
 *     tags: [Identity & Security]
 *     description: Retrieves the user ID for a given email address.
 *     parameters:
 *       - in: query
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *           format: email
 *     responses:
 *       200:
 *         description: The user ID.
 *       400:
 *         description: Email parameter is missing.
 *       404:
 *         description: User not found.
 */
router.get('/users/find-by-email', authenticate, async (req, res, next) => {
  const { email } = req.query;

  if (!email) {
    return res.status(400).json({ error: 'Email parameter is required.' });
  }

  try {
    const userId = await authService.findUserIdByEmail(email);
    res.status(200).json({ userId });
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    if (error.message === 'User not found.') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * @swagger
 * /identity/profiles:
 *   get:
 *     summary: Get the current user's profile
 *     tags: [Identity & Security]
 *     description: Retrieves the profile for the currently authenticated user.
 *     responses:
 *       200:
 *         description: The user's profile information.
 *       403:
 *         description: User is not authorized to access this profile.
 */
router.get('/profiles', authenticate, async (req, res, next) => {
  try {
    // Always fetch the profile for the active user context
    const profile = await authService.getUserProfile(req.userId);
    if (!profile) {
      // Return an empty object, but not an error, if a profile doesn't exist yet
      return res.status(200).json({});
    }
    res.status(200).json(profile);
  } catch (error) {
    // Error handling can be improved with custom error types
    if (error.constructor.name === 'ForbiddenError') {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * @swagger
 * /identity/profiles:
 *   put:
 *     summary: Update the current user's profile
 *     tags: [Identity & Security]
 *     description: Updates the profile for the currently authenticated user.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               full_name:
 *                 type: string
 *               phone_number:
 *                 type: string
 *               date_of_birth:
 *                 type: string
 *                 format: date
 *               bio:
 *                 type: string
 *               avatar_url:
 *                 type: string
 *               gender:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile updated successfully.
 *       403:
 *         description: User is not authorized to update this profile.
 *       404:
 *         description: Profile not found or no changes made.
 */
router.put('/profiles', authenticate, async (req, res, next) => {
  try {
    // Profile updates should apply to the active user context
    const updatedProfile = await authService.updateUserProfile(
      req.userId,
      req.body
    );
    res.status(200).json({ message: 'Profile updated successfully.', profile: updatedProfile });
  } catch (error) {
    // Example of improved error handling
    if (error.constructor.name === 'ForbiddenError') {
      return res.status(403).json({ error: error.message });
    }
    if (error.constructor.name === 'NotFoundError') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * @swagger
 * /identity/update-password:
 *   post:
 *     summary: Update user password
 *     tags: [Identity & Security]
 *     description: Allows an authenticated user to update their password.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - newPassword
 *             properties:
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 description: The new password for the user.
 *     responses:
 *       200:
 *         description: Password updated successfully.
 *       400:
 *         description: New password is required.
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       404:
 *         description: User not found.
 *       500:
 *         description: Server error.
 */
router.post('/update-password', authenticate, async (req, res, next) => {
  const { newPassword } = req.body;

  if (!newPassword) {
    return res.status(400).json({ error: 'New password is required.' });
  }

  try {
    // Security: Password updates must always apply to the authenticated user, not the active context
    await authService.updateUserPassword(req.authenticatedUserId, newPassword);
    res.status(200).json({ message: 'Password updated successfully.' });
  } catch (error) {
    if (error.constructor.name === 'NotFoundError') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * @swagger
 * /identity/update-email:
 *   post:
 *     summary: Update user email
 *     tags: [Identity & Security]
 *     description: Allows an authenticated user to update their email address. A verification process will be initiated for the new email.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - newEmail
 *             properties:
 *               newEmail:
 *                 type: string
 *                 format: email
 *                 description: The new email address for the user.
 *     responses:
 *       200:
 *         description: Email update initiated. User will need to verify new email.
 *       400:
 *         description: New email is required.
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       404:
 *         description: User not found.
 *       409:
 *         description: Email already in use by another account.
 *       500:
 *         description: Server error.
 */
router.post('/update-email', authenticate, async (req, res, next) => {
  const { newEmail } = req.body;

  if (!newEmail) {
    return res.status(400).json({ error: 'New email is required.' });
  }

  try {
    // Security: Email updates must always apply to the authenticated user
    await authService.updateUserEmail(req.authenticatedUserId, newEmail);
    res.status(200).json({ message: 'Email update initiated. User will need to verify new email.' });
  } catch (error) {
    if (error.constructor.name === 'ConflictError') {
      return res.status(409).json({ error: error.message });
    }
    if (error.constructor.name === 'NotFoundError') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * @swagger
 * /identity/profiles/avatar:
 *   post:
 *     summary: Upload user avatar
 *     tags: [Identity & Security]
 *     description: Uploads a new avatar image for the authenticated user.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               avatar:
 *                 type: string
 *                 format: binary
 *                 description: The image file to upload (jpeg, jpg, png, gif).
 *     responses:
 *       200:
 *         description: Avatar uploaded successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 avatar_url:
 *                   type: string
 *       400:
 *         description: No file uploaded or invalid file type.
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal server error.
 */
router.post('/profiles/avatar', authenticate, upload.single('avatar'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded or invalid file type.' });
    }
    // The avatar URL should be a relative path that the frontend can use.
    // The logic for serving the file will handle the rest.
    const avatarUrl = `/uploads/avatars/${req.file.filename}`;

    // Update the profile of the active user context
    await authService.updateUserProfile(req.userId, { avatar_url: avatarUrl });

    res.status(200).json({ message: 'Avatar uploaded successfully.', avatar_url: avatarUrl });
  } catch (error) {
    log('error', 'Error in avatar upload route:', error);
    next(error);
  }
});

/**
 * @swagger
 * /identity/profiles/avatar/{filename}:
 *   get:
 *     summary: Get user avatar image
 *     tags: [Identity & Security]
 *     description: Retrieves the avatar image file by its filename.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: filename
 *         required: true
 *         schema:
 *           type: string
 *         description: The filename of the avatar image.
 *     responses:
 *       200:
 *         description: The avatar image file.
 *         content:
 *           image/*:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Avatar not found.
 *       500:
 *         description: Internal server error.
 */
router.get('/profiles/avatar/:filename', authenticate, (req, res, next) => {
  try {
    const { filename } = req.params;
    const avatarPath = path.join(UPLOADS_DIR, filename);

    // Security check: Ensure the filename is safe to prevent directory traversal
    if (filename.includes('..')) {
      return res.status(400).json({ error: 'Invalid filename.' });
    }

    if (fs.existsSync(avatarPath)) {
      res.sendFile(avatarPath);
    } else {
      res.status(404).json({ error: 'Avatar not found.' });
    }
  } catch (error) {
    log('error', `Error serving avatar file ${req.params.filename}:`, error);
    next(error);
  }
});

/**
 * @swagger
 * /identity/mfa/email-toggle:
 *   post:
 *     summary: Toggle Email MFA
 *     tags: [Identity & Security]
 *     description: Enables or disables Email MFA for the currently authenticated user.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               enabled:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: MFA settings updated successfully.
 */
router.post('/mfa/email-toggle', authenticate, async (req, res, next) => {
  const { enabled } = req.body;

  try {
    // Security: MFA settings must apply to the authenticated user
    const user = await authService.getUser(req.authenticatedUserId);
    const totpEnabled = !!user.mfa_totp_enabled;
    const globalMfaState = enabled || totpEnabled;

    await authService.updateUserMfaSettings(
      req.authenticatedUserId,
      undefined,      // mfaSecret
      globalMfaState, // two_factor_enabled
      enabled,        // mfaEmailEnabled
      undefined,      // mfaRecoveryCodes
      undefined,      // mfaEnforced
      null,           // emailMfaCode
      null            // emailMfaExpiresAt
    );

    res.status(200).json({
      message: `Email MFA ${enabled ? 'enabled' : 'disabled'} successfully.`,
      mfaEmailEnabled: enabled,
      twoFactorEnabled: globalMfaState
    });
  } catch (error) {
    log('error', `Error toggling email MFA for user ${req.authenticatedUserId}:`, error);
    next(error);
  }
});

module.exports = router;