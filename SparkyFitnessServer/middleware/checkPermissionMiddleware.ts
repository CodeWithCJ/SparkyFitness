import { canAccessUserData } from '../utils/permissionUtils.js';
import { log } from '../config/logging.js';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const checkPermissionMiddleware = (permissionType: any) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (req: any, res: any, next: any) => {
    // Identify the true authenticated caller (never the switched context).
    const authUserId =
      req.originalUserId || req.authenticatedUserId || req.userId;

    // Express parses a repeated query key (?userId=a&userId=b) or a JSON array
    // into an array, so pull every string out of each source — dropping an
    // array-valued target would let it skip the check while a handler reading
    // the same param still resolves it.
    const extractStrings = (value: unknown): string[] => {
      if (typeof value === 'string') return [value];
      if (Array.isArray(value)) {
        return value.filter((item): item is string => typeof item === 'string');
      }
      return [];
    };

    // Every user this request could act on: the validated active context
    // (req.userId, which authMiddleware/onBehalfOfMiddleware already vetted the
    // switch for) plus any user named in a client-supplied query/body param.
    // The caller must be authorized for ALL of them, not just one — a
    // client-supplied target that happens to be self must not stand in for the
    // active context the handler actually operates on.
    const candidateTargets = [
      ...new Set(
        [
          ...extractStrings(req.userId),
          ...extractStrings(req.query.userId),
          ...extractStrings(req.query.targetUserId),
          ...extractStrings(req.body?.user_id),
          ...extractStrings(req.body?.targetUserId),
        ].filter((id) => id.length > 0 && id !== 'undefined')
      ),
    ];

    try {
      let resolvedPermission = permissionType;
      if (permissionType === 'diary') {
        if (req.method === 'GET') {
          resolvedPermission = 'diary_read';
        }
      } else if (permissionType === 'checkin') {
        if (req.originalUrl && req.originalUrl.includes('/water-intake')) {
          resolvedPermission = 'water';
        } else if (
          req.method === 'GET' &&
          req.originalUrl &&
          !req.originalUrl.includes('/check-in-photos') &&
          !req.originalUrl.includes('/photos')
        ) {
          resolvedPermission = 'checkin_read';
        }
      } else if (permissionType === 'medications') {
        if (req.method === 'GET') {
          resolvedPermission = 'medications_read';
        }
      }

      for (const targetUserId of candidateTargets) {
        // Accessing own data is always allowed.
        if (targetUserId === authUserId) {
          continue;
        }
        log(
          'debug',
          `checkPermissionMiddleware: User ${authUserId} acting as/accessing data for ${targetUserId}. Checking '${resolvedPermission}' permission.`
        );
        const hasPermission = await canAccessUserData(
          targetUserId,
          resolvedPermission,
          authUserId
        );
        if (!hasPermission) {
          log(
            'warn',
            `Forbidden: User ${authUserId} attempted to access ${permissionType} for user ${targetUserId} without permission.`
          );
          return res.status(403).json({
            error: `Forbidden: You do not have permission to access ${permissionType} for this user.`,
          });
        }
      }
      return next();
    } catch (error) {
      log(
        'error',
        `Error in checkPermissionMiddleware for user ${authUserId} accessing ${permissionType}:`,
        error
      );
      return res
        .status(500)
        .json({ error: 'Internal server error during permission check.' });
    }
  };
};
export default checkPermissionMiddleware;
