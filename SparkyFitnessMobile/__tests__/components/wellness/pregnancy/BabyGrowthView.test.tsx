import React from 'react';
import { render } from '@testing-library/react-native';
import BabyGrowthView from '../../../../src/components/wellness/pregnancy/BabyGrowthView';

const mockUseCycleSettings = jest.fn();
jest.mock('../../../../src/hooks/useCycleSettings', () => ({
  useCycleSettings: () => mockUseCycleSettings(),
}));

jest.mock('../../../../src/components/wellness/pregnancy/WombScene', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="womb-scene" /> };
});

describe('BabyGrowthView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders fruit comparison, length, and weight for standard users (discreetMode = false)', () => {
    mockUseCycleSettings.mockReturnValue({
      settings: { discreet_mode: false },
    });

    const { getByText, getByTestId } = render(<BabyGrowthView week={14} />);

    expect(getByText('Baby this week')).toBeTruthy();
    expect(getByText(/Size of/i)).toBeTruthy();
    expect(getByText(/Length/i)).toBeTruthy();
    expect(getByText(/Weight/i)).toBeTruthy();
    expect(getByTestId('womb-scene')).toBeTruthy();
  });

  it('renders a privacy milestone card for discreet mode users (discreetMode = true)', () => {
    mockUseCycleSettings.mockReturnValue({
      settings: { discreet_mode: true },
    });

    const { getByText, queryByText } = render(<BabyGrowthView week={14} />);

    expect(getByText('Weekly Milestone')).toBeTruthy();
    expect(getByText('Week 14 active tracking.')).toBeTruthy();
    expect(queryByText(/Size of/i)).toBeNull();
  });
});
