import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AddMedicationDialog from '@/pages/Medications/AddMedicationDialog';
import type { Medication } from '@/types/medications';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue?: string) => defaultValue,
  }),
  initReactI18next: { type: '3rdParty', init: jest.fn() },
}));

const mockCreateMutate = jest.fn(
  (_body: unknown, options?: { onSuccess?: () => void }) =>
    options?.onSuccess?.()
);
const mockUpdateMutate = jest.fn(
  (_args: unknown, options?: { onSuccess?: () => void }) =>
    options?.onSuccess?.()
);
// The nutrition editor's catalog hooks are react-query backed; this suite renders the
// dialog without a QueryClientProvider.
jest.mock('@/hooks/Foods/useCustomNutrients', () => ({
  useCustomNutrients: () => ({ data: [] }),
  useCreateCustomNutrientMutation: () => ({ mutateAsync: jest.fn() }),
  useEnsureCatalogNutrientsMutation: () => ({ mutateAsync: jest.fn() }),
}));

// The nutrition editor reads the energy unit from preferences; this suite renders the
// dialog bare, without the provider.
jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    energyUnit: 'kcal',
    convertEnergy: (value: number) => value,
    timezone: 'UTC',
    timeFormat: 'h:mm A',
    firstDayOfWeek: 0,
  }),
}));

// better-auth ships an untransformed ESM build that jest does not process, and it is
// reachable from this component through the auth hook. Cutting the chain at the hook
// covers every import path that reaches it.
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, isLoading: false }),
}));

// The dialog gates its nutrition editor on the active profile's diary permission.
// ActiveUserContext reaches useAuth and so pulls better-auth's ESM build into this
// suite's module graph, which jest does not transform; mock the hook rather than
// widen transformIgnorePatterns for one context.
jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({
    hasWritePermission: () => true,
    hasPermission: () => true,
    activeUserId: 'user-1',
    activeUserName: 'Test User',
    isActingOnBehalf: false,
  }),
}));

jest.mock('@/hooks/useMedications', () => ({
  useCreateMedicationMutation: () => ({
    mutate: mockCreateMutate,
    isPending: false,
  }),
  useUpdateMedicationMutation: () => ({
    mutate: mockUpdateMutate,
    isPending: false,
  }),
}));

const mirroredMed = {
  id: 'med-1',
  name: 'Metformin',
  type_id: 'pill',
  is_glp1: false,
  strength_value: 500,
  strength_unit: 'mg',
  dose_amount: 500,
  dose_unit: 'mg',
  custom_fields: {},
} as unknown as Medication;

const mobileDoseMed = {
  ...mirroredMed,
  id: 'med-2',
  dose_amount: 1,
  dose_unit: 'tablet',
} as unknown as Medication;

function openDialog() {
  fireEvent.click(screen.getByRole('button', { name: /Add medication/ }));
}

function save() {
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
}

