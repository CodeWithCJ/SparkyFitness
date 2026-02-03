const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const authService = require('../../services/authService');
const { log } = require('../../config/logging');

/**
 * @swagger
 * /identity/users/accessible-users:
 *   get:
 *     summary: Get accessible users
 *     tags: [Identity & Security]
 *     description: Retrieves a list of users that the current authenticated user has access to.
 *     responses:
 *       200:
 *         description: A list of accessible users.
 *       403:
 *         description: User is not authorized to access this resource.
 */
router.get('/users/accessible-users', authenticate, async (req, res, next) => {
  try {
    const accessibleUsers = await authService.getAccessibleUsers(req.authenticatedUserId || req.userId);
    res.status(200).json(accessibleUsers);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /identity/access/can-access-user-data:
 *   get:
 *     summary: Check if the current user can access another user's data
 *     tags: [Identity & Security]
 *     description: Verifies if the authenticated user has permission to access specific data of another user.
 *     parameters:
 *       - in: query
 *         name: targetUserId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: permissionType
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Access check result.
 *       400:
 *         description: Missing targetUserId or permissionType.
 */
router.get('/access/can-access-user-data', authenticate, async (req, res, next) => {
  const { targetUserId, permissionType } = req.query;

  if (!targetUserId || !permissionType) {
    return res.status(400).json({ error: 'targetUserId and permissionType are required.' });
  }

  try {
    const canAccess = await authService.canAccessUserData(targetUserId, permissionType, req.userId);
    res.status(200).json({ canAccess });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /identity/access/check-family-access:
 *   get:
 *     summary: Check family access permissions
 *     tags: [Identity & Security]
 *     description: Checks if the authenticated user has family access permissions to another user's data.
 *     parameters:
 *       - in: query
 *         name: ownerUserId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: permission
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Family access check result.
 *       400:
 *         description: Missing ownerUserId or permission.
 */
router.get('/access/check-family-access', authenticate, async (req, res, next) => {
  const { ownerUserId, permission } = req.query;

  if (!ownerUserId || !permission) {
    return res.status(400).json({ error: 'ownerUserId and permission are required.' });
  }

  try {
    const hasAccess = await authService.checkFamilyAccess(req.userId, ownerUserId, permission);
    res.status(200).json({ hasAccess });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /identity/family-access:
 *   get:
 *     summary: Get family access entries
 *     tags: [Identity & Security]
 *     description: Retrieves a list of family access entries where the authenticated user is either the owner or the family member.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: A list of family access entries.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     format: uuid
 *                     description: The ID of the family access entry.
 *                   owner_user_id:
 *                     type: string
 *                     format: uuid
 *                     description: The ID of the user who owns the data.
 *                   family_user_id:
 *                     type: string
 *                     format: uuid
 *                     description: The ID of the family member who has access.
 *                   family_email:
 *                     type: string
 *                     format: email
 *                     description: The email of the family member.
 *                   access_permissions:
 *                     type: object
 *                     description: JSONB object defining the access permissions.
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       500:
 *         description: Server error.
 */
router.get('/family-access', authenticate, async (req, res, next) => {
  try {
    const authenticatedUserId = req.userId;
    if (!authenticatedUserId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Authenticated user ID not found.' });
    }

    const entries = await authService.getFamilyAccessEntries(authenticatedUserId);
    res.status(200).json(entries);
  } catch (error) {
    log('error', `Error fetching family access entries:`, error);
    next(error);
  }
});

/**
 * @swagger
 * /identity/family-access:
 *   post:
 *     summary: Create a new family access entry
 *     tags: [Identity & Security]
 *     description: Creates a new family access entry, allowing another user to access the authenticated user's data.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - family_user_id
 *               - family_email
 *               - access_permissions
 *             properties:
 *               family_user_id:
 *                 type: string
 *                 format: uuid
 *                 description: The ID of the family member to grant access to.
 *               family_email:
 *                 type: string
 *                 format: email
 *                 description: The email of the family member.
 *               access_permissions:
 *                 type: object
 *                 description: JSONB object defining the access permissions.
 *     responses:
 *       201:
 *         description: Family access entry created successfully.
 *       400:
 *         description: Missing required fields.
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       403:
 *         description: User is not authorized to create this entry.
 *       500:
 *         description: Server error.
 */
router.post('/family-access', authenticate, async (req, res, next) => {
  const entryData = req.body;

  // Normalize access_permissions keys (replace spaces with underscores)
  if (entryData.access_permissions) {
    const normalizedPermissions = {};
    for (const [key, value] of Object.entries(entryData.access_permissions)) {
      normalizedPermissions[key.replace(/ /g, '_')] = value;
    }
    entryData.access_permissions = normalizedPermissions;
  }


  if (!entryData.family_user_id || !entryData.family_email || !entryData.access_permissions) {
    return res.status(400).json({ error: 'Family User ID, Family Email, and Access Permissions are required.' });
  }

  try {
    const newEntry = await authService.createFamilyAccessEntry(req.userId, entryData);
    res.status(201).json(newEntry);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * @swagger
 * /identity/family-access/{id}:
 *   put:
 *     summary: Update a family access entry
 *     tags: [Identity & Security]
 *     description: Updates an existing family access entry.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *           description: The ID of the family access entry to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               family_user_id:
 *                 type: string
 *                 format: uuid
 *                 description: The ID of the family member.
 *               family_email:
 *                 type: string
 *                 format: email
 *                 description: The email of the family member.
 *               access_permissions:
 *                 type: object
 *                 description: JSONB object defining the access permissions.
 *     responses:
 *       200:
 *         description: Family access entry updated successfully.
 *       400:
 *         description: Family Access ID is required.
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       403:
 *         description: User is not authorized to update this entry.
 *       404:
 *         description: Family access entry not found or not authorized to update.
 *       500:
 *         description: Server error.
 */
router.put('/family-access/:id', authenticate, async (req, res, next) => {
  const { id } = req.params;
  const updateData = req.body;

  // Normalize access_permissions keys (replace spaces with underscores)
  if (updateData.access_permissions) {
    const normalizedPermissions = {};
    for (const [key, value] of Object.entries(updateData.access_permissions)) {
      normalizedPermissions[key.replace(/ /g, '_')] = value;
    }
    updateData.access_permissions = normalizedPermissions;
  }


  if (!id) {
    return res.status(400).json({ error: 'Family Access ID is required.' });
  }

  try {
    const updatedEntry = await authService.updateFamilyAccessEntry(req.userId, id, updateData);
    res.status(200).json(updatedEntry);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    if (error.message === 'Family access entry not found or not authorized to update.') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * @swagger
 * /identity/family-access/{id}:
 *   delete:
 *     summary: Delete a family access entry
 *     tags: [Identity & Security]
 *     description: Deletes a specific family access entry.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *           description: The ID of the family access entry to delete.
 *     responses:
 *       200:
 *         description: Family access entry deleted successfully.
 *       400:
 *         description: Family Access ID is required.
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       403:
 *         description: User is not authorized to delete this entry.
 *       404:
 *         description: Family access entry not found or not authorized to delete.
 *       500:
 *         description: Server error.
 */
router.delete('/family-access/:id', authenticate, async (req, res, next) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: 'Family Access ID is required.' });
  }

  try {
    await authService.deleteFamilyAccessEntry(req.userId, id);
    res.status(200).json({ message: 'Family access entry deleted successfully.' });
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    if (error.message === 'Family access entry not found or not authorized to delete.') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

module.exports = router;