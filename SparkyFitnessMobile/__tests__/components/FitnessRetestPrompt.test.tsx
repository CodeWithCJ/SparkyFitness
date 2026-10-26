import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import FitnessRetestPrompt from '../../src/components/recording/FitnessRetestPrompt';
import ProgramRetestPrompt from '../../src/components/recording/ProgramRetestPrompt';
import { useFitnessTests } from '../../src/services/fitnessTestService';
import { useRunProgram } from '../../src/services/runProgramService';
import { fitnessTest, fitnessTestsHook } from '../helpers/fitnessTestFixture';

jest.mock('../../src/services/fitnessTestService', () => ({
  useFitnessTests: jest.fn(),
}));
jest.mock('../../src/services/runProgramService', () => ({
  useRunProgram: jest.fn(),
}));

const withTests = (...tests: ReturnType<typeof fitnessTest>[]) =>
  jest.mocked(useFitnessTests).mockReturnValue(fitnessTestsHook(tests));

// The latest test is dated 2026-10-01.
const IN_SIX_WEEKS = '2026-11-12';
const BEFORE_SIX_WEEKS = '2026-11-11';
const OVERDUE = '2026-12-01';

beforeEach(() => jest.clearAllMocks());

describe('FitnessRetestPrompt', () => {
  it('offers a retest when the latest test is six weeks old', () => {
    withTests(fitnessTest({ id: 'a' }));
    const onRetest = jest.fn();
    render(<FitnessRetestPrompt today={IN_SIX_WEEKS} onRetest={onRetest} />);
    expect(screen.getByText('Time for a retest')).toBeTruthy();
    expect(screen.getByText(/last fitness test was 6 weeks ago/)).toBeTruthy();
    fireEvent.press(screen.getByTestId('fitness-retest-start'));
    expect(onRetest).toHaveBeenCalled();
  });

  it('stays out of the way before six weeks and without a test', () => {
    withTests(fitnessTest({ id: 'b' }));
    const { rerender } = render(
      <FitnessRetestPrompt today={BEFORE_SIX_WEEKS} onRetest={jest.fn()} />
    );
    expect(screen.queryByTestId('fitness-retest-prompt')).toBeNull();
    withTests();
    rerender(<FitnessRetestPrompt today={OVERDUE} onRetest={jest.fn()} />);
    expect(screen.queryByTestId('fitness-retest-prompt')).toBeNull();
  });

  it('words an old test differently from one in the window', () => {
    withTests(fitnessTest({ id: 'c' }));
    render(<FitnessRetestPrompt today={OVERDUE} onRetest={jest.fn()} />);
    expect(screen.getByText('Your paces may be out of date')).toBeTruthy();
  });

  it('can be put off until the app is next opened', () => {
    withTests(fitnessTest({ id: 'd' }));
    render(
      <FitnessRetestPrompt
        today={IN_SIX_WEEKS}
        onRetest={jest.fn()}
        dismissible
      />
    );
    fireEvent.press(screen.getByTestId('fitness-retest-later'));
    expect(screen.queryByTestId('fitness-retest-prompt')).toBeNull();
  });

  it('has no Later button where it is not dismissible', () => {
    withTests(fitnessTest({ id: 'e' }));
    render(<FitnessRetestPrompt today={IN_SIX_WEEKS} onRetest={jest.fn()} />);
    expect(screen.queryByTestId('fitness-retest-later')).toBeNull();
  });
});

describe('FitnessRetestPrompt surface', () => {
  it('says the retest starts outdoors after an outdoor test', () => {
    withTests(fitnessTest({ id: 's1' }));
    render(<FitnessRetestPrompt today={IN_SIX_WEEKS} onRetest={jest.fn()} />);
    expect(screen.getByTestId('fitness-retest-surface').props.children).toBe(
      'You tested outdoors last time, so the retest starts outdoors too.'
    );
  });

  it('says the retest starts on a treadmill after a treadmill test', () => {
    withTests(
      fitnessTest({
        id: 's2',
        measurement: {
          type: 'cooper',
          distanceMeters: 3000,
          durationSeconds: 720,
          inclinePercent: 1,
        },
      })
    );
    render(<FitnessRetestPrompt today={IN_SIX_WEEKS} onRetest={jest.fn()} />);
    expect(screen.getByTestId('fitness-retest-surface').props.children).toBe(
      'You tested on a treadmill last time, so the retest starts on a treadmill too.'
    );
  });
});

describe('ProgramRetestPrompt', () => {
  const running = (over = {}) =>
    jest.mocked(useRunProgram).mockReturnValue({
      enabled: true,
      status: { finished: false },
      ...over,
    } as never);

  it('shows with the program on today', () => {
    withTests(fitnessTest({ id: 'f' }));
    running();
    render(
      <ProgramRetestPrompt
        date={IN_SIX_WEEKS}
        today={IN_SIX_WEEKS}
        onRetest={jest.fn()}
      />
    );
    expect(screen.getByTestId('fitness-retest-prompt')).toBeTruthy();
  });

  it('is for today only', () => {
    withTests(fitnessTest({ id: 'g' }));
    running();
    render(
      <ProgramRetestPrompt
        date="2026-11-10"
        today={IN_SIX_WEEKS}
        onRetest={jest.fn()}
      />
    );
    expect(screen.queryByTestId('fitness-retest-prompt')).toBeNull();
  });

  it('needs a program being followed', () => {
    withTests(fitnessTest({ id: 'h' }));
    const props = {
      date: IN_SIX_WEEKS,
      today: IN_SIX_WEEKS,
      onRetest: jest.fn(),
    };
    running({ enabled: false });
    const { rerender } = render(<ProgramRetestPrompt {...props} />);
    expect(screen.queryByTestId('fitness-retest-prompt')).toBeNull();
    running({ status: null });
    rerender(<ProgramRetestPrompt {...props} />);
    expect(screen.queryByTestId('fitness-retest-prompt')).toBeNull();
    running({ status: { finished: true } });
    rerender(<ProgramRetestPrompt {...props} />);
    expect(screen.queryByTestId('fitness-retest-prompt')).toBeNull();
  });
});
