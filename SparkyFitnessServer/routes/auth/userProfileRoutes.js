const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { validationResult } = require('express-validator');
const authService = require('../../services/authService');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOADS_DIR = path.join(__dirname, '../../uploads/avatars');
console.log('UserProfileRoutes UPLOADS_DIR:', UPLOADS_DIR);

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
 * /auth/user:
 *   get:
 *     summary: Get current user's information
 *     tags: [Authentication & Users]
 *     description: Retrieves the profile information for the currently authenticated user.
 *     responses:
 *       200:
 *         description: The user's profile information.
 *       404:
 *         description: User not found.
 */
router.get('/user', authenticate, async (req, res, next) => {
  try {
    const user = await authService.getUser(req.userId);
    res.status(200).json({
      userId: user.id,
      email: user.email,
      role: user.role,
      created_at: user.created_at
    });
  } catch (error) {
    if (error.message === 'User not found.') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * @swagger
 * /auth/users/find-by-email:
 *   get:
 *     summary: Find a user by email
 *     tags: [Authentication & Users]
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
 * /auth/profiles:
 *   get:
 *     summary: Get the current user's profile
 *     tags: [Authentication & Users]
 *     description: Retrieves the profile for the currently authenticated user.
 *     responses:
 *       200:
 *         description: The user's profile information.
 *       403:
 *         description: User is not authorized to access this profile.
 */
router.get('/profiles', authenticate, async (req, res, next) => {
  try {
    const profile = await authService.getUserProfile(req.userId, req.userId);
    if (!profile) {
      return res.status(200).json({});
    }
    res.status(200).json(profile);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * @swagger
 * /auth/profiles:
 *   put:
 *     summary: Update the current user's profile
 *     tags: [Authentication & Users]
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
  const { full_name, phone_number, date_of_birth, bio, avatar_url, gender } = req.body;

  try {
    const updatedProfile = await authService.updateUserProfile(
      req.userId,
      req.userId,
      { full_name, phone_number, date_of_birth, bio, avatar_url, gender }
    );
    res.status(200).json({ message: 'Profile updated successfully.', profile: updatedProfile });
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    if (error.message === 'Profile not found or no changes made.') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * @swagger
 * /auth/update-password:
 *   post:
 *     summary: Update user password
 *     tags: [Authentication & Users]
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
    await authService.updateUserPassword(req.userId, newPassword);
    res.status(200).json({ message: 'Password updated successfully.' });
  } catch (error) {
    if (error.message === 'User not found.') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * @swagger
 * /auth/update-email:
 *   post:
 *     summary: Update user email
 *     tags: [Authentication & Users]
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
    await authService.updateUserEmail(req.userId, newEmail);
    res.status(200).json({ message: 'Email update initiated. User will need to verify new email.' });
  } catch (error) {
    if (error.message === 'Email already in use by another account.') {
      return res.status(409).json({ error: error.message });
    }
    if (error.message === 'User not found.') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

router.post('/profiles/avatar', authenticate, upload.single('avatar'), async (req, res, next) => {
  try {
    if (!req.file) {
      console.error('Multer did not provide a file for upload.');
      return res.status(400).json({ error: 'No file uploaded.' });
    }
    console.log('Multer req.file:', req.file);
    const avatarUrl = `/auth/profiles/avatar/${req.file.filename}`;
    console.log('Generated avatarUrl for DB:', avatarUrl);
    await authService.updateUserProfile(req.userId, req.userId, { avatar_url: avatarUrl });
    res.status(200).json({ message: 'Avatar uploaded successfully.', avatar_url: avatarUrl });
  } catch (error) {
    console.error('Error in avatar upload route:', error);
    next(error);
  }
});

router.get('/profiles/avatar/:filename', authenticate, async (req, res, next) => {
  try {
    const { filename } = req.params;
    const userId = req.userId;

    const avatarPath = path.join(UPLOADS_DIR, filename);

    if (fs.existsSync(avatarPath)) {
      res.sendFile(avatarPath);
    } else {
      res.status(404).json({ error: 'Avatar not found.' });
    }
  } catch (error) {
    next(error);
  }
});

module.exports = router;