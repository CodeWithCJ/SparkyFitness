import { createContext } from 'react';
import type { ViewInstance } from 'react-native';

/**
 * Where the focus view's sets table header and current-set card attach their refs, so the page can scroll the card into
 * view without pushing the header off the top.
 */
export interface FocusScrollTargets {
  card: React.RefObject<ViewInstance | null>;
  header: React.RefObject<ViewInstance | null>;
}

export const FocusScrollTargetContext =
  createContext<FocusScrollTargets | null>(null);

interface ScrollOffsetInput {
  /** The card's top and height, measured against the page. */
  cardTop: number;
  cardHeight: number;
  /** The sets table header's top against the page; null when there is none. */
  headerTop: number | null;
  /** Where the exercise title and thumbnail block ends against the page. */
  titleBottom?: number;
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
 * The scroll never stops part-way down the title block: it is clear of it,
 * on the table header (or the card top without one).
 */
export function focusScrollOffset({
  cardTop,
  cardHeight,
  headerTop,
  titleBottom = 0,
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
  const offset = needed <= farthest ? needed : cardTopOffset;
  if (offset <= 0 || offset >= titleBottom) return offset;
  return farthest >= titleBottom ? farthest : cardTopOffset;
}
