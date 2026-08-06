import { visibleCustomNutrients } from '@/utils/nutrientUtils';
import type { UserCustomNutrient } from '@/types/customNutrient';

const nutrient = (name: string): UserCustomNutrient =>
  ({ id: name, name, unit: 'mg' }) as UserCustomNutrient;

// Food surfaces must honor the food_database view-group preference for custom
// nutrients: supplement-picked nutrients are scoped to goal/report groups only, so
// rendering the user's full custom-nutrient list would resurface them as always-0.0
// columns on every food card.
describe('visibleCustomNutrients', () => {
  const customs = [
    nutrient('Chemical X'),
    nutrient('Zinc'),
    nutrient('Iodine'),
  ];

  it('keeps only the nutrients the view group lists', () => {
    const result = visibleCustomNutrients(customs, {
      visible_nutrients: ['calories', 'protein', 'Chemical X'],
    });
    expect(result.map((n) => n.name)).toEqual(['Chemical X']);
  });

  it('hides every custom nutrient when the group lists none of them', () => {
    const result = visibleCustomNutrients(customs, {
      visible_nutrients: ['calories', 'protein'],
    });
    expect(result).toEqual([]);
  });

  it('shows all custom nutrients when no preference row exists', () => {
    expect(visibleCustomNutrients(customs, undefined)).toEqual(customs);
  });

  it('returns an empty list when the user has no custom nutrients', () => {
    expect(
      visibleCustomNutrients(undefined, { visible_nutrients: ['Chemical X'] })
    ).toEqual([]);
  });
});
