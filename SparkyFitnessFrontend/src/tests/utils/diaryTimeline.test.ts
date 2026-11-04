import {
  buildTimelineGroups,
  readDiaryViewMode,
  writeDiaryViewMode,
} from '@/utils/diaryTimeline';
import type { FoodEntry } from '@/types/food';
import type { FoodEntryMeal } from '@/types/meal';

const mealTypes = [
  { name: 'Breakfast', sort_order: 1, default_time: '08:00:00' },
  { name: 'Lunch', sort_order: 2, default_time: '12:30:00' },
  { name: 'Snacks', sort_order: 4, default_time: null },
];

const food = (
  id: string,
  meal_type: string,
  entry_time: string | null
): FoodEntry => ({
  id,
  meal_type,
  entry_time,
  quantity: 1,
  unit: 'serving',
  entry_date: '2026-11-04',
  food_name: id,
});

const loggedMeal = (
  id: string,
  meal_type: string,
  entry_time: string | null
): FoodEntryMeal => ({
  id,
  user_id: 'u1',
  meal_type,
  entry_time,
  entry_date: '2026-11-04',
  name: id,
  foods: [],
});

describe('buildTimelineGroups', () => {
  it('orders entries by logged time and groups them by hour', () => {
    const groups = buildTimelineGroups(
      [
        food('late', 'Lunch', '13:05:00'),
        food('early', 'Breakfast', '07:15:00'),
        food('alsoSeven', 'Breakfast', '07:50:00'),
      ],
      [loggedMeal('bowl', 'Lunch', '13:00:00')],
      mealTypes
    );

    expect(groups.map((g) => g.hour)).toEqual([7, 13]);
    expect(groups[0]!.items.map((i) => i.entry.id)).toEqual([
      'early',
      'alsoSeven',
    ]);
    expect(groups[1]!.items.map((i) => [i.entry.id, i.kind])).toEqual([
      ['bowl', 'foodEntryMeal'],
      ['late', 'foodEntry'],
    ]);
  });

  it("places untimed entries at their meal type's default time as estimated", () => {
    const [group] = buildTimelineGroups(
      [food('toast', 'breakfast', null)],
      [],
      mealTypes
    );

    expect(group!.hour).toBe(8);
    expect(group!.items[0]).toMatchObject({
      time: '08:00',
      estimated: true,
      mealTypeName: 'Breakfast',
    });
  });

  it('puts entries with no time and no meal default last', () => {
    const groups = buildTimelineGroups(
      [food('chips', 'Snacks', null), food('eggs', 'Breakfast', '06:00')],
      [],
      mealTypes
    );

    expect(groups.map((g) => g.hour)).toEqual([6, null]);
    expect(groups[1]!.items[0]).toMatchObject({ time: null, estimated: false });
  });

  it('lists a logged time before an estimated one at the same minute', () => {
    const [group] = buildTimelineGroups(
      [food('guess', 'Breakfast', null), food('real', 'Snacks', '08:00:00')],
      [],
      mealTypes
    );

    expect(group!.items.map((i) => i.entry.id)).toEqual(['real', 'guess']);
  });
});

describe('diary view mode storage', () => {
  afterEach(() => window.localStorage.clear());

  it('defaults to the meal view', () => {
    expect(readDiaryViewMode()).toBe('meals');
  });

  it('remembers the timeline view', () => {
    writeDiaryViewMode('timeline');
    expect(readDiaryViewMode()).toBe('timeline');
  });

  it('falls back to the meal view when storage throws', () => {
    const spy = jest
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('blocked');
      });
    expect(readDiaryViewMode()).toBe('meals');
    spy.mockRestore();
  });
});
