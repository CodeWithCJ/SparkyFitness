import { groupEquivalentVariants } from '../../src/utils/foodDetails';

it('keeps both grams and a named portion selectable even when nutrition is identical', () => {
  const reference = {
    id: 'grams',
    food_id: 'food-1',
    serving_size: 100,
    serving_unit: 'g',
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
  };
  const portion = {
    ...reference,
    id: 'packet',
    serving_size: 1,
    serving_unit: 'packet (100 g)',
  };
  expect(
    groupEquivalentVariants([reference, portion]).map((group) => group.base.id)
  ).toEqual(['grams', 'packet']);
});

it('keeps named portions separate through an equal-nutrition custom serving group', () => {
  const common = {
    food_id: 'food-1',
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
  };
  const groups = groupEquivalentVariants([
    { ...common, id: 'serving', serving_size: 1, serving_unit: 'serving' },
    { ...common, id: 'grams', serving_size: 100, serving_unit: 'g' },
    {
      ...common,
      id: 'packet',
      serving_size: 1,
      serving_unit: 'packet (100 g)',
    },
  ]);
  expect(groups.map((group) => group.base.id)).toContain('packet');
});
