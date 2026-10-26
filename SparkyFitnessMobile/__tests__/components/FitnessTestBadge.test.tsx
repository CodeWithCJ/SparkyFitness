import React from 'react';
import { render, screen } from '@testing-library/react-native';
import FitnessTestBadge from '../../src/components/recording/FitnessTestBadge';
import { useFitnessTests } from '../../src/services/fitnessTestService';
import { fitnessTest, fitnessTestsHook } from '../helpers/fitnessTestFixture';

jest.mock('../../src/services/fitnessTestService', () => ({
  useFitnessTests: jest.fn(),
}));

it('marks the activity a test was run as', () => {
  jest
    .mocked(useFitnessTests)
    .mockReturnValue(
      fitnessTestsHook([fitnessTest({ exercise_entry_id: 'entry-1' })])
    );
  render(<FitnessTestBadge entryId="entry-1" unit="km" />);
  expect(screen.getByText('Fitness test')).toBeTruthy();
  expect(screen.getByText('5K time trial: 5K in 25:00')).toBeTruthy();
});

it('says nothing for any other activity', () => {
  jest
    .mocked(useFitnessTests)
    .mockReturnValue(
      fitnessTestsHook([fitnessTest({ exercise_entry_id: 'entry-1' })])
    );
  render(<FitnessTestBadge entryId="entry-2" unit="km" />);
  expect(screen.queryByTestId('fitness-test-badge')).toBeNull();
});

it('does not look for a test without an entry', () => {
  jest.mocked(useFitnessTests).mockReturnValue(fitnessTestsHook([]));
  render(<FitnessTestBadge entryId={undefined} unit="km" />);
  expect(useFitnessTests).toHaveBeenCalledWith(false);
  expect(screen.queryByTestId('fitness-test-badge')).toBeNull();
});
