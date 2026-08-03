export type ShareStatus = 'public' | 'family' | 'private' | null;

export type OwnershipFilter = 'all' | 'mine' | 'family' | 'public';

/**
 * Filters library/search items by ownership: 'mine' = owned by the current
 * user, 'family' = another user's non-public item, 'public' = shared publicly.
 * Handles both snake_case and camelCase item shapes.
 */
export const filterByOwnership = <T extends { user_id?: string | null; userId?: string | null; is_public?: boolean | null; shared_with_public?: boolean | null; sharedWithPublic?: boolean | null }>(
  items: T[],
  filter: OwnershipFilter,
  currentUserId?: string
) => {
  if (filter === 'all') return items;
  return items.filter((item) => {
    const isOwner = !!((item.user_id && item.user_id === currentUserId) || (item.userId && item.userId === currentUserId));
    const isPublic = !!(item.is_public || item.shared_with_public || item.sharedWithPublic);

    if (filter === 'mine') {
      return isOwner;
    }
    if (filter === 'family') {
      // Without a current user id, "not mine" cannot be proven — a private
      // item could belong to the current user, so show none rather than all.
      return !!currentUserId && !isOwner && !isPublic && (item.user_id != null || item.userId != null);
    }
    if (filter === 'public') {
      return isPublic;
    }
    return true;
  });
};

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
