import {
  ADD_MENU_CARD_COUNT,
  ADD_MENU_ITEM_ROW_STYLES,
  ADD_MENU_LINE_SIZE,
  ADD_MENU_ROW_STYLES,
  ADD_MENU_ITEM_KEYS,
  DEFAULT_ADD_MENU_CARDS,
  type AddMenuItemKey,
  type AddMenuRowStyle,
} from '../constants/addMenuItems';
import { resolveKeyOrder } from './reorderUtils';

/**
 * The saved card slots, made safe to use: unknown and repeated items are
 * dropped, and any slot left empty is filled with the first default card not
 * already placed, so there are always four distinct cards.
 */
export function resolveAddMenuCards(
  saved: readonly string[] | undefined
): AddMenuItemKey[] {
  const isKey = (value: string): value is AddMenuItemKey =>
    (ADD_MENU_ITEM_KEYS as readonly string[]).includes(value);
  const cards: AddMenuItemKey[] = [];
  for (const key of saved ?? []) {
    if (cards.length >= ADD_MENU_CARD_COUNT) break;
    if (isKey(key) && !cards.includes(key)) cards.push(key);
  }
  for (const key of [...DEFAULT_ADD_MENU_CARDS, ...ADD_MENU_ITEM_KEYS]) {
    if (cards.length >= ADD_MENU_CARD_COUNT) break;
    if (!cards.includes(key)) cards.push(key);
  }
  return cards;
}

/**
 * Puts `key` in a card slot. If it was already in another slot the two swap, so
 * nothing is ever in two places; otherwise the item it replaces drops to the
 * rows.
 */
export function placeInCardSlot(
  cards: readonly AddMenuItemKey[],
  slotIndex: number,
  key: AddMenuItemKey
): AddMenuItemKey[] {
  const next = [...cards];
  const previous = next[slotIndex];
  if (previous === undefined || previous === key) return next;
  const from = next.indexOf(key);
  if (from >= 0) next[from] = previous;
  next[slotIndex] = key;
  return next;
}

/** The items not in a card slot, in the order the rows show them. */
export function rowKeys(
  order: readonly string[],
  cards: readonly AddMenuItemKey[]
): AddMenuItemKey[] {
  return resolveKeyOrder(order, ADD_MENU_ITEM_KEYS).filter(
    (key) => !cards.includes(key)
  );
}

/**
 * The full saved order after the rows were rearranged: the row items take the
 * places the row items held, in their new order, and the card items stay where
 * they were.
 */
export function mergeRowOrder(
  order: readonly string[],
  cards: readonly AddMenuItemKey[],
  reorderedRows: readonly AddMenuItemKey[]
): AddMenuItemKey[] {
  const full = resolveKeyOrder(order, ADD_MENU_ITEM_KEYS);
  const queue = [...reorderedRows];
  return full.map((key) =>
    cards.includes(key) ? key : (queue.shift() ?? key)
  );
}

/**
 * The rows split by how the sheet draws them, each keeping its given order, in
 * the order the sheet shows the styles. Settings lists the same groups so what
 * is arranged there is what the sheet shows.
 */
export function groupRowsByStyle(
  keys: readonly AddMenuItemKey[],
  overrides: AddMenuRowStyleOverrides = {}
): Record<AddMenuRowStyle, AddMenuItemKey[]> {
  const groups: Record<AddMenuRowStyle, AddMenuItemKey[]> = {
    list: [],
    compact: [],
    action: [],
  };
  for (const style of ADD_MENU_ROW_STYLES) {
    groups[style] = keys.filter(
      (key) => resolveRowStyle(key, overrides) === style
    );
  }
  return groups;
}

/** How the person chose to show each item, where it differs from its default. */
export type AddMenuRowStyleOverrides = Partial<
  Record<AddMenuItemKey, AddMenuRowStyle>
>;

/** An item's style: the saved choice if it is a style we know, else its default. */
export function resolveRowStyle(
  key: AddMenuItemKey,
  overrides: AddMenuRowStyleOverrides
): AddMenuRowStyle {
  const saved = overrides[key];
  return saved && ADD_MENU_ROW_STYLES.includes(saved)
    ? saved
    : ADD_MENU_ITEM_ROW_STYLES[key];
}

/**
 * The full saved order after one group of rows was rearranged: the group's
 * items take the places the group held, in their new order, and every other
 * row stays where it was.
 */
export function mergeGroupOrder(
  order: readonly string[],
  cards: readonly AddMenuItemKey[],
  reorderedGroup: readonly AddMenuItemKey[]
): AddMenuItemKey[] {
  const rows = rowKeys(order, cards);
  const queue = [...reorderedGroup];
  const next = rows.map((key) =>
    reorderedGroup.includes(key) ? (queue.shift() ?? key) : key
  );
  return mergeRowOrder(order, cards, next);
}

/**
 * Items split into the lines the sheet draws them on, `ADD_MENU_LINE_SIZE` to a
 * line; the last line may hold one and then takes the whole width. The sheet,
 * its preview and settings all count lines this way.
 */
export function chunkIntoLines<T>(items: readonly T[]): T[][] {
  const lines: T[][] = [];
  for (let start = 0; start < items.length; start += ADD_MENU_LINE_SIZE) {
    lines.push(items.slice(start, start + ADD_MENU_LINE_SIZE));
  }
  return lines;
}
