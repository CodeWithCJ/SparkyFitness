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
    await screen.findAllByText('A typical stride until it learns yours.');
    expect(screen.getByText('0.75 m')).toBeTruthy();
    expect(screen.getByText('1.05 m')).toBeTruthy();
    expect(screen.queryByText('Reset')).toBeNull();
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

    fireEvent.press(screen.getAllByText('Type it in')[0]);
    fireEvent.changeText(screen.getByLabelText('Walking stride in ft'), '2.5');
    fireEvent.press(screen.getAllByText('Save')[0]);

    await screen.findByText('Set by you. New distances nudge it from here.');
    expect((await getStride('walk')).meters).toBeCloseTo(0.762, 3);
  });

  it('sets a stride by hand', async () => {
    renderScreen();
    await screen.findByText('0.75 m');

    fireEvent.press(screen.getAllByText('Type it in')[0]);
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

    fireEvent.press(screen.getAllByText('Type it in')[0]);
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

    fireEvent.press(screen.getByLabelText('Reset walking stride'));

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
    expect(screen.queryByText('It shows')).toBeNull();

    fireEvent(
      screen.getByLabelText('My treadmill is off'),
      'valueChange',
      true
    );

    expect(useAppPreferencesStore.getState().treadmillCorrectionEnabled).toBe(
      true
    );
    expect(screen.getByText('It shows')).toBeTruthy();
  });

  it('stores a display that reads long as a positive percent and previews it', () => {
    useAppPreferencesStore.getState().setTreadmillCorrectionEnabled(true);
    renderScreen();

    fireEvent.changeText(
      screen.getByLabelText('Percent the treadmill is off'),
      '4'
    );

    expect(useAppPreferencesStore.getState().treadmillCorrectionPercent).toBe(
      4
    );
    expect(
      screen.getByText('When the treadmill shows 5.00 km, 4.81 km is saved.')
    ).toBeTruthy();
  });

  it('stores a display that reads short as a negative percent', () => {
    useAppPreferencesStore.getState().setTreadmillCorrectionEnabled(true);
    renderScreen();

    fireEvent.changeText(
      screen.getByLabelText('Percent the treadmill is off'),
      '2.5'
    );
    fireEvent.press(screen.getByText('Less than I ran'));

    expect(useAppPreferencesStore.getState().treadmillCorrectionPercent).toBe(
      -2.5
    );
    expect(
      screen.getByText('When the treadmill shows 5.00 km, 5.13 km is saved.')
    ).toBeTruthy();
  });

  it('limits a typo to the allowed range', () => {
    useAppPreferencesStore.getState().setTreadmillCorrectionEnabled(true);
    renderScreen();

    fireEvent.changeText(
      screen.getByLabelText('Percent the treadmill is off'),
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
      screen.getByLabelText('Percent the treadmill is off'),
      ''
    );

    expect(useAppPreferencesStore.getState().treadmillCorrectionPercent).toBe(
      0
    );
  });
});

describe('measuring', () => {
  it('sets the stride from the steps and the real distance', async () => {
    renderScreen();
    await screen.findByText('1.05 m');

    fireEvent.press(screen.getByText('Walk'));
    fireEvent.changeText(screen.getByLabelText('Steps taken'), '4000');
    fireEvent.changeText(screen.getByLabelText('Real distance'), '3');
    fireEvent.press(screen.getByText('Set my stride'));

    await screen.findByText('Your walking stride is now 0.75 m.');
    expect((await getStride('walk')).calibrated).toBe(true);
    expect(screen.queryByText('Use this correction')).toBeNull();
  });

  it('checks the treadmill from steps and the stride, and offers the correction', async () => {
    await setStride('run', 1);
    renderScreen();
    await screen.findByText('1.00 m');

    fireEvent.press(screen.getByText('My treadmill'));
    expect(
      screen.getByText(/Your steps times your running stride \(1\.00 m\)/)
    ).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Steps taken'), '5000');
    fireEvent.changeText(screen.getByLabelText('Treadmill showed'), '5.2');
    fireEvent.press(screen.getByText('Check my treadmill'));

    await screen.findByText(
      'Your steps make that 5.00 km, so the treadmill shows 4% more than you did.'
    );
    // The stride is not changed by a treadmill check.
    expect((await getStride('run')).meters).toBe(1);
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

  it('says when the treadmill is right', async () => {
    await setStride('run', 1);
    renderScreen();
    await screen.findByText('1.00 m');

    fireEvent.press(screen.getByText('My treadmill'));
    fireEvent.changeText(screen.getByLabelText('Steps taken'), '5000');
    fireEvent.changeText(screen.getByLabelText('Treadmill showed'), '5');
    fireEvent.press(screen.getByText('Check my treadmill'));

    await screen.findByText(/The treadmill is right/);
    expect(screen.queryByText('Use this correction')).toBeNull();
  });

  it('says so when the numbers do not add up, and changes nothing', async () => {
    renderScreen();
    await screen.findByText('1.05 m');

    fireEvent.changeText(screen.getByLabelText('Steps taken'), '50');
    fireEvent.changeText(screen.getByLabelText('Real distance'), '3');
    fireEvent.press(screen.getByText('Set my stride'));

    await screen.findByText(/too short or does not add up/);
    expect((await getStride('run')).calibrated).toBe(false);
  });

  it('waits for the steps and distance before it can run', async () => {
    renderScreen();
    await screen.findByText('1.05 m');

    fireEvent.press(screen.getByText('Set my stride'));

    expect((await getStride('run')).calibrated).toBe(false);
    expect(screen.queryByText(/too short/)).toBeNull();
  });
});

describe('the watch treadmill distance', () => {
  const KEY = '@SparkyFitness/watchIndoorScale';

  it('says nothing has been learned yet', async () => {
    renderScreen();
    expect(await screen.findAllByText('Not learned yet.')).toHaveLength(2);
    expect(screen.queryByText('Reset')).toBeNull();
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
        'The watch’s distance is raised by 9.6%. Learned from 6 runs.'
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        'The watch’s distance is lowered by 5%. Learned from 1 run.'
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
    await screen.findByText(/raised by 9\.6%/);

    fireEvent.press(
      within(screen.getByTestId('watch-scale-run')).getByText('Reset')
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
    expect(screen.getByText(/lowered by 5%/)).toBeTruthy();
  });
});
