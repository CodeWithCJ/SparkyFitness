import { buildTimelineGroups } from '../../src/utils/diaryTimeline';
import type { FoodEntry } from '../../src/types/foodEntries';
import type { MealType } from '../../src/types/mealTypes';

const mealType = (
  id: string,
  name: string,
  sort_order: number,
  default_time: string | null
): MealType => ({
  id,
  name,
  sort_order,
  default_time,
  user_id: null,
  created_at: '2026-01-01',
  is_visible: true,
  show_in_quick_log: true,
});

const mealTypes = [
  mealType('b', 'Breakfast', 1, '08:00:00'),
  mealType('l', 'Lunch', 2, '12:30:00'),
  mealType('s', 'Snacks', 4, null),
];

const food = (
  id: string,
  meal_type_id: string,
  entry_time: string | null
): FoodEntry =>
  ({
    id,
    meal_type: '',
    meal_type_id,
    entry_time,
    entry_date: '2026-11-04',
    food_name: id,
  }) as unknown as FoodEntry;

describe('buildTimelineGroups', () => {
  it('orders entries by logged time and groups them by hour', () => {
    const groups = buildTimelineGroups(
      [
        food('late', 'l', '13:05:00'),
        food('early', 'b', '07:15:00'),
        food('alsoSeven', 'b', '07:50:00'),
      ],
      mealTypes
    );

    expect(groups.map((g) => g.hour)).toEqual([7, 13]);
    expect(groups[0].items.map((i) => i.entry.id)).toEqual([
      'early',
      'alsoSeven',
    ]);
  });

  it("places untimed entries at their meal type's default time", () => {
    const [group] = buildTimelineGroups([food('toast', 'b', null)], mealTypes);

    expect(group.hour).toBe(8);
    expect(group.items[0]).toMatchObject({ time: '08:00', estimated: true });
  });

  it('puts entries with no time and no meal default last', () => {
    const groups = buildTimelineGroups(
      [food('chips', 's', null), food('eggs', 'b', '06:00')],
      mealTypes
    );

    expect(groups.map((g) => g.hour)).toEqual([6, null]);
  });

  it('matches by name only when the entry has no meal type id', () => {
    const entry = {
      ...food('legacy', '', null),
      meal_type: 'lunch',
      meal_type_id: undefined,
    } as FoodEntry;
    const [group] = buildTimelineGroups([entry], mealTypes);

    expect(group.items[0].mealType?.id).toBe('l');
    expect(group.hour).toBe(12);
  });
});
