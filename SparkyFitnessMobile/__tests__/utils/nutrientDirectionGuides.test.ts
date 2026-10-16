import {
  NUTRIENT_DIRECTION_GUIDES,
  buildGuideDirections,
  type GuideDirectionDraft,
} from '../../src/constants/nutrientDirectionGuides';

const draft = (goalType: GuideDirectionDraft['goalType']) => ({
  goalType,
  min: '',
  max: '',
});
const guide = (key: string) => {
  const found = NUTRIENT_DIRECTION_GUIDES.find((g) => g.key === key);
  if (!found) throw new Error(`missing guide ${key}`);
  return found;
};

describe('buildGuideDirections', () => {
  it('sets each listed nutrient and ignores ones that are not editable', () => {
    const next = buildGuideDirections(
      guide('gainWeight'),
      { calories: draft('maximum') },
      2000
    );
    expect(next).toEqual({ calories: draft('minimum') });
  });

  it('builds a range around the calorie goal for maintenance', () => {
    const next = buildGuideDirections(
      guide('maintain'),
      { calories: draft('maximum') },
      2000
    );
    expect(next.calories).toEqual({
      goalType: 'target',
      min: '1800',
      max: '2200',
    });
  });

  it('applies the low-carb mix', () => {
    const next = buildGuideDirections(
      guide('lowCarb'),
      {
        carbs: draft('minimum'),
        fat: draft('maximum'),
        protein: draft('maximum'),
      },
      2000
    );
    expect(
      Object.fromEntries(Object.entries(next).map(([k, v]) => [k, v.goalType]))
    ).toEqual({
      carbs: 'maximum',
      fat: 'minimum',
      protein: 'minimum',
    });
  });
});
