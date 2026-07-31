import React from 'react';
import { render } from '@testing-library/react-native';
import MeasurementsSummary from '../../src/components/MeasurementsSummary';
import FoodLibraryRow from '../../src/components/FoodLibraryRow';
import MealLibraryRow from '../../src/components/MealLibraryRow';
import ExerciseHistoryList from '../../src/components/ExerciseHistoryList';

// Every component's useTranslation() call routes through this shared spy so we
// can assert user/server-entered content (food names, meal names, custom
// category names) is never passed as a translation key. Keys pass through so
// any real t() calls still render their key; the guard is the
// not.toHaveBeenCalledWith(...) assertions below.
const mockT = jest.fn((key: unknown) => key);

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockT, i18n: null, ready: true }),
}));

jest.mock('../../src/hooks', () => ({
  useProfile: jest.fn(() => ({ profile: { id: 'me' } })),
}));

jest.mock('../../src/hooks/useExerciseHistory', () => ({
  useExerciseHistory: jest.fn(() => ({
    sessions: [
      {
        id: 'session-1',
        type: 'preset',
        name: 'Bulgarian Split Squat',
        entry_date: '2024-06-15',
        exercises: [],
      },
    ],
    isLoading: false,
    isLoadingMore: false,
    isError: false,
    refetch: jest.fn(),
    loadMore: jest.fn(),
    hasMore: false,
  })),
}));

jest.mock('../../src/components/Icon', () => 'Icon');
jest.mock('../../src/components/ShareStatusBadge', () => 'ShareStatusBadge');
jest.mock('../../src/components/VerifiedBadge', () => 'VerifiedBadge');

describe('dynamic user/server content is rendered literally, never translated', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders custom measurement category names without passing them to t()', () => {
    const { getByText } = render(
      <MeasurementsSummary
        measurements={{}}
        customMeasurements={[
          {
            id: 'entry-1',
            category_id: 'cat-1',
            value: '120',
            entry_date: '2024-06-15',
            custom_categories: {
              id: 'cat-1',
              name: 'Blood Glucose',
              measurement_type: 'mg/dL',
              frequency: 'Daily',
            },
          },
        ]}
      />,
    );
    expect(getByText('Blood Glucose')).toBeTruthy();
    expect(getByText('120 mg/dL')).toBeTruthy();
    expect(mockT).not.toHaveBeenCalledWith('Blood Glucose');
  });

  it('renders food product names without passing them to t()', () => {
    const { getByText } = render(
      <FoodLibraryRow
        food={{
          id: 'f1',
          user_id: 'me',
          name: 'Chicken Breast',
          brand: 'Tyson',
          is_custom: false,
          shared_with_public: false,
          default_variant: {
            serving_size: 100,
            serving_unit: 'g',
            calories: 165,
            protein: 31,
            carbs: 0,
            fat: 3.6,
          },
        }}
      />,
    );
    expect(getByText('Chicken Breast')).toBeTruthy();
    expect(mockT).not.toHaveBeenCalledWith('Chicken Breast');
  });

  it('renders user-entered meal names without passing them to t()', () => {
    const { getByText } = render(
      <MealLibraryRow
        meal={{
          id: 'm1',
          user_id: 'me',
          name: 'Drugie śniadanie',
          description: '',
          is_public: false,
          serving_size: 1,
          serving_unit: 'serving',
          total_servings: 1,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          foods: [],
        }}
      />,
    );
    expect(getByText('Drugie śniadanie')).toBeTruthy();
    expect(mockT).not.toHaveBeenCalledWith('Drugie śniadanie');
  });

  it('renders server exercise names without passing them to t()', () => {
    const { getByText } = render(
      <ExerciseHistoryList exerciseId="ex-1" weightUnit="kg" />,
    );
    expect(getByText('Bulgarian Split Squat')).toBeTruthy();
    expect(mockT).not.toHaveBeenCalledWith('Bulgarian Split Squat');
  });
});
