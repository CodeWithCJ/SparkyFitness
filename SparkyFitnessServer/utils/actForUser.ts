import { canAccessUserData } from './permissionUtils.js';

// The grants that let a family member work in another account. Account
// switching and the x-on-behalf-of-user-id header both decide with this, so
// they admit the same people; each route still checks its own permission.
const ACT_FOR_USER_PERMISSIONS = [
  'reports',
  'diary',
  'checkin',
  'medications',
  'symptoms',
] as const;

export async function canActForUser(
  targetUserId: string,
  actorUserId: string
): Promise<boolean> {
  const results = await Promise.all(
    ACT_FOR_USER_PERMISSIONS.map((permission) =>
      canAccessUserData(targetUserId, permission, actorUserId)
    )
  );
  return results.some(Boolean);
}
