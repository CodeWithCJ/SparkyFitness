import type { HeaderItem } from '../hooks/useScreenHeader';

export type ShareStatus = 'public' | 'family' | 'private' | null;

export type OwnershipFilter = 'all' | 'mine' | 'family' | 'public';

export const OWNERSHIP_FILTER_LABELS: Record<OwnershipFilter, string> = {
  all: 'All',
  mine: 'Mine',
  family: 'Family',
  public: 'Public',
};

/**
 * Header filter-menu descriptor shared by the library screens: a "Show"
 * section of single-select ownership options, with the accent badge dot
 * marking a non-default selection. The filter is a persisted device
 * preference, so it lives behind a header menu instead of spending a
 * permanent bar row on a rarely-changed choice. `noun` names the collection
 * in the accessibility label ("Filter foods, filtered to Mine").
 */
export function ownershipFilterHeaderMenu({
  noun,
  identifier,
  filter,
  onSelect,
}: {
  noun: string;
  identifier: string;
  filter: OwnershipFilter;
  onSelect: (filter: OwnershipFilter) => void;
}): HeaderItem {
  return {
    kind: 'menu',
    sfSymbol: 'line.3.horizontal.decrease',
    ionicon: 'filter',
    showsBadge: filter !== 'all',
    accessibilityLabel:
      filter !== 'all'
        ? `Filter ${noun}, filtered to ${OWNERSHIP_FILTER_LABELS[filter]}`
        : `Filter ${noun}`,
    identifier,
    items: [
      {
        label: 'Show',
        items: (Object.keys(OWNERSHIP_FILTER_LABELS) as OwnershipFilter[]).map((option) => ({
          label: OWNERSHIP_FILTER_LABELS[option],
          selected: filter === option,
          onPress: () => onSelect(option),
        })),
      },
    ],
  };
}

/**
 * Empty-state copy for a list whose visible items are all hidden by the
 * ownership filter. Lives beside the menu factory so the wording stays
 * aligned with OWNERSHIP_FILTER_LABELS. Spread into a StatusView alongside
 * any layout props (e.g. `inline`). 'all' is excluded because it hides
 * nothing — callers keep their regular empty state for that case.
 */
export function ownershipFilterEmptyState({
  noun,
  filter,
  onReset,
}: {
  noun: string;
  filter: Exclude<OwnershipFilter, 'all'>;
  onReset: () => void;
}) {
  return {
    title: `No ${noun} in ${OWNERSHIP_FILTER_LABELS[filter]}`,
    subtitle: `Change the filter to see your other ${noun}.`,
    action: { label: 'Show All', onPress: onReset },
  };
}

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
