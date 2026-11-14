import { createContext } from 'react';
import type { View } from 'react-native';

/**
 * Where the focus view's sets table header and current-set card (or the rest
 * card while resting) attach their refs, so the page can scroll the card into
 * view without pushing the header off the top.
 */
export interface FocusScrollTargets {
  card: React.RefObject<View | null>;
  header: React.RefObject<View | null>;
}

export const FocusScrollTargetContext =
  createContext<FocusScrollTargets | null>(null);

interface ScrollOffsetInput {
  /** The card's top and height, measured against the page. */
  cardTop: number;
  cardHeight: number;
  /** The sets table header's top against the page; null when there is none. */
  headerTop: number | null;
  /** The scroll view's height, and the part of its bottom the footer covers. */
  viewportHeight: number;
  bottomInset: number;
  margin: number;
}

/**
 * How far to scroll so the whole card sits above the footer, and no further:
 * the demo thumbnail and the table header stay in view wherever they fit.
 * Never past the table header while the card still fits from there,
 * otherwise to the card top. Without a viewport size, the card top.
 */
export function focusScrollOffset({
  cardTop,
  cardHeight,
  headerTop,
  viewportHeight,
  bottomInset,
  margin,
}: ScrollOffsetInput): number {
  const cardTopOffset = Math.max(0, cardTop - margin);
  const visibleHeight = viewportHeight - bottomInset;
  if (viewportHeight <= 0 || visibleHeight <= 0) return cardTopOffset;
  const needed = Math.max(0, cardTop + cardHeight + margin - visibleHeight);
  const farthest =
    headerTop != null ? Math.max(0, headerTop - margin) : cardTopOffset;
  return needed <= farthest ? needed : cardTopOffset;
}
