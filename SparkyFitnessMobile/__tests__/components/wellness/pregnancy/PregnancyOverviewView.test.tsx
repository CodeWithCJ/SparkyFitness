import React from 'react';
import { render } from '@testing-library/react-native';
import PregnancyOverviewView from '../../../../src/components/wellness/pregnancy/PregnancyOverviewView';

const mockNavigation = { navigate: jest.fn() };

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

let mockPregnancy: { id: string; status: string; due_date: string } | null = {
  id: 'preg-1',
  status: 'active',
  due_date: '2026-12-01',
};

jest.mock('../../../../src/hooks/usePregnancy', () => ({
  useCurrentPregnancy: () => ({ pregnancy: mockPregnancy, isLoading: false }),
  usePregnancyOverview: () => ({
    overview: { gestation: { week: 20, day: 3 } },
    isLoading: false,
  }),
}));

jest.mock('../../../../src/components/wellness/pregnancy/WeekBanner', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="week-banner" /> };
});
jest.mock('../../../../src/components/wellness/pregnancy/BabyGrowthView', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="baby-growth" /> };
});
jest.mock('../../../../src/components/wellness/pregnancy/WeeklyChecklist', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="weekly-checklist" /> };
});
jest.mock('../../../../src/components/wellness/pregnancy/BumpPhotoJournal', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="bump-photos" /> };
});
jest.mock('../../../../src/components/wellness/pregnancy/FoodMedSafetySearch', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="safety-search" /> };
});

describe('PregnancyOverviewView', () => {
  beforeEach(() => {
    mockPregnancy = { id: 'preg-1', status: 'active', due_date: '2026-12-01' };
  });

  it('renders only weekly content in the overview section', () => {
    const { getByTestId, queryByTestId } = render(<PregnancyOverviewView section="overview" />);
    expect(getByTestId('week-banner')).toBeTruthy();
    expect(getByTestId('baby-growth')).toBeTruthy();
    expect(getByTestId('weekly-checklist')).toBeTruthy();
    expect(queryByTestId('bump-photos')).toBeNull();
    expect(queryByTestId('safety-search')).toBeNull();
  });

  it('renders only interactive cards in the tools section', () => {
    const { getByTestId, queryByTestId } = render(<PregnancyOverviewView section="tools" />);
    expect(getByTestId('bump-photos')).toBeTruthy();
    expect(getByTestId('safety-search')).toBeTruthy();
    expect(queryByTestId('week-banner')).toBeNull();
    expect(queryByTestId('baby-growth')).toBeNull();
    expect(queryByTestId('weekly-checklist')).toBeNull();
  });

  it('shows the setup prompt in both sections when no active pregnancy exists', () => {
    mockPregnancy = null;
    for (const section of ['overview', 'tools'] as const) {
      const { getByText, unmount } = render(<PregnancyOverviewView section={section} />);
      expect(getByText('Set up your pregnancy')).toBeTruthy();
      unmount();
    }
  });
});
