import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import DeleteMealTypeDialog from '@/pages/Settings/DeleteMealTypeDialog';
import type { MealTypeDefinition } from '@/types/diary';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    // The dialog calls t() both as t(key, 'default') and t(key, { count, defaultValue }).
    t: (key: string, second?: unknown) =>
      typeof second === 'string'
        ? second
        : ((second as { defaultValue?: string })?.defaultValue ?? key),
  }),
  initReactI18next: { type: '3rdParty', init: jest.fn() },
}));

const mealType = (id: string, name: string, sort_order: number) =>
  ({ id, name, sort_order, user_id: null }) as unknown as MealTypeDefinition;

// breakfast sorts first — it was the silent default that sent entries to the
// wrong meal type when the user had picked something else.
const MEAL_TYPES = [
  mealType('breakfast-id', 'breakfast', 10),
  mealType('snacks-id', 'snacks', 30),
  mealType('doomed-id', 'Test', 100),
];

const DOOMED = mealType('doomed-id', 'Test', 100);

const impact = (totalReferences: number) => ({
  foodEntries: totalReferences,
  foodEntryMeals: 0,
  mealPlans: 0,
  templateAssignments: 0,
  totalReferences,
});

const renderDialog = (totalReferences: number, onConfirm = jest.fn()) => {
  render(
    <DeleteMealTypeDialog
      pendingDeletion={{ mealType: DOOMED, impact: impact(totalReferences) }}
      mealTypes={MEAL_TYPES}
      onConfirm={onConfirm}
      onCancel={jest.fn()}
    />
  );
  return onConfirm;
};

describe('DeleteMealTypeDialog', () => {
  it('does not preselect a reassign target, so nothing can move silently', () => {
    const onConfirm = renderDialog(3);

    const move = screen.getByRole('button', {
      name: 'Move items and delete',
    });
    expect(move).toBeDisabled();

    fireEvent.click(move);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('shows the counts of what references the meal type', () => {
    renderDialog(3);
    expect(screen.getByText('3 diary entries')).toBeInTheDocument();
  });

  it('offers force delete as a separate action', () => {
    const onConfirm = renderDialog(3);

    fireEvent.click(screen.getByRole('button', { name: 'Delete everything' }));
    expect(onConfirm).toHaveBeenCalledWith({ mode: 'force' });
  });

  it('deletes directly when nothing references the meal type', () => {
    const onConfirm = renderDialog(0);

    expect(
      screen.queryByRole('button', { name: 'Move items and delete' })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledWith({ mode: 'strict' });
  });
});
