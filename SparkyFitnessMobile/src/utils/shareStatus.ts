export type ShareStatus = 'public' | 'family' | 'private' | null;

/**
 * Derives the share status ('public', 'family', 'private', or null) for an entity.
 * 
 * @param itemUserId The user ID of the entity owner.
 * @param isPublic Whether the entity has been shared publicly.
 * @param currentUserId The user ID of the currently logged-in user.
 */
export const deriveShareStatus = (
  itemUserId: string | null | undefined,
  isPublic: boolean | null | undefined,
  currentUserId: string | null | undefined
): ShareStatus => {
  if (isPublic) {
    return 'public';
  }
  if (itemUserId && currentUserId) {
    if (itemUserId === currentUserId) {
      return 'private';
    } else {
      return 'family';
    }
  }
  return null;
};
