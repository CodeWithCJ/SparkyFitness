import { watchWaterFromFoodMl } from '../../src/utils/watchWater';

describe('watchWaterFromFoodMl', () => {
  it('sends nothing when food water does not count toward intake', () => {
    expect(watchWaterFromFoodMl(false, 400)).toBeNull();
    expect(watchWaterFromFoodMl(undefined, 400)).toBeNull();
    expect(watchWaterFromFoodMl(null, 400)).toBeNull();
  });

  it('sends the amount from food when the setting is on', () => {
    expect(watchWaterFromFoodMl(true, 400)).toBe(400);
  });

  it('sends nothing when the setting is on but there is no food water to show', () => {
    expect(watchWaterFromFoodMl(true, 0)).toBeNull();
    expect(watchWaterFromFoodMl(true, undefined)).toBeNull();
    expect(watchWaterFromFoodMl(true, NaN)).toBeNull();
    expect(watchWaterFromFoodMl(true, -1)).toBeNull();
  });
});
