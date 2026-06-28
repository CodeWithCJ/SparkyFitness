import { canAccessUserData } from '../utils/permissionUtils.js';
import { log } from '../config/logging.js';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const checkPermissionMiddleware = (permissionType: any) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (req: any, res: any, next: any) => {
    // 1. Identify the target user (from query, body, or active context)
    const targetUserId =
      req.query.userId ||
      req.query.targetUserId ||
      req.body?.user_id ||
      req.body?.targetUserId ||
      req.userId;

    // 2. Identify the true authenticated caller
    const authUserId =
      req.originalUserId || req.authenticatedUserId || req.userId;

    // 3. If accessing own data, always allow
    if (targetUserId === authUserId) {
      return next();
    }

    try {
      log(
        'debug',
        `checkPermissionMiddleware: User ${authUserId} acting as/accessing data for ${targetUserId}. Checking '${permissionType}' permission.`
      );
      const hasPermission = await canAccessUserData(
        targetUserId,
        permissionType,
        authUserId
      );
      if (hasPermission) {
        next();
      } else {
        log(
          'warn',
          `Forbidden: User ${authUserId} attempted to access ${permissionType} for user ${targetUserId} without permission.`
        );
        return res.status(403).json({
          error: `Forbidden: You do not have permission to access ${permissionType} for this user.`,
        });
      }
    } catch (error) {
      log(
        'error',
        `Error in checkPermissionMiddleware for user ${authUserId} accessing ${permissionType} for ${targetUserId}:`,
        error
      );
      return res
        .status(500)
        .json({ error: 'Internal server error during permission check.' });
    }
  };
};
export default checkPermissionMiddleware;
