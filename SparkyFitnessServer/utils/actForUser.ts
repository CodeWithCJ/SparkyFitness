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
  // One at a time: each check borrows pooled connections, and reports comes
  // first because it also passes for diary and check-in holders.
  for (const permission of ACT_FOR_USER_PERMISSIONS) {
    if (await canAccessUserData(targetUserId, permission, actorUserId)) {
      return true;
    }
  }
  return false;
}
