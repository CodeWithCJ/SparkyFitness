import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import RunSummaryScreen from '../../src/screens/RunSummaryScreen';
import {
  rateProgramWorkout,
  setProgramPosition,
} from '../../src/services/runProgramService';
import {
  setExerciseEntryDistance,
  setExerciseEntryStrideLength,
} from '../../src/services/api/exerciseApi';
import { usePersonalRecords } from '../../src/hooks/usePersonalRecords';
import type { RunSummaryParams } from '../../src/utils/runSummary';

jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: jest.fn(() => null),
}));
jest.mock('../../src/services/runProgramService', () => ({
  setProgramPosition: jest.fn(() => Promise.resolve()),
  rateProgramWorkout: jest.fn(() => Promise.resolve(null)),
}));
jest.mock('../../src/services/api/exerciseApi', () => ({
  setExerciseEntryDistance: jest.fn(() => Promise.resolve()),
  setExerciseEntryStrideLength: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../src/hooks/usePersonalRecords', () => ({
  usePersonalRecords: jest.fn(() => ({ records: [] })),
}));
jest.mock('../../src/utils/routeMapSupport', () => ({
  canShowRouteMap: () => false,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('uniwind', () => ({
  useCSSVariable: (keys: string | string[]) =>
    Array.isArray(keys) ? keys.map(() => '#111827') : '#111827',
  useUniwind: () => ({ theme: 'light' }),
}));

const split = (index: number, durationSeconds: number, partial = false) => ({
  index,
  distanceMeters: partial ? 500 : 1000,
  durationSeconds,
  startT: 0,
  endT: 0,
  partial,
});

const params = (
  overrides: Partial<RunSummaryParams> = {}
): RunSummaryParams => ({
  activity: 'run',
  entryDate: '2026-10-12',
  distanceUnit: 'km',
  distanceMeters: 2500,
  activeSeconds: 750,
  elevationGainMeters: 0,
  avgHeartRate: null,
  route: [],
  splits: [split(1, 300), split(2, 280), split(3, 150, true)],
  laps: [],
  program: null,
  ...overrides,
});

const navigation = { goBack: jest.fn(), navigate: jest.fn() };
const renderScreen = (summary: RunSummaryParams) =>
  render(
    <RunSummaryScreen
      {...({
        navigation,
        route: { key: 'RunSummary', name: 'RunSummary', params: summary },
      } as never)}
    />
  );

beforeEach(() => jest.clearAllMocks());

it('shows the headline figures and the splits', () => {
  renderScreen(params());
  expect(screen.getByText('Run saved')).toBeTruthy();
  expect(screen.getByText('2.50')).toBeTruthy();
  expect(screen.getByText('12:30')).toBeTruthy();
  expect(screen.getAllByText('5:00').length).toBeGreaterThan(0);
  expect(screen.getByText('Splits')).toBeTruthy();
  expect(screen.getByTestId('splits-table')).toBeTruthy();
  expect(screen.queryByText('Avg heart rate')).toBeNull();
  expect(screen.queryByText(/Workout \d+ of/)).toBeNull();
});

it('shows heart rate and elevation only when there are some, and laps instead of splits', () => {
  renderScreen(
    params({
      avgHeartRate: 148,
      elevationGainMeters: 42,
      laps: [split(1, 400), split(2, 350)],
    })
  );
  expect(screen.getByText('Avg heart rate')).toBeTruthy();
  expect(screen.getByText('148')).toBeTruthy();
  expect(screen.getByText('Elevation gain')).toBeTruthy();
  expect(screen.getByText('Laps')).toBeTruthy();
  expect(screen.queryByText('Splits')).toBeNull();
});

it('shows program progress, what is next, and opens the program', () => {
  renderScreen(
    params({
      program: {
        nextLine: 'Next: Week 1, run 3 on Wed, Oct 14',
        done: 4,
        total: 27,
        finished: false,
      },
    })
  );
  expect(screen.getByText('Workout 4 of 27 done')).toBeTruthy();
  expect(screen.getByText('Next: Week 1, run 3 on Wed, Oct 14')).toBeTruthy();
  fireEvent.press(screen.getByText('View program'));
  expect(navigation.navigate).toHaveBeenCalledWith('RunPrograms');
});

it('calls a finished program complete', () => {
  renderScreen(
    params({
      program: {
        nextLine: 'Program complete. Well done!',
        done: 27,
        total: 27,
        finished: true,
      },
    })
  );
  expect(screen.getByText('Program complete')).toBeTruthy();
});

it('says walk or ride for those, and Done goes back', () => {
  renderScreen(params({ activity: 'walk', splits: [] }));
  expect(screen.getByText('Walk saved')).toBeTruthy();
  expect(screen.queryByText('Splits')).toBeNull();
  fireEvent.press(screen.getByText('Done'));
  expect(navigation.goBack).toHaveBeenCalled();
});

const inProgram = (done: number, total = 27) =>
  params({
    program: {
      nextLine: 'Next',
      done,
      total,
      finished: false,
      rate: { programId: 'beginner5k', index: done - 1 },
    },
  });

const stored = (efforts: { index: number; rating: number }[], next: number) =>
  ({
    effort_log: efforts.map((e) => ({ ...e, at: '2026-10-12T00:00:00.000Z' })),
    next_index: next,
  }) as never;

beforeEach(() => jest.clearAllMocks());

it('saves the rating for the workout just finished', async () => {
  renderScreen(inProgram(4));
  fireEvent.press(screen.getByLabelText('Effort 6 of 10'));
  expect(rateProgramWorkout).toHaveBeenCalledWith('beginner5k', 3, 6);
  expect(screen.queryByText('Repeat this workout')).toBeNull();
  expect(screen.queryByText('Skip the next workout')).toBeNull();
});

it('offers to repeat a workout that felt hard, one back from the place', async () => {
  renderScreen(inProgram(4));
  fireEvent.press(screen.getByLabelText('Effort 9 of 10'));
  fireEvent.press(await screen.findByText('Repeat this workout'));
  await screen.findByText('Done. You will do this workout again.');
  expect(setProgramPosition).toHaveBeenCalledWith(3);
});

it('offers to skip the next workout when it felt easy', async () => {
  renderScreen(inProgram(4));
  fireEvent.press(screen.getByLabelText('Effort 2 of 10'));
  fireEvent.press(await screen.findByText('Skip the next workout'));
  await screen.findByText('Done. The next workout is skipped.');
  expect(setProgramPosition).toHaveBeenCalledWith(5);
});

it('does not offer to skip past the last workout', () => {
  renderScreen(inProgram(26));
  fireEvent.press(screen.getByLabelText('Effort 1 of 10'));
  expect(screen.queryByText('Skip the next workout')).toBeNull();
});

it('says so when two hard workouts in a row', async () => {
  jest.mocked(rateProgramWorkout).mockResolvedValueOnce(
    stored(
      [
        { index: 2, rating: 9 },
        { index: 3, rating: 8 },
      ],
      4
    )
  );
  renderScreen(inProgram(4));
  fireEvent.press(screen.getByLabelText('Effort 8 of 10'));
  await screen.findByText(/Two hard workouts in a row/);
});

it('does not ask about a workout that was not ticked off', () => {
  renderScreen(
    params({
      program: { nextLine: 'Next', done: 4, total: 27, finished: false },
    })
  );
  expect(screen.queryByText('How hard was that?')).toBeNull();
});

const record = (activityId: string, standard: '1k' | '5k', time: string) =>
  ({
    id: `${standard}-${activityId}`,
    category: 'Cardio',
    sportGroup: 'run',
    distanceStandard: standard,
    label: standard,
    bestTimeSeconds: 1,
    formattedTime: time,
    avgPaceSecondsPerKm: 300,
    formattedPace: '5:00 /km',
    activityId,
    activityName: 'Run',
    achievedAt: '2026-10-12',
  }) as never;

it('shows the records this run set, and none it did not', () => {
  jest.mocked(usePersonalRecords).mockReturnValue({
    records: [record('entry-1', '5k', '24:10'), record('other', '1k', '4:30')],
  } as never);
  renderScreen(params({ entryId: 'entry-1' }));
  expect(screen.getByText('New personal record')).toBeTruthy();
  expect(screen.getByText('24:10')).toBeTruthy();
  expect(screen.queryByText('4:30')).toBeNull();
  fireEvent.press(screen.getByText('View all records'));
  expect(navigation.navigate).toHaveBeenCalledWith('PersonalRecords');
});

it('says records when it set more than one', () => {
  jest.mocked(usePersonalRecords).mockReturnValue({
    records: [
      record('entry-1', '5k', '24:10'),
      record('entry-1', '1k', '4:30'),
    ],
  } as never);
  renderScreen(params({ entryId: 'entry-1' }));
  expect(screen.getByText('New personal records')).toBeTruthy();
});

it('does not look for records without a saved entry', () => {
  jest.mocked(usePersonalRecords).mockReturnValue({
    records: [record('entry-1', '5k', '24:10')],
  } as never);
  renderScreen(params());
  expect(usePersonalRecords).toHaveBeenCalledWith(false);
  expect(screen.queryByText('New personal record')).toBeNull();
});

describe('treadmill distance', () => {
  const treadmill = (overrides: Partial<RunSummaryParams> = {}) =>
    params({
      entryId: 'entry-1',
      editableDistance: true,
      distanceMeters: 4000,
      activeSeconds: 1200,
      ...overrides,
    });

  it('is only offered for an indoor run that was saved', () => {
    renderScreen(params({ entryId: 'entry-1' }));
    expect(screen.queryByText('Treadmill distance')).toBeNull();
    renderScreen(params({ editableDistance: true }));
    expect(screen.queryByText('Treadmill distance')).toBeNull();
  });

  it('sends the distance in km and shows it, with the pace following', async () => {
    renderScreen(treadmill());
    expect(screen.getByText('4.00')).toBeTruthy();
    fireEvent.changeText(
      screen.getByLabelText('Distance from the treadmill in km'),
      '5'
    );
    fireEvent.press(screen.getByText('Update'));
    await screen.findByText('Distance updated.');
    expect(setExerciseEntryDistance).toHaveBeenCalledWith('entry-1', 5);
    expect(screen.getByText('5.00')).toBeTruthy();
  });

  it('converts miles to km', async () => {
    renderScreen(treadmill({ distanceUnit: 'miles' }));
    fireEvent.changeText(
      screen.getByLabelText('Distance from the treadmill in mi'),
      '3'
    );
    fireEvent.press(screen.getByText('Update'));
    await screen.findByText('Distance updated.');
    expect(setExerciseEntryDistance).toHaveBeenCalledWith(
      'entry-1',
      expect.closeTo(4.828, 2)
    );
  });

  it('keeps the old figure when the update fails', async () => {
    jest
      .mocked(setExerciseEntryDistance)
      .mockRejectedValueOnce(new Error('offline'));
    renderScreen(treadmill());
    fireEvent.changeText(
      screen.getByLabelText('Distance from the treadmill in km'),
      '5'
    );
    fireEvent.press(screen.getByText('Update'));
    await waitFor(() => expect(setExerciseEntryDistance).toHaveBeenCalled());
    expect(screen.queryByText('Distance updated.')).toBeNull();
    expect(screen.getByText('4.00')).toBeTruthy();
  });

  it('will not send an empty or absurd distance', () => {
    renderScreen(treadmill());
    fireEvent.changeText(
      screen.getByLabelText('Distance from the treadmill in km'),
      '5000'
    );
    fireEvent.press(screen.getByText('Update'));
    expect(setExerciseEntryDistance).not.toHaveBeenCalled();
  });
});

describe('running form', () => {
  it('shows nothing when the phone could not measure it', () => {
    renderScreen(params());
    expect(screen.queryByText('Avg cadence')).toBeNull();
    expect(screen.queryByText('Stride length')).toBeNull();
  });

  it('shows cadence in spm and stride in metres', () => {
    renderScreen(params({ form: { avgCadence: 168, strideLengthCm: 112.5 } }));
    expect(screen.getByText('Avg cadence')).toBeTruthy();
    expect(screen.getByText('168 spm')).toBeTruthy();
    expect(screen.getByText('Stride length')).toBeTruthy();
    expect(screen.getByText('1.13 m')).toBeTruthy();
  });

  it('shows stride in feet with the miles setting', () => {
    renderScreen(
      params({
        distanceUnit: 'miles',
        form: { avgCadence: 168, strideLengthCm: 112.5 },
      })
    );
    expect(screen.getByText('3.69 ft')).toBeTruthy();
  });

  it('shows cadence alone when there is no stride', () => {
    renderScreen(params({ form: { avgCadence: 160, strideLengthCm: null } }));
    expect(screen.getByText('160 spm')).toBeTruthy();
    expect(screen.queryByText('Stride length')).toBeNull();
  });

  describe('after the treadmill distance is corrected', () => {
    // 3000 steps in 20 minutes.
    const treadmill = () =>
      params({
        entryId: 'entry-1',
        editableDistance: true,
        distanceMeters: 4000,
        activeSeconds: 1200,
        form: { avgCadence: 150, strideLengthCm: 133.3, steps: 3000 },
      });
    const correct = async (km: string) => {
      fireEvent.changeText(
        screen.getByLabelText('Distance from the treadmill in km'),
        km
      );
      fireEvent.press(screen.getByText('Update'));
      await screen.findByText('Distance updated.');
    };

    it('works the stride out again and updates the entry', async () => {
      renderScreen(treadmill());
      await correct('3');

      expect(setExerciseEntryStrideLength).toHaveBeenCalledWith('entry-1', 100);
      expect(screen.getByText('1 m')).toBeTruthy();
      expect(screen.getByText('150 spm')).toBeTruthy();
    });

    it('clears a stride the new distance cannot support', async () => {
      renderScreen(treadmill());
      // 20 km in 3000 steps is a 6.7 m stride.
      await correct('20');

      expect(setExerciseEntryStrideLength).toHaveBeenCalledWith(
        'entry-1',
        null
      );
      expect(screen.queryByText('Stride length')).toBeNull();
    });

    it('keeps the correction when the stride update fails', async () => {
      jest
        .mocked(setExerciseEntryStrideLength)
        .mockRejectedValueOnce(new Error('offline'));
      renderScreen(treadmill());
      await correct('3');

      expect(screen.getByText('3.00')).toBeTruthy();
    });

    it('leaves the stride alone when the steps are not known', async () => {
      renderScreen(
        params({
          entryId: 'entry-1',
          editableDistance: true,
          distanceMeters: 4000,
          activeSeconds: 1200,
          form: { avgCadence: 150, strideLengthCm: 133.3 },
        })
      );
      await correct('3');

      expect(setExerciseEntryStrideLength).not.toHaveBeenCalled();
    });
  });
});

it('drops distance and pace for a jump rope, and shows its measured calories', () => {
  renderScreen(
    params({
      activity: 'jumpRope',
      distanceMeters: 0,
      activeSeconds: 600,
      activeEnergyKcal: 84,
      avgHeartRate: 121,
    })
  );
  expect(screen.getByText('Jump Rope saved')).toBeTruthy();
  expect(screen.getByText('10:00')).toBeTruthy();
  expect(screen.getByText('84')).toBeTruthy();
  expect(screen.getByText('121')).toBeTruthy();
  expect(screen.queryByText('Distance')).toBeNull();
  expect(screen.queryByText('Avg pace')).toBeNull();
  expect(screen.queryByText('Treadmill distance')).toBeNull();
});
