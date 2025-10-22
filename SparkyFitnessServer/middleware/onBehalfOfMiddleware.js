const familyAccessRepository = require('../models/familyAccessRepository');
const { log } = require('../config/logging');

const onBehalfOfMiddleware = async (req, res, next) => {
  const onBehalfOfUserId = req.headers['x-on-behalf-of-user-id'];

  if (onBehalfOfUserId && req.userId) {
    // Ensure the authenticated user is not trying to act on behalf of themselves
    if (req.userId === onBehalfOfUserId) {
      // If they are trying to act on behalf of themselves, just proceed normally
      // No need to set originalUserId or change req.userId
      return next();
    }

    try {
      // Check if the authenticated user (req.userId) has family access to the onBehalfOfUserId
      // For the middleware, we check for any of the core permissions that would allow "viewing as"
      const hasAccess = await familyAccessRepository.checkFamilyAccessPermission(req.userId, onBehalfOfUserId, ['diary', 'checkin', 'reports']);

      if (hasAccess) {
        req.originalUserId = req.userId; // Store the actual authenticated user's ID
        req.userId = onBehalfOfUserId; // Set the userId to the one being acted on behalf of
        log('info', `User ${req.originalUserId} is acting on behalf of user ${req.userId}`);
      } else {
        log('warn', `Unauthorized attempt: User ${req.userId} tried to act on behalf of user ${onBehalfOfUserId} without permission.`);
        return res.status(403).json({ error: 'Forbidden: You do not have permission to act on behalf of this user.' });
      }
    } catch (error) {
      log('error', `Error in onBehalfOfMiddleware for user ${req.userId} acting on behalf of ${onBehalfOfUserId}:`, error);
      return res.status(500).json({ error: 'Internal server error during profile switch.' });
    }
  }
  next();
};

module.exports = onBehalfOfMiddleware;