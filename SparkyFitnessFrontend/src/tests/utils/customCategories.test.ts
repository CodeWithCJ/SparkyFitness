import { getVisibleSortedCustomCategories } from '@/utils/customCategories';
import { CustomCategoriesResponse } from '@workspace/shared';

const category = (
  overrides: Partial<CustomCategoriesResponse>
): CustomCategoriesResponse =>
  ({
    id: `cat-${Math.random().toString(36).slice(2)}`,
    name: 'C',
    display_name: null,
    frequency: 'Daily',
    measurement_type: 'kg',
    data_type: 'numeric',
    is_visible: true,
    sort_order: 10,
    ...overrides,
  }) as CustomCategoriesResponse;

describe('getVisibleSortedCustomCategories', () => {
  it('filters out hidden categories (is_visible === false)', () => {
    const result = getVisibleSortedCustomCategories([
      category({ id: 'a', is_visible: false }),
      category({ id: 'b', is_visible: true }),
    ]);
    expect(result.map((c) => c.id)).toEqual(['b']);
  });

  it('treats missing is_visible as visible (legacy data)', () => {
    const result = getVisibleSortedCustomCategories([
      category({ id: 'a', is_visible: undefined as never }),
      category({ id: 'b' }),
    ]);
    expect(result.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('sorts ascending by sort_order', () => {
    const result = getVisibleSortedCustomCategories([
      category({ id: 'z', sort_order: 50 }),
      category({ id: 'a', sort_order: 10 }),
      category({ id: 'm', sort_order: 30 }),
    ]);
    expect(result.map((c) => c.id)).toEqual(['a', 'm', 'z']);
  });

  it('tie-breaks equal sort_order by id and does not mutate the input', () => {
    const input = [
      category({ id: 'b', sort_order: 10 }),
      category({ id: 'a', sort_order: 10 }),
    ];
    const result = getVisibleSortedCustomCategories(input);
    expect(result.map((c) => c.id)).toEqual(['a', 'b']);
    expect(input.map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('keeps hidden categories out even when they sort first', () => {
    const result = getVisibleSortedCustomCategories([
      category({ id: 'hidden', sort_order: 1, is_visible: false }),
      category({ id: 'shown', sort_order: 99 }),
    ]);
    expect(result.map((c) => c.id)).toEqual(['shown']);
  });
});
