import React from 'react';
import { Alert } from 'react-native';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import FitnessTestResultScreen from '../../src/screens/FitnessTestResultScreen';
import {
  removeFitnessTest,
  useFitnessTests,
} from '../../src/services/fitnessTestService';
import { fitnessTest, fitnessTestsHook } from '../helpers/fitnessTestFixture';

jest.mock('../../src/services/fitnessTestService', () => ({
  useFitnessTests: jest.fn(),
  removeFitnessTest: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../src/hooks/useRefetchOnFocus', () => ({
  useRefetchOnFocus: jest.fn(),
}));
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { default_distance_unit: 'km' } }),
}));
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const navigation = { navigate: jest.fn(), goBack: jest.fn() };
const renderScreen = (id: string) =>
  render(
    <FitnessTestResultScreen
      {...({
        navigation,
        route: { key: 'r', name: 'FitnessTestResult', params: { id } },
      } as never)}
    />
  );

const latest = fitnessTest({
  id: 'latest',
  test_date: '2026-11-15',
  measurement: { type: '5k', distanceMeters: 5000, durationSeconds: 1440 },
});
const earlier = fitnessTest({ id: 'earlier', test_date: '2026-10-01' });

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(useFitnessTests)
    .mockReturnValue(fitnessTestsHook([latest, earlier]));
});

it('shows the result, the threshold and the training paces it set', () => {
  renderScreen('earlier');
  expect(screen.getByText('5K in 25:00')).toBeTruthy();
  expect(
    screen.getByText(/Threshold pace .* As a 5K that is about 25:00/)
  ).toBeTruthy();
  expect(screen.getByText('Your training paces')).toBeTruthy();
  expect(screen.getByTestId('fitness-pace-zone-easy')).toBeTruthy();
});

it('has no comparison for the first test', () => {
  renderScreen('earlier');
  expect(screen.queryByTestId('fitness-result-change')).toBeNull();
  expect(screen.queryByTestId('fitness-pace-change-easy')).toBeNull();
});

it('shows how the paces changed after a retest', () => {
  renderScreen('latest');
  expect(screen.getByText('5K in 24:00')).toBeTruthy();
  const change = screen.getByTestId('fitness-result-change');
  expect(within(change).getByText(/Since your test on .*Oct/)).toBeTruthy();
  expect(
    within(change).getByText(/Threshold pace: \d+ s\/km faster\./)
  ).toBeTruthy();
  for (const id of ['easy', 'steady', 'threshold', 'interval', 'repetition']) {
    expect(
      within(screen.getByTestId(`fitness-pace-change-${id}`)).getByText(
        /s\/km faster/
      )
    ).toBeTruthy();
  }
});

it('says a slower retest is slower', () => {
  const slower = fitnessTest({
    id: 'slower',
    test_date: '2026-11-20',
    measurement: { type: '5k', distanceMeters: 5000, durationSeconds: 1560 },
  });
  jest
    .mocked(useFitnessTests)
    .mockReturnValue(fitnessTestsHook([slower, earlier]));
  renderScreen('slower');
  expect(
    within(screen.getByTestId('fitness-result-change')).getByText(
      /s\/km slower/
    )
  ).toBeTruthy();
});

it('says so when the test is gone', () => {
  renderScreen('nope');
  expect(screen.getByTestId('fitness-test-missing')).toBeTruthy();
});

it('goes on to the training programs', () => {
  renderScreen('latest');
  fireEvent.press(screen.getByTestId('fitness-result-plan'));
  expect(navigation.navigate).toHaveBeenCalledWith('RunPrograms');
});

describe('deleting', () => {
  it('asks first, then deletes and goes back', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    renderScreen('latest');
    fireEvent.press(screen.getByTestId('fitness-result-delete'));
    expect(alert).toHaveBeenCalled();
    expect(removeFitnessTest).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0][2]!;
    await act(async () => {
      buttons.find((b) => b.text === 'Delete')!.onPress!();
    });
    await waitFor(() =>
      expect(removeFitnessTest).toHaveBeenCalledWith('latest')
    );
    await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
  });

  it('stays put when the delete fails', async () => {
    jest.mocked(removeFitnessTest).mockRejectedValueOnce(new Error('offline'));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    renderScreen('latest');
    fireEvent.press(screen.getByTestId('fitness-result-delete'));
    await act(async () => {
      alert.mock.calls[0][2]!.find((b) => b.text === 'Delete')!.onPress!();
    });
    await waitFor(() => expect(removeFitnessTest).toHaveBeenCalled());
    expect(navigation.goBack).not.toHaveBeenCalled();
  });
});

describe('treadmill tests', () => {
  const treadmill = (extra: object = {}) =>
    fitnessTest({
      id: 'tm',
      test_date: '2026-11-20',
      measurement: {
        type: 'cooper',
        distanceMeters: 3000,
        durationSeconds: 720,
        inclinePercent: 3,
        ...extra,
      },
    });

  it('says it was a treadmill test and shows the raw and adjusted numbers', () => {
    jest
      .mocked(useFitnessTests)
      .mockReturnValue(fitnessTestsHook([treadmill()]));
    renderScreen('tm');
    expect(screen.getByTestId('fitness-result-surface').props.children).toBe(
      'Treadmill, 3% incline, adjusted'
    );
    expect(screen.getByTestId('fitness-result-adjustment').props.children).toBe(
      'Adjusted for 3% incline: 3,000 m in 12 minutes counts as 3,258 m in 12 minutes.'
    );
    // The headline is the adjusted result.
    expect(screen.getByText('3,258 m in 12 minutes')).toBeTruthy();
  });

  it('shows no adjustment when it was switched off', () => {
    jest
      .mocked(useFitnessTests)
      .mockReturnValue(
        fitnessTestsHook([treadmill({ adjustForIncline: false })])
      );
    renderScreen('tm');
    expect(screen.getByTestId('fitness-result-surface').props.children).toBe(
      'Treadmill, 3% incline, not adjusted'
    );
    expect(screen.queryByTestId('fitness-result-adjustment')).toBeNull();
  });

  it('says outdoors for a GPS test', () => {
    renderScreen('earlier');
    expect(screen.getByTestId('fitness-result-surface').props.children).toBe(
      'Outdoor'
    );
    expect(screen.queryByTestId('fitness-result-adjustment')).toBeNull();
  });
});
