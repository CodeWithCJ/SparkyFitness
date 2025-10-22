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

router.get('/users', async (req, res, next) => {
  try {
    const { limit = 10, offset = 0, searchTerm = '' } = req.query;
    const users = await authService.getAllUsers(parseInt(limit), parseInt(offset), searchTerm);
    res.status(200).json(users);
  } catch (error) {
    log('error', 'Error fetching all users in adminRoutes:', error);
    next(error);
  }
});


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

    const success = await authService.deleteUser(userId);
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

    const success = await authService.updateUserStatus(userId, isActive);
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

    const success = await authService.updateUserRole(userId, role);
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



router.put('/users/:userId/full-name', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { fullName } = req.body;

    if (!fullName) {
      return res.status(400).json({ error: 'Full name is required.' });
    }

    const success = await authService.updateUserFullName(userId, fullName);
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

router.post('/users/:userId/reset-password', async (req, res, next) => {
  try {
    const { userId } = req.params;
    // To initiate a password reset, we need the user's email.
    // We can fetch the user by userId to get their email.
    const user = await authService.getUser(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    await authService.forgotPassword(user.email);
    await logAdminAction(req.userId, userId, 'USER_PASSWORD_RESET_INITIATED', { targetUserId: userId, email: user.email });
    res.status(200).json({ message: 'Password reset email sent to user.' });
  } catch (error) {
    log('error', `Error initiating password reset for user ${req.params.userId} in adminRoutes:`, error);
    next(error);
  }
});

module.exports = router;