function setField(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function lastCreateBody(): Partial<Medication> {
  const call = mockCreateMutate.mock.calls.at(-1);
  if (!call) throw new Error('createMutation.mutate was not called');
  return call[0] as Partial<Medication>;
}

function lastUpdateArgs(): { id: string; body: Partial<Medication> } {
  const call = mockUpdateMutate.mock.calls.at(-1);
  if (!call) throw new Error('updateMutation.mutate was not called');
  return call[0] as { id: string; body: Partial<Medication> };
}

describe('AddMedicationDialog dose fields', () => {
  beforeEach(() => jest.clearAllMocks());

  it('mirrors strength into the dose when untouched (add)', () => {
    render(<AddMedicationDialog />);
    openDialog();
    setField('Name', 'Metformin');
    setField('Strength', '500');
    save();

    expect(mockCreateMutate).toHaveBeenCalledTimes(1);
    expect(lastCreateBody()).toMatchObject({
      strength_value: 500,
      strength_unit: 'mg',
      dose_amount: 500,
      dose_unit: 'mg',
    });
  });

  it('sends an edited dose verbatim alongside the strength (add)', () => {
    render(<AddMedicationDialog />);
    openDialog();
    setField('Name', 'Metformin');
    setField('Strength', '500');
    setField('Dose', '2');
    setField('Dose unit', 'tablet');
    save();

    expect(lastCreateBody()).toMatchObject({
      strength_value: 500,
      strength_unit: 'mg',
      dose_amount: 2,
      dose_unit: 'tablet',
    });
  });

  it('cross-seeds the unit from the mirrored value on first touch of the amount', () => {
    render(<AddMedicationDialog />);
    openDialog();
    setField('Name', 'Metformin');
    setField('Strength', '500');
    setField('Dose', '2');

    expect(screen.getByLabelText('Dose unit')).toHaveValue('mg');

    save();
    expect(lastCreateBody()).toMatchObject({
      dose_amount: 2,
      dose_unit: 'mg',
    });
  });

  it('cross-seeds the amount from the mirrored value on first touch of the unit', () => {
    render(<AddMedicationDialog />);
    openDialog();
    setField('Name', 'Metformin');
    setField('Strength', '500');
    setField('Dose unit', 'tablet');

    expect(screen.getByLabelText('Dose')).toHaveValue(500);

    save();
    expect(lastCreateBody()).toMatchObject({
      dose_amount: 500,
      dose_unit: 'tablet',
    });
  });

  it('preserves a distinct (mobile-set) dose when only the name changes (edit)', () => {
    render(<AddMedicationDialog editMed={mobileDoseMed} />);
    openDialog();
    setField('Name', 'Metformin XR');
    save();

    expect(mockUpdateMutate).toHaveBeenCalledTimes(1);
    const { id, body } = lastUpdateArgs();
    expect(id).toBe('med-2');
    expect(body).toMatchObject({
      name: 'Metformin XR',
      strength_value: 500,
      strength_unit: 'mg',
      dose_amount: 1,
      dose_unit: 'tablet',
    });
  });

  it('keeps a mirrored dose following a strength change (edit)', () => {
    render(<AddMedicationDialog editMed={mirroredMed} />);
    openDialog();
    setField('Strength', '1000');
    save();

    const { body } = lastUpdateArgs();
    expect(body).toMatchObject({
      strength_value: 1000,
      dose_amount: 1000,
      dose_unit: 'mg',
    });
  });

  it('sends a cleared dose amount as null while keeping the unit (edit)', () => {
    render(<AddMedicationDialog editMed={mobileDoseMed} />);
    openDialog();
    setField('Dose', '');
    save();

    const { body } = lastUpdateArgs();
    expect(body).toMatchObject({
      dose_amount: null,
      dose_unit: 'tablet',
    });
  });

  it('does not invent a mirror for a dose-null row with strength (edit)', () => {
    const doseNullMed = {
      ...mirroredMed,
      id: 'med-3',
      dose_amount: null,
      dose_unit: null,
    } as unknown as Medication;
    render(<AddMedicationDialog editMed={doseNullMed} />);
    openDialog();
    setField('Name', 'Metformin XR');
    save();

    const { body } = lastUpdateArgs();
    expect(body).toMatchObject({
      strength_value: 500,
      dose_amount: null,
      dose_unit: null,
    });
  });

  it('resets strength and dose fields after a successful create', () => {
    render(<AddMedicationDialog />);
    openDialog();
    setField('Name', 'Metformin');
    setField('Strength', '500');
    setField('Dose', '2');
    setField('Dose unit', 'tablet');
    save();

    openDialog();
    expect(screen.getByLabelText('Strength')).toHaveValue(null);
    expect(screen.getByLabelText('Strength unit')).toHaveValue('mg');
    expect(screen.getByLabelText('Dose')).toHaveValue(null);
    expect(screen.getByLabelText('Dose unit')).toHaveValue('mg');
  });

  // The dialog is not remounted between saves, so anything the create-success handler
  // forgets to clear is still on screen for the next supplement. The macro block is the
  // dangerous one: it renders from `includeMacros` but only *selected* keys are saved, so
  // a block left ticked with its keys dropped accepts values and silently discards them.
  it('resets the macro block and the serving size after a successful create (supplement)', async () => {
    render(<AddMedicationDialog defaultIsSupplement />);
    // The serving-size field is the one input in this block with no <Label>, and the
    // dialog is portalled out of the render container, so query the document for it.
    const servingInput = () =>
      document.querySelector<HTMLInputElement>('#units-per-serving');

    openDialog();
    setField('Name', 'Fish oil');
    // The only checkbox on the supplement form; the rest are switches.
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByLabelText('Calories'), {
      target: { value: '15' },
    });
    fireEvent.change(servingInput()!, { target: { value: '2' } });
    save();

    // Proves the block was genuinely filled in, so the reset assertions below are not
    // passing against a form that never had the state in the first place.
    await waitFor(() => expect(mockCreateMutate).toHaveBeenCalledTimes(1));
    expect(lastCreateBody()).toMatchObject({
      nutrients: expect.objectContaining({ calories: 15 }),
      custom_fields: expect.objectContaining({ units_per_serving: 2 }),
    });

    openDialog();
    expect(screen.getByRole('checkbox')).toHaveAttribute(
      'data-state',
      'unchecked'
    );
    expect(screen.queryByLabelText('Calories')).not.toBeInTheDocument();
    expect(servingInput()).toHaveValue(null);
  });

  // Same class as the reset above, at the other end: the block opens if ANY of the five
  // was saved, but only selected keys are saved. Seeding just the saved ones leaves the
  // other four visible and typeable, and getNutrients() then drops what is typed there.
  it('saves a macro added to a supplement that had only some of them (edit)', async () => {
    const partialMacroSupp = {
      id: 'supp-1',
      name: 'Fish oil',
      type_id: 'softgel',
      is_glp1: false,
      is_supplement: true,
      dose_amount: 1,
      dose_unit: 'dose',
      custom_fields: {},
      nutrients: { calories: 15 },
    } as unknown as Medication;

    render(<AddMedicationDialog editMed={partialMacroSupp} />);
    openDialog();
    // The block is already expanded because calories was saved.
    fireEvent.change(screen.getByLabelText('Protein'), {
      target: { value: '1.5' },
    });
    save();

    await waitFor(() => expect(mockUpdateMutate).toHaveBeenCalledTimes(1));
    expect(lastUpdateArgs().body).toMatchObject({
      nutrients: expect.objectContaining({ calories: 15, protein: 1.5 }),
    });
  });

  // The five macros are not offered as picker rows, so free text is the only way to name
  // one there. Left unrouted, "Energy" becomes a custom nutrient no rollup reads, and an
  // exact "Calories" selects the macro key while the block stays shut and the grid, which
  // renders only the non-macro rows, shows no field for it.
  it.each([
    ['Energy', 'an alias'],
    ['Calories', 'the canonical name'],
  ])('routes free-text %s (%s) into the macro block', async (typed) => {
    render(<AddMedicationDialog defaultIsSupplement />);
    openDialog();
    setField('Name', 'Fish oil');

    fireEvent.click(screen.getByRole('button', { name: /Add nutrient/ }));
    fireEvent.change(screen.getByPlaceholderText('e.g. Ashwagandha'), {
      target: { value: typed },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    // The block has to be open, or the user has no field to type the value into.
    fireEvent.change(await screen.findByLabelText('Calories'), {
      target: { value: '15' },
    });
    save();

    await waitFor(() => expect(mockCreateMutate).toHaveBeenCalledTimes(1));
    const nutrients = lastCreateBody().nutrients as Record<string, unknown>;
    expect(nutrients).toMatchObject({ calories: 15 });
    // Not filed as a custom nutrient under the name that was typed.
    expect(nutrients['custom_nutrients'] ?? {}).toEqual({});
  });

  it('locks the dose unit to the strength unit for injectable GLP-1 meds', () => {
    const glp1Med = {
      ...mirroredMed,
      id: 'med-glp1',
      name: 'Wegovy',
      type_id: 'injection',
      is_glp1: true,
      strength_value: 2.4,
      strength_unit: 'mg',
      dose_amount: 2.4,
      dose_unit: 'mg',
      custom_fields: { glp1_drug: 'semaglutide' },
    } as unknown as Medication;
    render(<AddMedicationDialog editMed={glp1Med} />);
    openDialog();

    expect(screen.getByLabelText('Dose per injection')).toBeInTheDocument();
    expect(screen.getByLabelText('Dose unit')).toBeDisabled();

    setField('Dose per injection', '1.7');
    save();

    const { body } = lastUpdateArgs();
    expect(body).toMatchObject({
      dose_amount: 1.7,
      dose_unit: 'mg',
    });
  });
});
