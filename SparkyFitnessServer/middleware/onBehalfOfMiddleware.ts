import { canActForUser } from '../utils/actForUser.js';
import { log } from '../config/logging.js';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const onBehalfOfMiddleware = async (req: any, res: any, next: any) => {
  const onBehalfOfUserId = req.headers['x-on-behalf-of-user-id'];
  const authUserId = req.authenticatedUserId || req.userId;

  if (onBehalfOfUserId && authUserId) {
    // Ensure the authenticated user is not trying to act on behalf of themselves
    if (authUserId === onBehalfOfUserId) {
      // If they are trying to act on behalf of themselves, just proceed normally
      // No need to set originalUserId or change req.userId
      return next();
    }
    try {
      const hasAccess = await canActForUser(onBehalfOfUserId, authUserId);
      if (hasAccess) {
        req.originalUserId = authUserId; // Store the actual authenticated user's ID
        req.userId = onBehalfOfUserId; // Set the userId to the one being acted on behalf of
        log(
          'info',
          `User ${req.originalUserId} is acting on behalf of user ${req.userId}`
        );
      } else {
        log(
          'warn',
          `Unauthorized attempt: User ${authUserId} tried to act on behalf of user ${onBehalfOfUserId} without permission.`
        );
        return res.status(403).json({
          error:
            'Forbidden: You do not have permission to act on behalf of this user.',
        });
      }
    } catch (error) {
      log(
        'error',
        `Error in onBehalfOfMiddleware for user ${authUserId} acting on behalf of ${onBehalfOfUserId}:`,
        error
      );
      return res
        .status(500)
        .json({ error: 'Internal server error during profile switch.' });
    }
  }
  next();
};
export default onBehalfOfMiddleware;
