import { render, screen, within, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import NutrientGoalDirectionSettings from '@/pages/Settings/NutrientGoalDirectionSettings';

jest.mock('@/hooks/Foods/useCustomNutrients', () => ({
  useCustomNutrients: () => ({ data: [] }),
}));

const resetMock = jest.fn();
const updateMock = jest.fn();
const useNutrientGoalPreferencesMock = jest.fn();

// Sodium starts with an explicit 'minimum' override so we can prove the
// reset button flips it back to its *built-in* default ('maximum'), not to
// 'minimum'.
jest.mock('@/hooks/Settings/useNutrientGoalPreferences', () => ({
  useNutrientGoalPreferences: () => useNutrientGoalPreferencesMock(),
  useUpdateNutrientGoalPreferenceMutation: () => ({ mutate: updateMock }),
  useResetNutrientGoalPreferenceMutation: () => ({ mutate: resetMock }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    energyUnit: 'kcal',
    convertEnergy: (value: number) => value,
  }),
}));

function getRowContainer(nutrientName: string) {
  const label = screen.getByText(nutrientName);
  const container = label.closest('.rounded-lg.border');
  if (!container)
    throw new Error(`Row container not found for ${nutrientName}`);
  return container as HTMLElement;
}

describe('NutrientGoalDirectionSettings reset', () => {
  beforeEach(() => {
    resetMock.mockClear();
    updateMock.mockClear();
    useNutrientGoalPreferencesMock.mockReset();
    useNutrientGoalPreferencesMock.mockReturnValue({
      data: { sodium: { goalType: 'minimum' } },
    });
  });

  it('flips Sodium back to its built-in "Max" default, not "Min"', () => {
    render(<NutrientGoalDirectionSettings />);

    const sodiumRow = getRowContainer('Sodium');
    // Starts overridden to 'minimum' per the mock above.
    expect(
      within(sodiumRow).getByRole('button', { name: 'Min' })
    ).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(
      within(sodiumRow).getByTitle('Reset to default', { exact: false })
    );

    // Sodium's built-in default is 'maximum' (BUILTIN_MAXIMUM_GOAL_NUTRIENTS),
    // so the toggle must land on Max, not Min.
    expect(
      within(sodiumRow).getByRole('button', { name: 'Max' })
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      within(sodiumRow).getByRole('button', { name: 'Min' })
    ).toHaveAttribute('aria-pressed', 'false');
    expect(resetMock).toHaveBeenCalledWith('sodium');
  });

  it('flips Protein back to its built-in "Min" default when reset', () => {
    render(<NutrientGoalDirectionSettings />);

    const proteinRow = getRowContainer('Protein');
    expect(
      within(proteinRow).getByRole('button', { name: 'Min' })
    ).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(
      within(proteinRow).getByTitle('Reset to default', { exact: false })
    );

    expect(
      within(proteinRow).getByRole('button', { name: 'Min' })
    ).toHaveAttribute('aria-pressed', 'true');
    expect(resetMock).toHaveBeenCalledWith('protein');
  });
});

describe('NutrientGoalDirectionSettings reset all', () => {
  beforeEach(() => {
    resetMock.mockClear();
    updateMock.mockClear();
    useNutrientGoalPreferencesMock.mockReset();
  });

  it('resets every overridden nutrient after confirming, including a local-only unsaved selection', () => {
    // Sodium has a saved override; Protein does not (its row will only have
    // a local, never-persisted selection made in the test below).
    useNutrientGoalPreferencesMock.mockReturnValue({
      data: { sodium: { goalType: 'minimum' } },
    });
    render(<NutrientGoalDirectionSettings />);

    // Give Protein a local-only selection (Max) that was never saved.
    const proteinRow = getRowContainer('Protein');
    fireEvent.click(within(proteinRow).getByRole('button', { name: 'Max' }));
    expect(
      within(proteinRow).getByRole('button', { name: 'Max' })
    ).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Reset All' }));
    const dialog = screen.getByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset All' }));

    // The saved override (sodium) is deleted server-side — same as clicking
    // its own Reset button — and resolves once the query refetches (not
    // asserted here; covered by the single-row reset test above).
    expect(resetMock).toHaveBeenCalledWith('sodium');
    expect(resetMock).toHaveBeenCalledTimes(1);
    // Protein's local-only selection has nothing to delete, so it can only
    // be fixed by forcing every row to remount — proving that actually
    // happens for Reset All, not just for a single row's own Reset button.
    expect(
      within(getRowContainer('Protein')).getByRole('button', { name: 'Min' })
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('does not call reset for anything when cancelled', () => {
    useNutrientGoalPreferencesMock.mockReturnValue({
      data: { sodium: { goalType: 'minimum' } },
    });
    render(<NutrientGoalDirectionSettings />);

    fireEvent.click(screen.getByRole('button', { name: 'Reset All' }));
    const dialog = screen.getByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(resetMock).not.toHaveBeenCalled();
    expect(
      within(getRowContainer('Sodium')).getByRole('button', { name: 'Min' })
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('disables the Reset All trigger when nothing is overridden', () => {
    useNutrientGoalPreferencesMock.mockReturnValue({ data: {} });
    render(<NutrientGoalDirectionSettings />);

    expect(screen.getByRole('button', { name: 'Reset All' })).toBeDisabled();
  });
});

describe('NutrientGoalDirectionSettings goal-dependent guidance', () => {
  beforeEach(() => {
    resetMock.mockClear();
    updateMock.mockClear();
    useNutrientGoalPreferencesMock.mockReset();
    useNutrientGoalPreferencesMock.mockReturnValue({ data: {} });
  });

  it('shows a "why depends on your goal" info affordance on Calories but not on a fixed nutrient', () => {
    render(<NutrientGoalDirectionSettings />);

    const caloriesRow = getRowContainer('Calories');
    expect(
      within(caloriesRow).getByRole('button', {
        name: 'Why this depends on your goal',
      })
    ).toBeInTheDocument();

    // Potassium is not goal-dependent, so no info affordance.
    const potassiumRow = getRowContainer('Potassium');
    expect(
      within(potassiumRow).queryByRole('button', {
        name: 'Why this depends on your goal',
      })
    ).not.toBeInTheDocument();
  });

  it('reveals health-goal scenarios when the guidance section is expanded', () => {
    render(<NutrientGoalDirectionSettings />);

    // Collapsed by default.
    expect(
      screen.queryByText('Managing blood sugar (diabetes)')
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByText('Not sure which to choose? It depends on your goal')
    );

    expect(
      screen.getByText('Managing blood sugar (diabetes)')
    ).toBeInTheDocument();
    expect(screen.getByText('Losing weight')).toBeInTheDocument();
  });
});
