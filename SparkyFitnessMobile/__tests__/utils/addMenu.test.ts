import {
  ADD_MENU_ITEM_KEYS,
  DEFAULT_ADD_MENU_CARDS,
} from '../../src/constants/addMenuItems';
import {
  chunkIntoLines,
  groupRowsByStyle,
  mergeGroupOrder,
  mergeRowOrder,
  resolveRowStyle,
  placeInCardSlot,
  resolveAddMenuCards,
  rowKeys,
} from '../../src/utils/addMenu';

describe('addMenu', () => {
  describe('resolveAddMenuCards', () => {
    it('returns the default cards when nothing is saved', () => {
      expect(resolveAddMenuCards(undefined)).toEqual(DEFAULT_ADD_MENU_CARDS);
    });

    it('drops unknown and repeated items and fills the gaps', () => {
      expect(resolveAddMenuCards(['mood', 'nonsense', 'mood', 'food'])).toEqual(
        ['mood', 'food', 'exercise', 'measurements']
      );
    });

    it('keeps only four', () => {
      expect(
        resolveAddMenuCards([
          'mood',
          'food',
          'exercise',
          'scanFood',
          'syncHealth',
        ])
      ).toEqual(['mood', 'food', 'exercise', 'scanFood']);
    });
  });

  describe('placeInCardSlot', () => {
    const cards = ['food', 'exercise', 'measurements', 'scanFood'] as const;

    it('swaps with the slot an item already holds', () => {
      expect(placeInCardSlot(cards, 0, 'scanFood')).toEqual([
        'scanFood',
        'exercise',
        'measurements',
        'food',
      ]);
    });

    it('lets a row item take a slot, sending the old card to the rows', () => {
      const next = placeInCardSlot(cards, 1, 'mood');
      expect(next).toEqual(['food', 'mood', 'measurements', 'scanFood']);
      expect(rowKeys(ADD_MENU_ITEM_KEYS, next)).toContain('exercise');
    });

    it('does nothing when the slot already holds the item', () => {
      expect(placeInCardSlot(cards, 0, 'food')).toEqual([...cards]);
    });
  });

  describe('rows', () => {
    const cards = [...DEFAULT_ADD_MENU_CARDS];

    it('lists everything not on a card, in order', () => {
      expect(rowKeys(ADD_MENU_ITEM_KEYS, cards)).toEqual(
        ADD_MENU_ITEM_KEYS.filter((key) => !cards.includes(key))
      );
    });

    it('keeps card items in place when the rows are reordered', () => {
      const rows = rowKeys(ADD_MENU_ITEM_KEYS, cards);
      const reordered = [...rows].reverse();
      const merged = mergeRowOrder(ADD_MENU_ITEM_KEYS, cards, reordered);
      expect(merged.slice(0, 4)).toEqual(cards);
      expect(rowKeys(merged, cards)).toEqual(reordered);
    });
  });

  describe('groupRowsByStyle', () => {
    it('splits rows by how the sheet draws them, keeping their order', () => {
      expect(
        groupRowsByStyle(['syncHealth', 'mood', 'symptoms', 'askSparky'])
      ).toEqual({
        list: ['symptoms'],
        compact: ['mood'],
        action: ['syncHealth', 'askSparky'],
      });
    });
  });

  describe('row style choices', () => {
    it('moves an item to the group the person chose', () => {
      expect(
        groupRowsByStyle(['symptoms', 'mood', 'askSparky'], {
          symptoms: 'action',
          mood: 'list',
        })
      ).toEqual({
        list: ['mood'],
        compact: [],
        action: ['symptoms', 'askSparky'],
      });
    });

    it('falls back to the default for a style it does not know', () => {
      expect(resolveRowStyle('mood', { mood: 'sideways' as never })).toBe(
        'compact'
      );
      expect(resolveRowStyle('mood', {})).toBe('compact');
    });
  });

  describe('chunkIntoLines', () => {
    it('puts two on a line and leaves a last one alone', () => {
      expect(chunkIntoLines(['a', 'b', 'c'])).toEqual([['a', 'b'], ['c']]);
      expect(chunkIntoLines(['a', 'b'])).toEqual([['a', 'b']]);
      expect(chunkIntoLines([])).toEqual([]);
    });
  });

  describe('mergeGroupOrder', () => {
    it('moves one group and leaves the other rows where they were', () => {
      const cards = DEFAULT_ADD_MENU_CARDS;
      const before = rowKeys(ADD_MENU_ITEM_KEYS, cards);
      const merged = mergeGroupOrder(ADD_MENU_ITEM_KEYS, cards, [
        'syncHealth',
        'askSparky',
      ]);
      const after = rowKeys(merged, cards);

      expect(groupRowsByStyle(after).action).toEqual([
        'syncHealth',
        'askSparky',
      ]);
      expect(groupRowsByStyle(after).list).toEqual(
        groupRowsByStyle(before).list
      );
      expect(groupRowsByStyle(after).compact).toEqual(
        groupRowsByStyle(before).compact
      );
    });
  });
});
