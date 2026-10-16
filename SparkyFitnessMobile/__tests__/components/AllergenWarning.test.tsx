import React from 'react';
import { render } from '@testing-library/react-native';
import AllergenWarning from '../../src/components/AllergenWarning';
import AllergenBadges from '../../src/components/AllergenBadges';

let mockPrefs: { id: string; allergen_name: string }[] | undefined;
jest.mock('../../src/hooks/useAllergenPreferences', () => ({
  useAllergenPreferences: () => ({ preferences: mockPrefs }),
}));
jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View /> };
});

describe('allergen UI', () => {
  beforeEach(() => {
    mockPrefs = [{ id: '1', allergen_name: 'peanuts' }];
  });

  it('warns when a scanned food contains a tracked allergen', () => {
    const { getByTestId, getByText } = render(
      <AllergenWarning allergens={['Peanuts', 'milk']} traces={['soy']} />
    );
    expect(getByTestId('allergen-warning')).toBeTruthy();
    expect(getByText('Peanuts')).toBeTruthy();
    expect(getByText('Contains an allergen you track')).toBeTruthy();
  });

  it('uses the softer title when only traces match', () => {
    const { getByText, queryByText } = render(
      <AllergenWarning allergens={['milk']} traces={['Peanuts']} />
    );
    expect(getByText('May contain an allergen you track')).toBeTruthy();
    expect(queryByText('Contains an allergen you track')).toBeNull();
  });

  it('renders nothing when no tracked allergen matches', () => {
    const { queryByTestId } = render(
      <AllergenWarning allergens={['milk']} traces={['soy']} />
    );
    expect(queryByTestId('allergen-warning')).toBeNull();
  });

  it('renders nothing when the user tracks no allergens', () => {
    mockPrefs = [];
    const { queryByTestId } = render(
      <AllergenBadges allergens={['peanuts']} />
    );
    expect(queryByTestId('allergen-badges')).toBeNull();
  });

  it('shows badges for matching allergens', () => {
    const { getByTestId } = render(<AllergenBadges allergens={['peanuts']} />);
    expect(getByTestId('allergen-badges')).toBeTruthy();
  });
});
