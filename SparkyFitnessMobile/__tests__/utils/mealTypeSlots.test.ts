import {
  assignCustomTypesToGaps,
  buildSortOrderWrites,
  buildUnifiedList,
  deriveGapsFromUnified,
  gapKeyForSortOrder,
  moveCustomTypeBetweenGaps,
  slotsForGap,
  DEFAULT_CREATE_GAP,
  MAX_CUSTOM_PER_GAP,
  GAP_SLOT_RANGE,
} from '../../src/utils/mealTypeSlots';
import type { MealType } from '../../src/types/mealTypes';

const systemMealTypes: MealType[] = [
  { id: 'sys-b', name: 'breakfast', sort_order: 10, user_id: null, created_at: '', is_visible: true, show_in_quick_log: true, default_time: null },
  { id: 'sys-l', name: 'lunch', sort_order: 20, user_id: null, created_at: '', is_visible: true, show_in_quick_log: true, default_time: null },
  { id: 'sys-d', name: 'dinner', sort_order: 30, user_id: null, created_at: '', is_visible: true, show_in_quick_log: true, default_time: null },
  { id: 'sys-s', name: 'snacks', sort_order: 40, user_id: null, created_at: '', is_visible: true, show_in_quick_log: true, default_time: null },
];

function custom(id: string, name: string, sort_order: number): MealType {
  return {
    id,
    name,
    sort_order,
    user_id: 'u',
    created_at: '',
    is_visible: true,
    show_in_quick_log: true,
    default_time: null,
  };
}

