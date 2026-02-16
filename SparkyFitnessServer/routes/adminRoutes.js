const express = require('express');
const router = express.Router();
const { authenticate, isAdmin } = require('../middleware/authMiddleware');
const authService = require('../services/authService');
const userRepository = require('../models/userRepository'); // Import userRepository
const chatRepository = require('../models/chatRepository'); // Import chatRepository
const { syncEnvToDatabase } = require('../services/aiConfigService'); // Import sync function
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

/**
 * @swagger
 * /admin/ai-service-settings/global:
 *   get:
 *     summary: Get all global AI service settings
 *     tags: [System & Admin]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: List of global AI service settings
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.get('/ai-service-settings/global', async (req, res, next) => {
  try {
    const settings = await chatRepository.getGlobalAiServiceSettings();
    res.status(200).json(settings);
  } catch (error) {
    log('error', 'Error fetching global AI service settings:', error);
    next(error);
  }
});

/**
 * @swagger
 * /admin/ai-service-settings/global:
 *   post:
 *     summary: Create a new global AI service setting
 *     tags: [System & Admin]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               service_name:
 *                 type: string
 *               service_type:
 *                 type: string
 *               api_key:
 *                 type: string
 *               custom_url:
 *                 type: string
 *               system_prompt:
 *                 type: string
 *               is_active:
 *                 type: boolean
 *               model_name:
 *                 type: string
 *     responses:
 *       201:
 *         description: Global AI service setting created
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.post('/ai-service-settings/global', async (req, res, next) => {
  try {
    const { service_name, service_type, api_key, custom_url, system_prompt, is_active, model_name } = req.body;

    if (!service_name || !service_type) {
      return res.status(400).json({ error: 'service_name and service_type are required.' });
    }

    if (service_type !== 'ollama' && !api_key) {
      return res.status(400).json({ error: 'api_key is required for non-Ollama services.' });
    }

    const settingData = {
      service_name,
      service_type,
      api_key,
      custom_url: custom_url || null,
      system_prompt: system_prompt || null,
      is_active: is_active || false,
      model_name: model_name || null,
    };

    const result = await chatRepository.upsertGlobalAiServiceSetting(settingData);
    await logAdminAction(req.userId, null, 'GLOBAL_AI_SETTING_CREATED', { settingId: result.id, serviceName: service_name });
    res.status(201).json(result);
  } catch (error) {
    log('error', 'Error creating global AI service setting:', error);
    next(error);
  }
});

/**
 * @swagger
 * /admin/ai-service-settings/global/{id}:
 *   put:
 *     summary: Update a global AI service setting
 *     tags: [System & Admin]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               service_name:
 *                 type: string
 *               service_type:
 *                 type: string
 *               api_key:
 *                 type: string
 *               custom_url:
 *                 type: string
 *               system_prompt:
 *                 type: string
 *               is_active:
 *                 type: boolean
 *               model_name:
 *                 type: string
 *     responses:
 *       200:
 *         description: Global AI service setting updated
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Setting not found
 */
router.put('/ai-service-settings/global/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { service_name, service_type, api_key, custom_url, system_prompt, is_active, model_name } = req.body;

    // Verify the setting exists and is global
    const existing = await chatRepository.getGlobalAiServiceSettingById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Global AI service setting not found.' });
    }

    if (!service_name || !service_type) {
      return res.status(400).json({ error: 'service_name and service_type are required.' });
    }

    const settingData = {
      id,
      service_name,
      service_type,
      api_key, // Will be encrypted in repository
      custom_url: custom_url || null,
      system_prompt: system_prompt || null,
      is_active: is_active !== undefined ? is_active : existing.is_active,
      model_name: model_name || null,
    };

    const result = await chatRepository.upsertGlobalAiServiceSetting(settingData);
    await logAdminAction(req.userId, null, 'GLOBAL_AI_SETTING_UPDATED', { settingId: id, serviceName: service_name });
    res.status(200).json(result);
  } catch (error) {
    log('error', `Error updating global AI service setting ${req.params.id}:`, error);
    next(error);
  }
});

/**
 * @swagger
 * /admin/ai-service-settings/global/{id}:
 *   delete:
 *     summary: Delete a global AI service setting
 *     tags: [System & Admin]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Global AI service setting deleted
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Setting not found
 */
router.delete('/ai-service-settings/global/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Verify the setting exists and is global
    const existing = await chatRepository.getGlobalAiServiceSettingById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Global AI service setting not found.' });
    }

    const success = await chatRepository.deleteGlobalAiServiceSetting(id);
    if (success) {
      await logAdminAction(req.userId, null, 'GLOBAL_AI_SETTING_DELETED', { settingId: id, serviceName: existing.service_name });
      res.status(200).json({ message: 'Global AI service setting deleted successfully.' });
    } else {
      res.status(404).json({ error: 'Global AI service setting not found.' });
    }
  } catch (error) {
    log('error', `Error deleting global AI service setting ${req.params.id}:`, error);
    next(error);
  }
});

/**
 * @swagger
 * /admin/ai-service-settings/global/sync-from-env:
 *   post:
 *     summary: Sync environment variables to global AI service setting
 *     tags: [System & Admin]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Environment variables synced to database
 *       400:
 *         description: Invalid environment configuration
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.post('/ai-service-settings/global/sync-from-env', async (req, res, next) => {
  try {
    const result = await syncEnvToDatabase();
    if (result) {
      await logAdminAction(req.userId, null, 'GLOBAL_AI_SETTING_SYNCED_FROM_ENV', { settingId: result.id });
      res.status(200).json({ 
        message: 'Environment variables synced to global AI service setting successfully.',
        setting: result
      });
    } else {
      res.status(400).json({ error: 'No valid AI service configuration found in environment variables.' });
    }
  } catch (error) {
    log('error', 'Error syncing environment variables to global AI service setting:', error);
    next(error);
  }
});

module.exports = router;
