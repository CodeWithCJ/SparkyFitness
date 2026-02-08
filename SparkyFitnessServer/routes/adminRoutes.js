const express = require('express');
const router = express.Router();
const { authenticate, isAdmin } = require('../middleware/authMiddleware');
const authService = require('../services/authService');
const userRepository = require('../models/userRepository'); // Import userRepository
const { log } = require('../config/logging');
const { logAdminAction } = require('../services/authService'); // Import logAdminAction

// Middleware to ensure only admins can access these routes
// This will be enhanced later to prioritize SPARKY_FITNESS_ADMIN_EMAIL
router.use(authenticate);
router.use(isAdmin);

/**
 * @swagger
 * /admin/users:
 *   get:
 *     summary: Get all users with pagination and search
 *     tags: [System & Admin]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: The maximum number of users to return.
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: The number of users to skip before starting to return results.
 *       - in: query
 *         name: searchTerm
 *         schema:
 *           type: string
 *         description: Search term for user names or emails.
 *     responses:
 *       200:
 *         description: A list of users.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/User' # Assuming a User schema exists
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       500:
 *         description: Server error.
 */
router.get('/users', async (req, res, next) => {
  try {
    const { limit = 10, offset = 0, searchTerm = '' } = req.query;
    const users = await userRepository.getAllUsers(parseInt(limit), parseInt(offset), searchTerm);
    res.status(200).json(users);
  } catch (error) {
    log('error', 'Error fetching all users in adminRoutes:', error);
    next(error);
  }
});

/**
 * @swagger
 * /admin/users/{userId}:
 *   delete:
 *     summary: Delete a user
 *     tags: [System & Admin]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: The ID of the user to delete.
 *     responses:
 *       200:
 *         description: User deleted successfully.
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
 *         description: Forbidden (e.g., cannot delete primary admin).
 *       404:
 *         description: User not found.
 *       500:
 *         description: Server error.
 */
router.delete('/users/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;

    const user = await userRepository.findUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (user.email === process.env.SPARKY_FITNESS_ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Cannot delete the primary admin user.' });
    }

    const success = await userRepository.deleteUser(userId);
    if (success) {
      await logAdminAction(req.userId, userId, 'USER_DELETED', { deletedUserId: userId });
      res.status(200).json({ message: 'User deleted successfully.' });
    } else {
      res.status(404).json({ error: 'User not found or could not be deleted.' });
    }
  } catch (error) {
    log('error', `Error deleting user ${req.params.userId} in adminRoutes:`, error);
    next(error);
  }
});

/**
 * @swagger
 * /admin/users/{userId}/status:
 *   put:
 *     summary: Update user status (active/inactive)
 *     tags: [System & Admin]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: The ID of the user to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               isActive:
 *                 type: boolean
 *             required:
 *               - isActive
 *     responses:
 *       200:
 *         description: User status updated successfully.
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
 *         description: Forbidden (e.g., cannot change primary admin status).
 *       404:
 *         description: User not found.
 *       500:
 *         description: Server error.
 */
router.put('/users/:userId/status', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { isActive } = req.body; // Expecting a boolean value

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'isActive must be a boolean value.' });
    }

    const user = await userRepository.findUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (user.email === process.env.SPARKY_FITNESS_ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Cannot change status of the primary admin user.' });
    }

    const success = await userRepository.updateUserStatus(userId, isActive);
    if (success) {
      await logAdminAction(req.userId, userId, 'USER_STATUS_UPDATED', { targetUserId: userId, newStatus: isActive });
      res.status(200).json({ message: `User status updated to ${isActive ? 'active' : 'inactive'}.` });
    } else {
      res.status(404).json({ error: 'User not found or status could not be updated.' });
    }
  } catch (error) {
    log('error', `Error updating user status for user ${req.params.userId} in adminRoutes:`, error);
    next(error);
  }
});

