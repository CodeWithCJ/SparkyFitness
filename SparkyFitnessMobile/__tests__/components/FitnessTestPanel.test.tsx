import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import FitnessTestPanel from '../../src/components/recording/FitnessTestPanel';
import { useFitnessTests } from '../../src/services/fitnessTestService';
import { fitnessTest, fitnessTestsHook } from '../helpers/fitnessTestFixture';

jest.mock('../../src/services/fitnessTestService', () => ({
  useFitnessTests: jest.fn(),
}));

const props = () => ({
  today: '2026-10-18',
  unit: 'km' as const,
  onOpenTests: jest.fn(),
  onStartProgram: jest.fn(),
  onPlanRace: jest.fn(),
});

beforeEach(() => jest.clearAllMocks());

it('invites a first test when there is none', () => {
  jest.mocked(useFitnessTests).mockReturnValue(fitnessTestsHook([]));
  const p = props();
  render(<FitnessTestPanel {...p} />);
  fireEvent.press(screen.getByTestId('fitness-test-take'));
  expect(p.onOpenTests).toHaveBeenCalled();
});

it('shows nothing while the tests are loading', () => {
  jest
    .mocked(useFitnessTests)
    .mockReturnValue({ ...fitnessTestsHook([]), loaded: false });
  render(<FitnessTestPanel {...props()} />);
  expect(screen.queryByTestId('fitness-test-panel-empty')).toBeNull();
  expect(screen.queryByTestId('fitness-test-panel')).toBeNull();
});

it('shows the latest test and the paces it set', () => {
  jest
    .mocked(useFitnessTests)
    .mockReturnValue(fitnessTestsHook([fitnessTest()]));
  render(<FitnessTestPanel {...props()} />);
  expect(screen.getByText(/5K time trial on .*: 5K in 25:00/)).toBeTruthy();
  expect(screen.getByText(/Threshold pace .*about 25:00 for 5K/)).toBeTruthy();
});

it.each([
  [1500, 'faster10k', 'Faster 10K'],
  [1680, 'faster5k', 'Faster 5K'],
  [2400, 'fiveToTenK', '5K to 10K'],
])('starts the program a %i s 5K points to', (seconds, id, name) => {
  jest.mocked(useFitnessTests).mockReturnValue(
    fitnessTestsHook([
      fitnessTest({
        measurement: {
          type: '5k',
          distanceMeters: 5000,
          durationSeconds: seconds,
        },
      }),
    ])
  );
  const p = props();
  render(<FitnessTestPanel {...p} />);
  fireEvent.press(screen.getByTestId('fitness-test-start-program'));
  expect(p.onStartProgram).toHaveBeenCalledWith(id);
  expect(screen.getByText(`Start ${name} from my test`)).toBeTruthy();
});

it('plans a race and opens the tests', () => {
  jest
    .mocked(useFitnessTests)
    .mockReturnValue(fitnessTestsHook([fitnessTest()]));
  const p = props();
  render(<FitnessTestPanel {...p} />);
  fireEvent.press(screen.getByTestId('fitness-test-plan-race'));
  expect(p.onPlanRace).toHaveBeenCalled();
  fireEvent.press(screen.getByTestId('fitness-test-open'));
  expect(p.onOpenTests).toHaveBeenCalled();
});

it('offers the retest when the test is six weeks old', () => {
  jest
    .mocked(useFitnessTests)
    .mockReturnValue(fitnessTestsHook([fitnessTest()]));
  const p = props();
  render(<FitnessTestPanel {...p} today="2026-11-12" />);
  expect(screen.getByTestId('fitness-retest-prompt')).toBeTruthy();
  fireEvent.press(screen.getByTestId('fitness-retest-start'));
  expect(p.onOpenTests).toHaveBeenCalled();
});

it('has no retest offer for a recent test', () => {
  jest
    .mocked(useFitnessTests)
    .mockReturnValue(fitnessTestsHook([fitnessTest()]));
  render(<FitnessTestPanel {...props()} />);
  expect(screen.queryByTestId('fitness-retest-prompt')).toBeNull();
});
