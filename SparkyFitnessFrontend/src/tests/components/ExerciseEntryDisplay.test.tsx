import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ExerciseEntryDisplay from '@/pages/Diary/ExerciseEntryDisplay';
import type { ExerciseEntry } from '@/types/exercises';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    weightUnit: 'kg',
    distanceUnit: 'km',
    convertDistance: (value: number) => value,
    timeFormat: '24h',
  }),
}));

const makeEntry = (overrides?: Partial<ExerciseEntry>): ExerciseEntry =>
  ({
    id: 'entry-1',
    exercise_id: 'ex-1',
    entry_date: '2026-07-26',
    entry_time: null,
    duration_minutes: 30,
    calories_burned: 300,
    distance: null,
    avg_heart_rate: null,
    notes: '',
    image_url: null,
    sets: [],
    activity_details: [],
    exercise_snapshot: {
      id: 'ex-1',
      name: 'Running',
      category: 'Cardio',
      modality: 'duration_distance',
    },
    ...overrides,
  }) as unknown as ExerciseEntry;

const renderCard = (entry: ExerciseEntry) =>
  render(
    <ExerciseEntryDisplay
      exerciseEntry={entry}
      currentUserId="user-1"
      handleEdit={jest.fn()}
      handleDelete={jest.fn()}
      handleEditExerciseDatabase={jest.fn()}
      setExerciseToPlay={jest.fn()}
      setIsPlaybackModalOpen={jest.fn()}
      energyUnit="kcal"
      convertEnergy={(value) => value}
      getEnergyUnitString={() => 'kcal'}
    />
  );

describe('ExerciseEntryDisplay cardio distance', () => {
  it('shows the entry distance in the stats row and the set distance in the chip', () => {
    renderCard(
      makeEntry({
        distance: 4.988966,
        sets: [
          {
            id: 7,
            set_number: 1,
            set_type: 'Working Set',
            reps: null,
            weight: null,
            duration: 1800,
            distance: 4.988966,
            rest_time: 0,
            notes: null,
            rpe: null,
            completed_at: null,
            is_pr: false,
          },
        ],
      } as unknown as Partial<ExerciseEntry>)
    );

    // Stats row (entry-level) and set chip both surface the logged distance.
    expect(screen.getByText('4.99 km')).toBeInTheDocument();
    expect(screen.getByText('1: 1800s · 4.99 km')).toBeInTheDocument();
  });

  it('renders no distance segment when the entry has none', () => {
    renderCard(makeEntry());

    expect(screen.queryByText(/km/)).not.toBeInTheDocument();
  });
});
