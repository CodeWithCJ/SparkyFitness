import React from 'react';
import {
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react-native';
import FitnessTestScreen from '../../src/screens/FitnessTestScreen';
import { useFitnessTests } from '../../src/services/fitnessTestService';
import { fitnessTest, fitnessTestsHook } from '../helpers/fitnessTestFixture';

jest.mock('../../src/services/fitnessTestService', () => ({
  useFitnessTests: jest.fn(),
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
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const navigate = jest.fn();
const renderScreen = () =>
  render(
    <FitnessTestScreen
      {...({
        navigation: { navigate, goBack: jest.fn() },
        route: { key: 'f', name: 'FitnessTest' },
      } as never)}
    />
  );

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useFitnessTests).mockReturnValue(fitnessTestsHook([]));
});

it('offers the three tests and records the one chosen', () => {
  renderScreen();
  expect(screen.getByText('5K time trial')).toBeTruthy();
  expect(screen.getByText('30-minute all-out run')).toBeTruthy();
  expect(screen.getByText('12-minute Cooper test')).toBeTruthy();

  fireEvent.press(screen.getByTestId('fitness-test-start-cooper'));
  expect(navigate).toHaveBeenCalledWith('RecordActivity', {
    fitnessTest: 'cooper',
  });
  fireEvent.press(screen.getByTestId('fitness-test-start-30min'));
  expect(navigate).toHaveBeenCalledWith('RecordActivity', {
    fitnessTest: '30min',
  });
  fireEvent.press(screen.getByTestId('fitness-test-start-5k'));
  expect(navigate).toHaveBeenCalledWith('RecordActivity', {
    fitnessTest: '5k',
  });
});

it('says there are no tests yet', () => {
  renderScreen();
  expect(screen.getByTestId('fitness-test-history-empty')).toBeTruthy();
});

it('lists each test with its result and the paces it gave', () => {
  const older = fitnessTest({
    id: 'older',
    test_date: '2026-08-20',
    measurement: { type: 'cooper', distanceMeters: 2800, durationSeconds: 720 },
  });
  jest
    .mocked(useFitnessTests)
    .mockReturnValue(fitnessTestsHook([fitnessTest({ id: 'newer' }), older]));
  renderScreen();

  const newer = screen.getByTestId('fitness-test-row-newer');
  expect(within(newer).getByText('5K in 25:00')).toBeTruthy();
  expect(
    within(newer).getByText(/Threshold \d:\d\d\/km · Easy \d:\d\d–\d:\d\d\/km/)
  ).toBeTruthy();
  expect(within(newer).getByText(/5K time trial/)).toBeTruthy();

  const row = screen.getByTestId('fitness-test-row-older');
  expect(within(row).getByText('2,800 m in 12 minutes')).toBeTruthy();
  expect(within(row).getByText(/12-minute Cooper test/)).toBeTruthy();
});

it('opens a test from the history', () => {
  jest
    .mocked(useFitnessTests)
    .mockReturnValue(fitnessTestsHook([fitnessTest({ id: 'newer' })]));
  renderScreen();
  fireEvent.press(screen.getByTestId('fitness-test-row-newer'));
  expect(navigate).toHaveBeenCalledWith('FitnessTestResult', { id: 'newer' });
});

it('keeps the history short', () => {
  const many = Array.from({ length: 12 }, (_, i) =>
    fitnessTest({ id: `t${i}` })
  );
  jest.mocked(useFitnessTests).mockReturnValue(fitnessTestsHook(many));
  renderScreen();
  expect(screen.getAllByTestId(/fitness-test-row-/)).toHaveLength(10);
  expect(screen.getByText('Showing your latest 10 tests.')).toBeTruthy();
});

describe('surface', () => {
  const treadmill = fitnessTest({
    id: 'tm',
    measurement: {
      type: 'cooper',
      distanceMeters: 3000,
      durationSeconds: 720,
      inclinePercent: 3,
    },
  });

  it('starts a retest on the surface the last test used', () => {
    jest
      .mocked(useFitnessTests)
      .mockReturnValue(
        fitnessTestsHook([treadmill, fitnessTest({ id: 'old' })])
      );
    renderScreen();
    expect(
      screen.getByTestId('fitness-test-last-surface').props.children
    ).toMatch(/Your last test was on: Treadmill/);
    fireEvent.press(screen.getByTestId('fitness-test-start-5k'));
    expect(navigate).toHaveBeenCalledWith('RecordActivity', {
      fitnessTest: '5k',
      indoor: true,
    });
  });

  it('suggests outdoors after an outdoor test', () => {
    jest
      .mocked(useFitnessTests)
      .mockReturnValue(fitnessTestsHook([fitnessTest({ id: 'out' })]));
    renderScreen();
    expect(
      screen.getByTestId('fitness-test-last-surface').props.children
    ).toMatch(/Your last test was on: Outdoor/);
    fireEvent.press(screen.getByTestId('fitness-test-start-cooper'));
    expect(navigate).toHaveBeenCalledWith('RecordActivity', {
      fitnessTest: 'cooper',
      indoor: false,
    });
  });

  it('suggests nothing before a first test', () => {
    renderScreen();
    expect(screen.queryByTestId('fitness-test-last-surface')).toBeNull();
  });

  it('marks each test in the history as outdoor or treadmill, with its incline', () => {
    jest
      .mocked(useFitnessTests)
      .mockReturnValue(
        fitnessTestsHook([
          treadmill,
          fitnessTest({ id: 'out', test_date: '2026-08-01' }),
        ])
      );
    renderScreen();
    expect(screen.getByTestId('fitness-test-surface-tm').props.children).toBe(
      'Treadmill, 3% incline, adjusted'
    );
    expect(screen.getByTestId('fitness-test-surface-out').props.children).toBe(
      'Outdoor'
    );
  });
});
