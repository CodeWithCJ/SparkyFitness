import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FoodFormDialog } from '@/components/FoodSearch/FoodFormDialog';
jest.mock('@/components/FoodSearch/CustomFoodForm', () => () => (
  <div>Food form</div>
));
it.each([false, true])(
  'offers ingredient import only for Mealie without declared nutrition (%s)',
  (hasNutrition) => {
    render(
      <MemoryRouter>
        <FoodFormDialog
          isOpen
          onOpenChange={() => {}}
          mode="edit"
          recipeImportProviderId="provider /"
          editingProduct={{
            id: 'recipe',
            name: 'Rice',
            is_custom: true,
            provider_type: 'mealie',
            provider_external_id: 'rice / beans',
            recipe_has_nutrition: hasNutrition,
          }}
          onSave={() => {}}
        />
      </MemoryRouter>
    );
    const link = screen.queryByRole('link', {
      name: 'Import ingredients as a meal',
    });
    if (hasNutrition) expect(link).toBeNull();
    else {
      expect(link).toHaveAttribute(
        'href',
        '/foods?mealieProvider=provider+%2F&mealieRecipe=rice+%2F+beans'
      );
      expect(
        screen.getByText(
          'This Mealie recipe has no declared nutrition. Calculate it from matched ingredients.'
        )
      ).toBeInTheDocument();
    }
  }
);
it('offers no import link without an authorized personal source', () => {
  render(
    <MemoryRouter>
      <FoodFormDialog
        isOpen
        onOpenChange={() => {}}
        mode="edit"
        editingProduct={{
          id: 'recipe',
          name: 'Rice',
          is_custom: true,
          provider_type: 'mealie',
          provider_external_id: 'rice',
          recipe_has_nutrition: false,
        }}
        onSave={() => {}}
      />
    </MemoryRouter>
  );
  expect(
    screen.queryByRole('link', { name: 'Import ingredients as a meal' })
  ).toBeNull();
});
