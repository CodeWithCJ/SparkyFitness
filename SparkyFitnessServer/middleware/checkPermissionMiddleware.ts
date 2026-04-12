import { canAccessUserData } from '../utils/permissionUtils.js';
import { log } from '../config/logging.js';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const checkPermissionMiddleware = (permissionType: any) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (req: any, res: any, next: any) => {
    // If not acting on behalf of another user, or if it's the original user, proceed
    if (!req.originalUserId || req.userId === req.originalUserId) {
      return next();
    }
    try {
      log(
        'debug',
        `checkPermissionMiddleware: User ${req.originalUserId} acting as ${req.userId}. Checking '${permissionType}' permission.`
      );
      const hasPermission = await canAccessUserData(
        req.userId,
        permissionType,
        req.originalUserId
      );
      if (hasPermission) {
        next();
      } else {
        log(
          'warn',
          `Forbidden: User ${req.originalUserId} attempted to access ${permissionType} for user ${req.userId} without permission.`
        );
        return res.status(403).json({
          error: `Forbidden: You do not have permission to access ${permissionType} for this user.`,
        });
      }
    } catch (error) {
      log(
        'error',
        `Error in checkPermissionMiddleware for user ${req.originalUserId} accessing ${permissionType} for ${req.userId}:`,
        error
      );
      return res
        .status(500)
        .json({ error: 'Internal server error during permission check.' });
    }
  };
};
export default checkPermissionMiddleware;
