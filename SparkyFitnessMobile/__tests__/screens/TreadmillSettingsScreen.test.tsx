import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import TreadmillSettingsScreen from '../../src/screens/TreadmillSettingsScreen';
import {
  getStride,
  learnStride,
  setStride,
} from '../../src/services/strideCalibration';
import { useAppPreferencesStore } from '../../src/stores/appPreferencesStore';

let mockDistanceUnit: 'km' | 'miles' = 'km';

jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: jest.fn(() => null),
}));
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({
    preferences: { default_distance_unit: mockDistanceUnit },
  }),
}));
jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('uniwind', () => ({
  useCSSVariable: (keys: string | string[]) =>
    Array.isArray(keys) ? keys.map(() => '#111827') : '#111827',
  useUniwind: () => ({ theme: 'light' }),
}));

const renderScreen = () =>
  render(
    <TreadmillSettingsScreen
      {...({
        navigation: { goBack: jest.fn() },
        route: { key: 'TreadmillSettings', name: 'TreadmillSettings' },
      } as never)}
    />
  );

beforeEach(async () => {
  mockDistanceUnit = 'km';
  await AsyncStorage.clear();
  useAppPreferencesStore.getState().setTreadmillCorrectionEnabled(false);
  useAppPreferencesStore.getState().setTreadmillCorrectionPercent(0);
});

describe('strides', () => {
  it('shows the default for a stride that has not been learned', async () => {
    renderScreen();
    await screen.findAllByText(
      'Default stride. Not learned yet: it learns when you enter the distance a treadmill showed after a run, or set it below.'
    );
    expect(screen.getByText('0.75 m')).toBeTruthy();
    expect(screen.getByText('1.05 m')).toBeTruthy();
    expect(screen.queryByText('Reset and learn from scratch')).toBeNull();
  });

  it('shows how many real distances taught a stride', async () => {
    await learnStride('run', 3000, 3000);
    await learnStride('run', 3000, 3000);
    renderScreen();

    await screen.findByText('Learned from 2 real distances.');
    expect(screen.getByText('1.00 m')).toBeTruthy();
  });

  it('uses the singular for one distance', async () => {
    await learnStride('walk', 3750, 3000);
    renderScreen();

    await screen.findByText('Learned from 1 real distance.');
  });

  it('shows feet for someone who uses miles, and saves it as metres', async () => {
    mockDistanceUnit = 'miles';
    renderScreen();
    await screen.findByText('2.46 ft');

    fireEvent.changeText(screen.getByLabelText('Walking stride in ft'), '2.5');
    fireEvent.press(screen.getAllByText('Save')[0]);

    await screen.findByText('Set by you. New distances nudge it from here.');
    expect((await getStride('walk')).meters).toBeCloseTo(0.762, 3);
  });

  it('sets a stride by hand', async () => {
    renderScreen();
    await screen.findByText('0.75 m');

    fireEvent.changeText(screen.getByLabelText('Walking stride in m'), '0,7');
    fireEvent.press(screen.getAllByText('Save')[0]);

    await screen.findByText('Set by you. New distances nudge it from here.');
    expect(screen.getByText('0.70 m')).toBeTruthy();
    expect(await getStride('walk')).toEqual({ meters: 0.7, calibrated: true });
    expect((await getStride('run')).calibrated).toBe(false);
  });

  it('refuses a stride no person has', async () => {
    renderScreen();
    await screen.findByText('0.75 m');

    fireEvent.changeText(screen.getByLabelText('Walking stride in m'), '9');
    fireEvent.press(screen.getAllByText('Save')[0]);

    await screen.findByText(/That stride does not look right/);
    expect((await getStride('walk')).calibrated).toBe(false);
  });

  it('resets one activity to learn from scratch', async () => {
    await setStride('walk', 0.7);
    await learnStride('run', 3000, 3000);
    renderScreen();
    await screen.findByText('0.70 m');

    fireEvent.press(screen.getAllByText('Reset and learn from scratch')[0]);

    await waitFor(async () =>
      expect((await getStride('walk')).calibrated).toBe(false)
    );
    await screen.findByText('0.75 m');
    expect((await getStride('run')).calibrated).toBe(true);
  });
});

