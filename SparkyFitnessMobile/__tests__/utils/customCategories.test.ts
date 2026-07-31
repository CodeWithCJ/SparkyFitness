import {
  getVisibleSortedCustomCategories,
  getVisibleCustomMeasurementEntries,
} from '../../src/utils/customCategories';
import type {
  CustomCategory,
  CustomMeasurementEntry,
} from '../../src/types/customMeasurements';

const cat = (overrides: Partial<CustomCategory>): CustomCategory => ({
  id: 'cat-1',
  name: 'Category',
  display_name: null,
  measurement_type: '',
  frequency: 'Daily',
  data_type: 'numeric',
  ...overrides,
});

const entry = (
  overrides: Partial<CustomMeasurementEntry>,
): CustomMeasurementEntry => ({
  id: 'entry-1',
  category_id: 'cat-1',
  value: '120',
  entry_date: '2026-07-30',
  ...overrides,
});

describe('getVisibleSortedCustomCategories', () => {
  it('keeps categories missing is_visible', () => {
    const result = getVisibleSortedCustomCategories([cat({ id: 'a' })]);
    expect(result.map(c => c.id)).toEqual(['a']);
  });

  it('filters out categories with is_visible false', () => {
    const result = getVisibleSortedCustomCategories([
      cat({ id: 'visible', is_visible: true }),
      cat({ id: 'hidden', is_visible: false }),
      cat({ id: 'implicit', is_visible: undefined }),
    ]);
    expect(result.map(c => c.id)).toEqual(['implicit', 'visible']);
  });

  it('sorts by sort_order ascending with an id tie-break', () => {
    const result = getVisibleSortedCustomCategories([
      cat({ id: 'b', sort_order: 30 }),
      cat({ id: 'a', sort_order: 10 }),
      cat({ id: 'd', sort_order: 20 }),
      cat({ id: 'c', sort_order: 20 }),
    ]);
    expect(result.map(c => c.id)).toEqual(['a', 'c', 'd', 'b']);
  });

  it('sorts categories without sort_order last, not first', () => {
    const result = getVisibleSortedCustomCategories([
      cat({ id: 'legacy', sort_order: undefined }),
      cat({ id: 'new', sort_order: 5 }),
    ]);
    expect(result.map(c => c.id)).toEqual(['new', 'legacy']);
  });

  it('does not mutate the input array', () => {
    const input = [
      cat({ id: 'b', sort_order: 2 }),
      cat({ id: 'a', sort_order: 1 }),
    ];
    getVisibleSortedCustomCategories(input);
    expect(input.map(c => c.id)).toEqual(['b', 'a']);
  });
});

describe('getVisibleCustomMeasurementEntries', () => {
  it('filters entries whose embedded category is hidden', () => {
    const visible: CustomMeasurementEntry = entry({
      id: 'visible',
      custom_categories: {
        id: 'cat-1',
        name: 'BP',
        display_name: null,
        measurement_type: 'mmHg',
        frequency: 'Daily',
        data_type: 'numeric',
        is_visible: true,
      },
    });
    const hidden: CustomMeasurementEntry = entry({
      id: 'hidden',
      custom_categories: {
        id: 'cat-2',
        name: 'Hidden',
        display_name: null,
        measurement_type: '',
        frequency: 'Daily',
        data_type: 'numeric',
        is_visible: false,
      },
    });
    const implicit: CustomMeasurementEntry = entry({
      id: 'implicit',
      custom_categories: {
        id: 'cat-3',
        name: 'Implicit',
        display_name: null,
        measurement_type: '',
        frequency: 'Daily',
        data_type: 'numeric',
      },
    });
    const result = getVisibleCustomMeasurementEntries([
      hidden,
      visible,
      implicit,
    ]);
    expect(result.map(e => e.id)).toEqual(['implicit', 'visible']);
  });

  it('orders entries by the category sort_order then entry id', () => {
    const result = getVisibleCustomMeasurementEntries([
      entry({
        id: 'z',
        custom_categories: {
          id: 'cat-a',
          name: 'A',
          display_name: null,
          measurement_type: '',
          frequency: 'Daily',
          data_type: 'numeric',
          sort_order: 50,
        },
      }),
      entry({
        id: 'a',
        custom_categories: {
          id: 'cat-b',
          name: 'B',
          display_name: null,
          measurement_type: '',
          frequency: 'Daily',
          data_type: 'numeric',
          sort_order: 10,
        },
      }),
    ]);
    expect(result.map(e => e.id)).toEqual(['a', 'z']);
  });

  it('keeps entries whose embedded category metadata is absent', () => {
    const result = getVisibleCustomMeasurementEntries([
      entry({ id: 'orphan' }),
    ]);
    expect(result.map(e => e.id)).toEqual(['orphan']);
  });
});
