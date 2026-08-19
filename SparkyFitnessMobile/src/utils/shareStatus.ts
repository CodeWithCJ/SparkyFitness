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
  labels = OWNERSHIP_FILTER_LABELS,
  showLabel = 'Show',
  filterAccessibilityLabel = 'Filter {{noun}}',
}: {
  noun: string;
  identifier: string;
  filter: OwnershipFilter;
  labels?: Record<OwnershipFilter, string>;
  showLabel?: string;
  filterAccessibilityLabel?: string;
  onSelect: (filter: OwnershipFilter) => void;
}): HeaderItem {
  return {
    kind: 'menu',
    sfSymbol: 'line.3.horizontal.decrease',
    ionicon: 'filter',
    showsBadge: filter !== 'all',
    badgeValue: filter !== 'all' ? '•' : undefined,
    accessibilityLabel: (() => {
      const base = filterAccessibilityLabel.replace('{{noun}}', noun);
      if (filter === 'all') return base;
      return base.includes('{{filter}}') ? base.replace('{{filter}}', labels[filter]) : `${base}, ${labels[filter]}`;
    })(),
    customAccessibilityLabel: filterAccessibilityLabel.replace('{{noun}}', noun).replace(/,?\s*filtered to \{\{filter\}\}/, '').replace(/,?\s*wybrano: \{\{filter\}\}/, ''),
    nativeAccessibilityLabel: (() => {
      const base = filterAccessibilityLabel.replace('{{noun}}', noun);
      if (filter === 'all') return base;
      return base.includes('{{filter}}')
        ? base.replace('{{filter}}', labels[filter])
        : `${base}, ${labels[filter]}`;
    })(),
    identifier,
    items: [
      {
        label: showLabel,
        items: (Object.keys(labels) as OwnershipFilter[]).map((option) => ({
          label: labels[option],
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
  labels = OWNERSHIP_FILTER_LABELS,
  emptyTitle = 'No {{noun}} in {{filter}}',
  emptySubtitle = 'Change the filter to see your other {{noun}}.',
  showAllLabel = 'Show All',
}: {
  noun: string;
  filter: Exclude<OwnershipFilter, 'all'>;
  labels?: Record<OwnershipFilter, string>;
  emptyTitle?: string;
  emptySubtitle?: string;
  showAllLabel?: string;
  onReset: () => void;
}) {
  return {
    title: emptyTitle.replace('{{noun}}', noun).replace('{{filter}}', labels[filter]),
    subtitle: emptySubtitle.replace('{{noun}}', noun),
    action: { label: showAllLabel, onPress: onReset },
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
