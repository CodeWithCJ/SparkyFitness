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
 * A small gold star marking a favorited row in the food-search lists.
 *
 * Indicator only, deliberately not a toggle: the row's tap target belongs to
 * the row itself (it opens the detail screen, where the real star button
 * lives), and mobile rows are too tight to carry a second hit area. It exists
 * because once a query is typed the FAVORITES section header is gone, leaving
 * the search results with no favorite signal at all.
 *
 * Gold, NOT accent — the colour carries the interactivity cue here. Accent
 * (blue) is reserved for things you can tap, which is why the star BUTTON in
 * the food/meal detail header stays accent-tinted while this passive marker
 * does not. Matches web, whose row star is `fill-current text-yellow-500`.
 *
 * `--color-cat-amber` rather than web's literal yellow-500: it is the closest
 * token to it (hsl 40 vs 45) and, unlike a hardcoded hex, it has a dark-mode
 * value so the star stays legible on a dark background. Picked over
 * `--color-icon-warning` — same family, but a favorite is not a warning.
 */
const FavoriteStar: React.FC<FavoriteStarProps> = ({ show, size = 13 }) => {
  const [goldColor] = useCSSVariable(['--color-cat-amber']) as [string];

  if (!show) return null;

  return (
    <Ionicons
      name="star"
      size={size}
      color={goldColor}
      // The glyph is optically light against the bold calorie text next to it.
      style={{ marginTop: 1 }}
      accessibilityLabel="Favorite"
    />
  );
};

export default FavoriteStar;
