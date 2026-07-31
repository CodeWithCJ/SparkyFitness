import { render, screen, fireEvent } from '@testing-library/react';
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