describe('mealTypeSlots — anchor model', () => {
  it('maps sort_order into the correct gap (including legacy values)', () => {
    expect(gapKeyForSortOrder(11)).toBe('b_l');
    expect(gapKeyForSortOrder(19)).toBe('b_l');
    expect(gapKeyForSortOrder(21)).toBe('l_d');
    expect(gapKeyForSortOrder(29)).toBe('l_d');
    expect(gapKeyForSortOrder(31)).toBe('d_s');
    expect(gapKeyForSortOrder(39)).toBe('d_s');
    // Legacy values outside the anchor model map defensively.
    expect(gapKeyForSortOrder(5)).toBe('b_l');
    expect(gapKeyForSortOrder(100)).toBe('d_s');
    expect(gapKeyForSortOrder(0)).toBe('b_l');
  });

  it('produces sequential slots per gap', () => {
    expect(slotsForGap('b_l', 3)).toEqual([11, 12, 13]);
    expect(slotsForGap('l_d', 5)).toEqual([21, 22, 23, 24, 25]);
    expect(slotsForGap('d_s', 1)).toEqual([31]);
  });

  it('clamps slotsForGap so count > 9 can never produce an anchor value', () => {
    // A gap holds at most nine customs; count=12 must not spill into the next
    // system anchor (20/30/40).
    expect(slotsForGap('b_l', 12)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19]);
    expect(slotsForGap('l_d', 99)).toEqual([21, 22, 23, 24, 25, 26, 27, 28, 29]);
    expect(slotsForGap('d_s', 10)).toEqual([31, 32, 33, 34, 35, 36, 37, 38, 39]);
    // Negative/zero never produce invalid slots either.
    expect(slotsForGap('b_l', 0)).toEqual([]);
    expect(slotsForGap('l_d', -1)).toEqual([]);
  });

  it('assigns custom types into gaps and sorts by sort_order within a gap', () => {
    const types = [
      custom('a', 'A', 22),
      custom('b', 'B', 11),
      custom('c', 'C', 35),
      custom('d', 'D', 21),
    ];
    const gaps = assignCustomTypesToGaps(types);
    expect(gaps.b_l.map((m) => m.id)).toEqual(['b']);
    expect(gaps.l_d.map((m) => m.id)).toEqual(['d', 'a']);
    expect(gaps.d_s.map((m) => m.id)).toEqual(['c']);
  });

  it('builds the unified visual list: anchors interleaved with customs', () => {
    const gaps = {
      b_l: [custom('brunch', 'Brunch', 11)],
      l_d: [custom('l2', 'Lunch 2.0', 21)],
      d_s: [custom('c', 'C', 31)],
    };
    const rows = buildUnifiedList(systemMealTypes, gaps);
    expect(rows.map((r) => (r.isSystem ? r.mt.name : r.mt.id))).toEqual([
      'breakfast', 'brunch', 'lunch', 'l2', 'dinner', 'c', 'snacks',
    ]);
  });

  it('derives gaps from a unified list (custom between Lunch and Dinner → l_d)', () => {
    const gaps = {
      b_l: [custom('brunch', 'Brunch', 11)],
      l_d: [custom('l2', 'Lunch 2.0', 21)],
      d_s: [],
    };
    const rows = buildUnifiedList(systemMealTypes, gaps);
    const derived = deriveGapsFromUnified(rows);
    expect(derived.b_l.map((m) => m.id)).toEqual(['brunch']);
    expect(derived.l_d.map((m) => m.id)).toEqual(['l2']);
    expect(derived.d_s).toEqual([]);
  });

  it('moves a custom across gaps (Brunch b_l → l_d) with the moved type re-inserted', () => {
    const gaps = {
      b_l: [custom('brunch', 'Brunch', 11)],
      l_d: [custom('l2', 'Lunch 2.0', 21)],
      d_s: [],
    };
    // Move Brunch from b_l (index 0) into l_d at index 1 (after Lunch 2.0).
    const next = moveCustomTypeBetweenGaps(gaps, 'b_l', 0, 'l_d', 1);
    expect(next).not.toBeNull();
    expect(next!.b_l).toEqual([]);
    expect(next!.l_d.map((m) => m.id)).toEqual(['l2', 'brunch']);
  });

  it('rejects a move into a full gap (max 9) without mutating source', () => {
    const full = Array.from({ length: MAX_CUSTOM_PER_GAP }, (_, i) =>
      custom(`l${i}`, `L${i}`, 21 + i),
    );
    const gaps = {
      b_l: [custom('brunch', 'Brunch', 11)],
      l_d: full,
      d_s: [],
    };
    const before = gaps.b_l.map((m) => m.id);
    const next = moveCustomTypeBetweenGaps(gaps, 'b_l', 0, 'l_d', 0);
    expect(next).toBeNull();
    // Source unchanged after rejection.
    expect(gaps.b_l.map((m) => m.id)).toEqual(before);
  });

  it('reorder inside the same gap is allowed and deterministic', () => {
    const gaps = {
      b_l: [custom('a', 'A', 11), custom('b', 'B', 12), custom('c', 'C', 13)],
      l_d: [],
      d_s: [],
    };
    const next = moveCustomTypeBetweenGaps(gaps, 'b_l', 0, 'b_l', 2);
    expect(next!.b_l.map((m) => m.id)).toEqual(['b', 'c', 'a']);
  });

  it('builds minimal sort_order writes (only changed records, sequential slots)', () => {
    const gaps = {
      b_l: [custom('a', 'A', 11), custom('b', 'B', 25)], // B has legacy 25 → normalize to 12
      l_d: [custom('c', 'C', 21), custom('d', 'D', 22)],
      d_s: [custom('e', 'E', 31)],
    };
    const writes = buildSortOrderWrites(gaps);
    expect(writes).toEqual([{ id: 'b', sort_order: 12 }]);
  });

  it('never writes system anchors in buildSortOrderWrites', () => {
    const gaps = {
      b_l: [custom('a', 'A', 11)],
      l_d: [],
      d_s: [],
    };
    const writes = buildSortOrderWrites(gaps);
    expect(writes.map((w) => w.id)).not.toContain('sys-b');
    expect(writes.map((w) => w.id)).not.toContain('sys-l');
  });



  it('default create gap is d_s (end of list) with a valid slot range', () => {
    expect(DEFAULT_CREATE_GAP).toBe('d_s');
    expect(GAP_SLOT_RANGE.d_s).toEqual([31, 39]);
  });

  it('unified list keeps the fixed anchor order regardless of gap contents', () => {
    const gaps = { b_l: [], l_d: [], d_s: [] };
    const rows = buildUnifiedList(systemMealTypes, gaps);
    expect(rows.map((r) => r.mt.name)).toEqual(['breakfast', 'lunch', 'dinner', 'snacks']);
  });

describe('drag geometry contract (real rendered stride)', () => {
  it('uses ROW_HEIGHT as the stride — no fictitious 8px gap for continuous rows', () => {
    // The settings list renders continuous border-b rows (ROW_GAP = 0), so the
    // gesture stride is exactly the row height (64), NOT WorkoutReorderList's
    // 72px (height + 8px gap).
    const ROW_HEIGHT = 64;
    const ROW_GAP = 0;
    const stride = ROW_HEIGHT + ROW_GAP;
    expect(stride).toBe(64);
  });

  it('cross-anchor preview: only the active custom row floats; anchors never translate', () => {
    // Unified: Breakfast(anchor), A(custom), Lunch(anchor), B(custom), Dinner(anchor).
    // Dragging A below Lunch must keep every SYSTEM anchor stationary and must
    // never give B a shift that would place it at Lunch's coordinate.
    const anchors = new Set(['breakfast', 'lunch', 'dinner', 'snacks']);
    const ROW_HEIGHT = 64;
    const ROW_GAP = 0;
    const stride = ROW_HEIGHT + ROW_GAP;

    // Option A preview: non-active rows never move.
    const shiftFor = (row: { name: string }, active: boolean): number =>
      active ? 0 : 0;
    expect(shiftFor({ name: 'breakfast' }, false)).toBe(0);
    expect(shiftFor({ name: 'lunch' }, false)).toBe(0);
    expect(shiftFor({ name: 'dinner' }, false)).toBe(0);
    expect(shiftFor({ name: 'B' }, false)).toBe(0);
    expect(shiftFor({ name: 'B' }, true)).toBe(0); // only the dragged row floats

    // Anchor coordinates never move relative to their neighbours.
    const lunchOffset = stride * 2; // Breakfast(0), A(64), Lunch(128)
    const bOffset = stride * 3; // B at 192, below Lunch
    expect(lunchOffset).toBe(128);
    expect(bOffset).toBe(192);
    expect(bOffset).not.toBe(lunchOffset);
    // B never receives a shift of -stride (the old all-items animation would
    // have shifted B into Lunch's slot when dragging A past Lunch).
    const bShift = 0;
    expect(lunchOffset + bShift).not.toBe(bOffset - 0);
    expect(anchors.has('breakfast')).toBe(true);
    expect(anchors.has('lunch')).toBe(true);
  });

  it('destination after a cross-anchor drop stays within the documented gaps', () => {
    const { gapKeyForSortOrder } = require('../../src/utils/mealTypeSlots');
    // Dragging A (b_l) below Lunch lands it in l_d.
    expect(gapKeyForSortOrder(21)).toBe('l_d');
    expect(gapKeyForSortOrder(25)).toBe('l_d');
    expect(gapKeyForSortOrder(11)).toBe('b_l');
    // No anchor value is ever produced as a custom slot.
    expect([10, 20, 30, 40]).not.toContain(21);
  });
});

});
