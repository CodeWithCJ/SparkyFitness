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

type ScreenProps = React.ComponentProps<typeof TreadmillSettingsScreen>;

const screenProps = {
  navigation: { goBack: jest.fn() } as unknown as ScreenProps['navigation'],
  route: {
    key: 'TreadmillSettings',
    name: 'TreadmillSettings',
  } as ScreenProps['route'],
};

const renderScreen = () => render(<TreadmillSettingsScreen {...screenProps} />);

beforeEach(async () => {
  mockDistanceUnit = 'km';
  await AsyncStorage.clear();
  useAppPreferencesStore.getState().setTreadmillCorrectionEnabled(false);
  useAppPreferencesStore.getState().setTreadmillCorrectionPercent(0);
});

const openRow = (title: string) => fireEvent.press(screen.getByText(title));

describe('strides', () => {
  it('shows each stride as a one-line summary until it is opened', async () => {
    renderScreen();
    await screen.findByText('0.75 m · typical');
    expect(screen.getByText('1.05 m · typical')).toBeTruthy();
    expect(screen.queryByText(/A typical stride\. It learns yours/)).toBeNull();
    expect(screen.queryByText('Steps taken')).toBeNull();

    openRow('Walking stride');

    expect(screen.getByText(/A typical stride\. It learns yours/)).toBeTruthy();
    // Nothing to reset on a stride that was never learned or set.
    expect(screen.queryByText('Reset')).toBeNull();
  });

  it('shows how many real distances taught a stride', async () => {
    await learnStride('run', 3000, 3000);
    await learnStride('run', 3000, 3000);
    renderScreen();

    await screen.findByText('1.00 m · learned from 2 distances');
    openRow('Running stride');
    expect(
      screen.getByText('Learned from 2 real distances. Each new one nudges it.')
    ).toBeTruthy();
  });

  it('uses the singular for one distance', async () => {
    await learnStride('walk', 3750, 3000);
    renderScreen();

    await screen.findByText('0.80 m · learned from 1 distance');
  });

  it('shows feet for someone who uses miles, and saves it as metres', async () => {
    mockDistanceUnit = 'miles';
    renderScreen();
    await screen.findByText('2.46 ft · typical');

    openRow('Walking stride');
    fireEvent.changeText(screen.getByLabelText('Walking stride in ft'), '2.5');
    fireEvent.press(screen.getByText('Save'));

    await screen.findByText('2.50 ft · set by you');
    expect((await getStride('walk')).meters).toBeCloseTo(0.762, 3);
  });

  it('sets a stride by hand', async () => {
    renderScreen();
    await screen.findByText('0.75 m · typical');

    openRow('Walking stride');
    fireEvent.changeText(screen.getByLabelText('Walking stride in m'), '0,7');
    fireEvent.press(screen.getByText('Save'));

    await screen.findByText('0.70 m · set by you');
    expect(await getStride('walk')).toEqual({ meters: 0.7, calibrated: true });
    expect((await getStride('run')).calibrated).toBe(false);
  });

  it('refuses a stride no person has', async () => {
    renderScreen();
    await screen.findByText('0.75 m · typical');

    openRow('Walking stride');
    fireEvent.changeText(screen.getByLabelText('Walking stride in m'), '9');
    fireEvent.press(screen.getByText('Save'));

    await screen.findByText(/That stride does not look right/);
    expect((await getStride('walk')).calibrated).toBe(false);
  });

  it('resets one activity to learn from scratch', async () => {
    await setStride('walk', 0.7);
    await learnStride('run', 3000, 3000);
    renderScreen();
    await screen.findByText('0.70 m · set by you');

    openRow('Walking stride');
    fireEvent.press(screen.getByLabelText('Reset walking stride'));

    await screen.findByText('0.75 m · typical');
    expect((await getStride('walk')).calibrated).toBe(false);
    expect((await getStride('run')).calibrated).toBe(true);
  });

  it('measures a stride from steps over a known distance', async () => {
    renderScreen();
    await screen.findByText('0.75 m · typical');

    openRow('Walking stride');
    fireEvent.press(screen.getByText('Measure it on a track'));
    fireEvent.changeText(screen.getByLabelText('Steps taken'), '4000');
    fireEvent.changeText(screen.getByLabelText('Real distance'), '3.2');
    fireEvent.press(screen.getByText('Set my stride'));

    await screen.findByText('Your walking stride is now 0.80 m.');
    expect((await getStride('walk')).calibrated).toBe(true);
  });

  it('says so when the numbers do not add up, and changes nothing', async () => {
    renderScreen();
    await screen.findByText('1.05 m · typical');

    openRow('Running stride');
    fireEvent.press(screen.getByText('Measure it on a track'));
    fireEvent.changeText(screen.getByLabelText('Steps taken'), '50');
    fireEvent.changeText(screen.getByLabelText('Real distance'), '3');
    fireEvent.press(screen.getByText('Set my stride'));

    await screen.findByText(/too short or does not add up/);
    expect((await getStride('run')).calibrated).toBe(false);
  });
});