describe('treadmill correction', () => {
  it('is off until switched on, and hides its controls while off', () => {
    renderScreen();
    expect(screen.queryByText('My treadmill display reads')).toBeNull();

    fireEvent(
      screen.getByLabelText('Correct treadmill distance'),
      'valueChange',
      true
    );

    expect(useAppPreferencesStore.getState().treadmillCorrectionEnabled).toBe(
      true
    );
    expect(screen.getByText('My treadmill display reads')).toBeTruthy();
  });

  it('stores a display that reads long as a positive percent and previews it', () => {
    useAppPreferencesStore.getState().setTreadmillCorrectionEnabled(true);
    renderScreen();

    fireEvent.changeText(
      screen.getByLabelText('Percent the treadmill reads off'),
      '4'
    );

    expect(useAppPreferencesStore.getState().treadmillCorrectionPercent).toBe(
      4
    );
    expect(
      screen.getByText('A display of 5.00 km is saved as 4.81 km (+4%).')
    ).toBeTruthy();
  });

  it('stores a display that reads short as a negative percent', () => {
    useAppPreferencesStore.getState().setTreadmillCorrectionEnabled(true);
    renderScreen();

    fireEvent.changeText(
      screen.getByLabelText('Percent the treadmill reads off'),
      '2.5'
    );
    fireEvent.press(screen.getByText('Short'));

    expect(useAppPreferencesStore.getState().treadmillCorrectionPercent).toBe(
      -2.5
    );
    expect(
      screen.getByText('A display of 5.00 km is saved as 5.13 km (-2.5%).')
    ).toBeTruthy();
  });

  it('limits a typo to the allowed range', () => {
    useAppPreferencesStore.getState().setTreadmillCorrectionEnabled(true);
    renderScreen();

    fireEvent.changeText(
      screen.getByLabelText('Percent the treadmill reads off'),
      '80'
    );

    expect(useAppPreferencesStore.getState().treadmillCorrectionPercent).toBe(
      25
    );
  });

  it('clears the percent when the field is emptied', () => {
    useAppPreferencesStore.getState().setTreadmillCorrectionEnabled(true);
    useAppPreferencesStore.getState().setTreadmillCorrectionPercent(4);
    renderScreen();

    fireEvent.changeText(
      screen.getByLabelText('Percent the treadmill reads off'),
      ''
    );

    expect(useAppPreferencesStore.getState().treadmillCorrectionPercent).toBe(
      0
    );
  });
});

describe('calibrating on purpose', () => {
  const fill = (steps: string, distance: string, shown = '') => {
    fireEvent.changeText(screen.getByLabelText('Steps taken'), steps);
    fireEvent.changeText(screen.getByLabelText('Real distance'), distance);
    if (shown) {
      fireEvent.changeText(
        screen.getByLabelText('Treadmill showed (optional)'),
        shown
      );
    }
  };

  it('sets the stride from the steps and the real distance', async () => {
    renderScreen();
    await screen.findByText('1.05 m');

    fireEvent.press(screen.getByText('Walk'));
    fill('4000', '3');
    fireEvent.press(screen.getByText('Calibrate'));

    await screen.findByText('Your walking stride is now 0.75 m.');
    expect((await getStride('walk')).calibrated).toBe(true);
    expect(screen.queryByText('Use this correction')).toBeNull();
  });

  it('works out how far off the treadmill is and offers it', async () => {
    renderScreen();
    await screen.findByText('1.05 m');

    fill('5000', '5', '5.2');
    fireEvent.press(screen.getByText('Calibrate'));

    await screen.findByText('Your running stride is now 1.00 m.');
    expect(
      screen.getByText('The treadmill display is off by +4%.')
    ).toBeTruthy();
    // Offered, not applied behind their back.
    expect(useAppPreferencesStore.getState().treadmillCorrectionEnabled).toBe(
      false
    );

    fireEvent.press(screen.getByText('Use this correction'));

    expect(useAppPreferencesStore.getState().treadmillCorrectionEnabled).toBe(
      true
    );
    expect(useAppPreferencesStore.getState().treadmillCorrectionPercent).toBe(
      4
    );
  });

  it('says so when the numbers do not add up, and changes nothing', async () => {
    renderScreen();
    await screen.findByText('1.05 m');

    fill('50', '3');
    fireEvent.press(screen.getByText('Calibrate'));

    await screen.findByText(/too short or does not add up/);
    expect((await getStride('run')).calibrated).toBe(false);
  });

  it('waits for the steps and distance before it can run', async () => {
    renderScreen();
    await screen.findByText('1.05 m');

    fireEvent.press(screen.getByText('Calibrate'));

    expect((await getStride('run')).calibrated).toBe(false);
    expect(screen.queryByText(/too short/)).toBeNull();
  });
});

describe('the watch treadmill distance', () => {
  const KEY = '@SparkyFitness/watchIndoorScale';

  it('says nothing has been learned yet', async () => {
    renderScreen();
    expect(
      await screen.findAllByText(/Not learned yet. It learns when you enter/)
    ).toHaveLength(2);
    expect(screen.queryByText('Reset and learn from scratch')).toBeNull();
  });

  it('shows what the watch has learned for runs and walks', async () => {
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({
        run: { scale: 1.096, samples: 6 },
        walk: { scale: 0.95, samples: 1 },
      })
    );
    renderScreen();

    expect(
      await screen.findByText(
        /multiplied by 1\.096 \(\+9\.6%\)\. Learned from 6 corrections\./
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        /multiplied by 0\.950 \(-5%\)\. Learned from 1 correction\./
      )
    ).toBeTruthy();
  });

  it('resets one kind and leaves the other', async () => {
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({
        run: { scale: 1.096, samples: 6 },
        walk: { scale: 0.95, samples: 1 },
      })
    );
    renderScreen();
    await screen.findByText(/multiplied by 1\.096/);

    fireEvent.press(
      within(screen.getByTestId('watch-scale-run')).getByText(
        'Reset and learn from scratch'
      )
    );

    await waitFor(() =>
      expect(
        within(screen.getByTestId('watch-scale-run')).getByText(
          /Not learned yet/
        )
      ).toBeTruthy()
    );
    expect(JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}')).toEqual({
      walk: { scale: 0.95, samples: 1 },
    });
    expect(screen.getByText(/multiplied by 0\.950/)).toBeTruthy();
  });
});
