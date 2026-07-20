import React from 'react';
import { render } from '@testing-library/react-native';
import PregnancyTodayView from '../../../../src/components/wellness/pregnancy/PregnancyTodayView';

jest.mock('../../../../src/components/Icon', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="icon" /> };
});

const mockUseCurrentPregnancy = jest.fn();
const mockUsePregnancyOverview = jest.fn();
jest.mock('../../../../src/hooks/usePregnancy', () => ({
  useCurrentPregnancy: () => mockUseCurrentPregnancy(),
  usePregnancyOverview: () => mockUsePregnancyOverview(),
}));

// Child cards are exercised by their own test files — stub them here so this
// test stays focused on PregnancyTodayView's own null-guarding logic.
jest.mock('../../../../src/components/wellness/pregnancy/WeekBanner', () => {
  const { Text } = require('react-native');
  return { __esModule: true, default: () => <Text>WeekBanner</Text> };
});
jest.mock('../../../../src/components/wellness/pregnancy/BabyGrowthView', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('../../../../src/components/wellness/pregnancy/VitalsCard', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('../../../../src/components/wellness/pregnancy/WeeklyChecklist', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('../../../../src/components/wellness/pregnancy/KickCounter', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('../../../../src/components/wellness/pregnancy/ContractionTimer', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('../../../../src/components/wellness/pregnancy/BumpPhotoJournal', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('../../../../src/components/wellness/pregnancy/FoodMedSafetySearch', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('../../../../src/components/wellness/pregnancy/AppointmentsCard', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

describe('PregnancyTodayView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('prompts for setup when there is no active pregnancy', () => {
    mockUseCurrentPregnancy.mockReturnValue({ pregnancy: null, isLoading: false });
    mockUsePregnancyOverview.mockReturnValue({ overview: null, isLoading: false });

    const { getByText } = render(<PregnancyTodayView />);
    expect(getByText('Set up your pregnancy')).toBeTruthy();
  });

  it('does not crash when overview is the reduced { pregnancy: null } shape while hasActive is stale-true', () => {
    // Regression test: this exact combination previously threw
    // "Cannot read property 'week' of undefined" because the code assumed a
    // truthy `overview` always carried `gestation`.
    mockUseCurrentPregnancy.mockReturnValue({
      pregnancy: { id: 'p1', due_date: '2026-06-01', status: 'active' },
      isLoading: false,
    });
    mockUsePregnancyOverview.mockReturnValue({ overview: { pregnancy: null }, isLoading: false });

    expect(() => render(<PregnancyTodayView />)).not.toThrow();
  });

  it('renders gestational cards once overview.gestation is present', () => {
    mockUseCurrentPregnancy.mockReturnValue({
      pregnancy: { id: 'p1', due_date: '2026-06-01', status: 'active' },
      isLoading: false,
    });
    mockUsePregnancyOverview.mockReturnValue({
      overview: {
        pregnancy: { id: 'p1', due_date: '2026-06-01', status: 'active' },
        gestation: { week: 12, day: 3, totalDays: 87, trimester: 'first', daysRemaining: 193, progress: 0.31 },
      },
      isLoading: false,
    });

    const { getByText } = render(<PregnancyTodayView />);
    expect(getByText('WeekBanner')).toBeTruthy();
  });
});