describe('treadmill correction', () => {
  it('reads About right while off, and opens to its controls', () => {
    renderScreen();
    expect(screen.getByText('About right. Nothing is changed.')).toBeTruthy();
    expect(screen.queryByLabelText('Percent the treadmill is off')).toBeNull();

    openRow('Treadmill display');
    fireEvent.press(screen.getByText('More'));

    expect(useAppPreferencesStore.getState().treadmillCorrectionEnabled).toBe(
      true
    );
    expect(screen.getByLabelText('Percent the treadmill is off')).toBeTruthy();
    // No percent yet: the summary asks for one instead of reading About right.
    expect(
      screen.getByText('Shows more than you ran. Enter by how much.')
    ).toBeTruthy();
    expect(screen.queryByText('About right. Nothing is changed.')).toBeNull();
    expect(screen.getByText(/Enter how far off it is, up to 25%/)).toBeTruthy();
  });

  it('stores a display that shows more as a positive percent and previews it', () => {
    useAppPreferencesStore.getState().setTreadmillCorrectionEnabled(true);
    renderScreen();
    openRow('Treadmill display');

    fireEvent.changeText(
      screen.getByLabelText('Percent the treadmill is off'),
      '4'
    );

    expect(useAppPreferencesStore.getState().treadmillCorrectionPercent).toBe(
      4
    );
    expect(screen.getByText('Shows 4% more than you ran')).toBeTruthy();
    expect(
      screen.getByText('When it shows 5.00 km, 4.81 km is saved.')
    ).toBeTruthy();
  });

  it('stores a display that shows less as a negative percent', () => {
    useAppPreferencesStore.getState().setTreadmillCorrectionEnabled(true);
    renderScreen();
    openRow('Treadmill display');

    fireEvent.changeText(
      screen.getByLabelText('Percent the treadmill is off'),
      '2.5'
    );
    fireEvent.press(screen.getByText('Less'));

    expect(useAppPreferencesStore.getState().treadmillCorrectionPercent).toBe(
      -2.5
    );
    expect(screen.getByText('Shows 2.5% less than you ran')).toBeTruthy();
    expect(
      screen.getByText('When it shows 5.00 km, 5.13 km is saved.')
    ).toBeTruthy();
  });

  it('About right switches the correction off', () => {
    useAppPreferencesStore.getState().setTreadmillCorrectionEnabled(true);
    useAppPreferencesStore.getState().setTreadmillCorrectionPercent(4);
    renderScreen();
    openRow('Treadmill display');

    fireEvent.press(screen.getByText('About right'));

    expect(useAppPreferencesStore.getState().treadmillCorrectionEnabled).toBe(
      false
    );
    expect(screen.getByText('About right. Nothing is changed.')).toBeTruthy();
  });

  it('limits a typo to the allowed range', () => {
    useAppPreferencesStore.getState().setTreadmillCorrectionEnabled(true);
    renderScreen();
    openRow('Treadmill display');

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
    openRow('Treadmill display');

    fireEvent.changeText(
      screen.getByLabelText('Percent the treadmill is off'),
      ''
    );

    expect(useAppPreferencesStore.getState().treadmillCorrectionPercent).toBe(
      0
    );
  });

  it('works out the treadmill from steps and the stride, and offers the correction', async () => {
    await setStride('run', 1);
    renderScreen();
    await screen.findByText('1.00 m · set by you');

    openRow('Treadmill display');
    fireEvent.press(screen.getByText('Not sure? Work it out from your steps'));
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
    expect(screen.getByText('Shows 4% more than you ran')).toBeTruthy();
  });

  it('drops a result once the numbers behind it change', async () => {
    await setStride('run', 1);
    renderScreen();
    await screen.findByText('1.00 m · set by you');

    openRow('Treadmill display');
    fireEvent.press(screen.getByText('Not sure? Work it out from your steps'));
    fireEvent.changeText(screen.getByLabelText('Steps taken'), '5000');
    fireEvent.changeText(screen.getByLabelText('Treadmill showed'), '5.2');
    fireEvent.press(screen.getByText('Check my treadmill'));
    await screen.findByText('Use this correction');

    fireEvent.changeText(screen.getByLabelText('Treadmill showed'), '5.25');

    expect(screen.queryByText('Use this correction')).toBeNull();
    expect(screen.queryByText(/4% more than you did/)).toBeNull();
  });

  it('says when the treadmill is right', async () => {
    await setStride('run', 1);
    renderScreen();
    await screen.findByText('1.00 m · set by you');

    openRow('Treadmill display');
    fireEvent.press(screen.getByText('Not sure? Work it out from your steps'));
    fireEvent.changeText(screen.getByLabelText('Steps taken'), '5000');
    fireEvent.changeText(screen.getByLabelText('Treadmill showed'), '5');
    fireEvent.press(screen.getByText('Check my treadmill'));

    await screen.findByText(/The treadmill is right/);
    expect(screen.queryByText('Use this correction')).toBeNull();
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
      await screen.findByText('Raised by 9.6%. Learned from 6 runs.')
    ).toBeTruthy();
    expect(screen.getByText('Lowered by 5%. Learned from 1 run.')).toBeTruthy();
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
    await screen.findByText(/Raised by 9\.6%/);

    fireEvent.press(
      within(screen.getByTestId('watch-scale-run')).getByText('Reset')
    );

    await waitFor(() =>
      expect(
        within(screen.getByTestId('watch-scale-run')).getByText(
          'Not learned yet.'
        )
      ).toBeTruthy()
    );
    expect(JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}')).toEqual({
      walk: { scale: 0.95, samples: 1 },
    });
    expect(screen.getByText(/Lowered by 5%/)).toBeTruthy();
  });
});
