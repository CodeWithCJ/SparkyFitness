import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import LogExerciseEntryDialog from '@/pages/Diary/LogExerciseEntryDialog';
import type { ExerciseToLog } from '@/types/workout';

const mockCreateExerciseEntry = jest.fn();

// The published uuid build is ESM-only and ts-jest doesn't transform
// node_modules; the dialog only needs unique dnd keys.
let uuidSeq = 0;
jest.mock('uuid', () => ({ v4: () => `uuid-${++uuidSeq}` }));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue?: string) => defaultValue ?? _key,
  }),
  initReactI18next: {
    type: '3rdParty',
    init: () => {},
  },
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    loggingLevel: 'SILENT',
    weightUnit: 'kg',
    distanceUnit: 'km',
    convertDistance: (value: number) => value,
    timezone: 'UTC',
  }),
}));

jest.mock('@/utils/logging', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('@/hooks/Exercises/useExerciseEntries', () => ({
  useCreateExerciseEntryMutation: () => ({
    mutateAsync: mockCreateExerciseEntry,
    isPending: false,
  }),
}));

jest.mock('@/components/ExerciseHistoryDisplay', () => ({
  __esModule: true,
  default: () => <div data-testid="history" />,
}));

jest.mock('@/components/ExerciseActivityDetailsEditor', () => ({
  __esModule: true,
  default: () => <div data-testid="activity-details" />,
}));

const strengthExercise = {
  id: 'ex-1',
  name: 'Push-ups',
  category: 'Strength',
  calories_per_hour: 400,
} as unknown as ExerciseToLog;

const renderDialog = (exercise: ExerciseToLog = strengthExercise) =>
  render(
    <LogExerciseEntryDialog
      isOpen
      onClose={jest.fn()}
      exercise={exercise}
      selectedDate="2026-10-16"
      onSaveSuccess={jest.fn()}
      energyUnit="kcal"
      getEnergyUnitString={(unit) => unit}
    />
  );

const saveEntry = async () => {
  fireEvent.click(screen.getByText('Save Entry'));
  await waitFor(() => expect(mockCreateExerciseEntry).toHaveBeenCalledTimes(1));
  return mockCreateExerciseEntry.mock.calls[0][0] as Record<string, unknown>;
};

describe('LogExerciseEntryDialog calories burned', () => {
  beforeEach(() => {
    mockCreateExerciseEntry.mockClear();
    mockCreateExerciseEntry.mockResolvedValue(undefined);
  });

  it('omits calories_burned when the field is left blank so the server estimates it', async () => {
    renderDialog();

    const payload = await saveEntry();

    // An explicit 0 would be stored as-is and skip the server estimate.
    expect(payload).not.toHaveProperty('calories_burned');
  });

  it('sends the typed calories_burned value', async () => {
    renderDialog();

    fireEvent.click(screen.getByText('Advanced'));
    fireEvent.change(screen.getByLabelText(/Calories burned/), {
      target: { value: '250' },
    });
    const payload = await saveEntry();

    expect(payload['calories_burned']).toBe(250);
  });
});
