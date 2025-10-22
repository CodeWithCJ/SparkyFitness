const familyAccessRepository = require('../models/familyAccessRepository');
const { log } = require('../config/logging');

const checkPermissionMiddleware = (permissionType) => {
  return async (req, res, next) => {
    // If not acting on behalf of another user, or if it's the original user, proceed
    if (!req.originalUserId || req.userId === req.originalUserId) {
      return next();
    }

    try {
      const hasPermission = await familyAccessRepository.checkFamilyAccessPermission(req.originalUserId, req.userId, permissionType);

      if (hasPermission) {
        next();
      } else {
        log('warn', `Forbidden: User ${req.originalUserId} attempted to access ${permissionType} for user ${req.userId} without permission.`);
        return res.status(403).json({ error: `Forbidden: You do not have permission to access ${permissionType} for this user.` });
      }
    } catch (error) {
      log('error', `Error in checkPermissionMiddleware for user ${req.originalUserId} accessing ${permissionType} for ${req.userId}:`, error);
      return res.status(500).json({ error: 'Internal server error during permission check.' });
    }
  };
};

module.exports = checkPermissionMiddleware;