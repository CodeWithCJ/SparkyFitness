import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useCSSVariable } from 'uniwind';

interface FavoriteStarProps {
  /**
   * Rendered as null when false rather than the caller branching, so the star
   * occupies no space on non-favorited rows and the calorie value stays put.
   */
  show: boolean;
  size?: number;
}

/**
 * A small accent star marking a favorited row in the food-search lists.
 *
 * Indicator only, deliberately not a toggle: the row's tap target belongs to
 * the row itself (it opens the detail screen, where the real star button
 * lives), and mobile rows are too tight to carry a second hit area. It exists
 * because once a query is typed the FAVORITES section header is gone, leaving
 * the search results with no favorite signal at all.
 */
const FavoriteStar: React.FC<FavoriteStarProps> = ({ show, size = 13 }) => {
  const [accentColor] = useCSSVariable(['--color-accent-primary']) as [string];

  if (!show) return null;

  return (
    <Ionicons
      name="star"
      size={size}
      color={accentColor}
      // The glyph is optically light against the bold calorie text next to it.
      style={{ marginTop: 1 }}
      accessibilityLabel="Favorite"
    />
  );
};

export default FavoriteStar;