/**
 * @swagger
 * /admin/users/{userId}/role:
 *   put:
 *     summary: Update user role (user/admin)
 *     tags: [System & Admin]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: The ID of the user to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [user, admin]
 *             required:
 *               - role
 *     responses:
 *       200:
 *         description: User role updated successfully.
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
 *         description: Forbidden (e.g., cannot change primary admin role).
 *       404:
 *         description: User not found.
 *       500:
 *         description: Server error.
 */
router.put('/users/:userId/role', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!role || (role !== 'user' && role !== 'admin')) {
      return res.status(400).json({ error: 'Role must be either "user" or "admin".' });
    }

    const user = await userRepository.findUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (user.email === process.env.SPARKY_FITNESS_ADMIN_EMAIL && role !== 'admin') {
      return res.status(403).json({ error: 'Cannot change role of the primary admin user from admin.' });
    }

    const success = await userRepository.updateUserRole(userId, role);
    if (success) {
      await logAdminAction(req.userId, userId, 'USER_ROLE_UPDATED', { targetUserId: userId, newRole: role });
      res.status(200).json({ message: `User role updated to ${role}.` });
    } else {
      res.status(404).json({ error: 'User not found or role could not be updated.' });
    }
  } catch (error) {
    log('error', `Error updating user role for user ${req.params.userId} in adminRoutes:`, error);
    next(error);
  }
});

/**
 * @swagger
 * /admin/users/{userId}/full-name:
 *   put:
 *     summary: Update user's full name
 *     tags: [System & Admin]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: The ID of the user to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName:
 *                 type: string
 *             required:
 *               - fullName
 *     responses:
 *       200:
 *         description: User full name updated successfully.
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
 *       404:
 *         description: User not found.
 *       500:
 *         description: Server error.
 */
router.put('/users/:userId/full-name', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { fullName } = req.body;

    if (!fullName) {
      return res.status(400).json({ error: 'Full name is required.' });
    }

    const success = await userRepository.updateUserFullName(userId, fullName);
    if (success) {
      await logAdminAction(req.userId, userId, 'USER_FULL_NAME_UPDATED', { targetUserId: userId, newFullName: fullName });
      res.status(200).json({ message: 'User full name updated successfully.' });
    } else {
      res.status(404).json({ error: 'User not found or full name could not be updated.' });
    }
  } catch (error) {
    log('error', `Error updating user full name for user ${req.params.userId} in adminRoutes:`, error);
    next(error);
  }
});

/**
 * @swagger
 * /admin/users/{userId}/reset-password:
 *   post:
 *     summary: Initiate a password reset for a user
 *     tags: [System & Admin]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: The ID of the user to reset the password for.
 *     responses:
 *       200:
 *         description: Password reset email sent successfully.
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
router.post('/users/:userId/reset-password', async (req, res, next) => {
  try {
    const { userId } = req.params;
    // For password reset via Better Auth, we use their API
    const user = await userRepository.findUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const { auth } = require('../auth');
    await auth.api.forgetPassword({
      email: user.email,
      redirectTo: (process.env.SPARKY_FITNESS_FRONTEND_URL || 'http://localhost:8080') + '/reset-password'
    });

    await logAdminAction(req.userId, userId, 'USER_PASSWORD_RESET_INITIATED', { targetUserId: userId, email: user.email });
    res.status(200).json({ message: 'Password reset email sent to user.' });
  } catch (error) {
    log('error', `Error initiating password reset for user ${req.params.userId} in adminRoutes:`, error);
    next(error);
  }
});

/**
 * @swagger
 * /admin/users/{userId}/mfa/reset:
 *   post:
 *     summary: Reset MFA for a user
 *     tags: [System & Admin]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: The ID of the user to reset MFA for.
 *     responses:
 *       200:
 *         description: MFA reset successfully.
 *       404:
 *         description: User not found.
 */
router.post('/users/:userId/mfa/reset', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const user = await userRepository.findUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    await authService.resetUserMfa(req.userId, userId);
    res.status(200).json({ message: 'MFA reset successfully.' });
  } catch (error) {
    log('error', `Error resetting MFA for user ${req.params.userId} in adminRoutes:`, error);
    next(error);
  }
});

module.exports = router;
