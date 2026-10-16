import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import ReportsScreen from '../../src/screens/ReportsScreen';
import { initializeI18n } from '../../src/localization/i18n';
import {
  useAppPreferencesStore,
  __resetAppPreferencesStoreForTests,
} from '../../src/stores/appPreferencesStore';
import type { RootStackScreenProps } from '../../src/types/navigation';

jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));
jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: () => false,
}));
jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <View testID={`icon-${name}`} />,
  };
});

beforeAll(async () => {
  await initializeI18n('en');
});

describe('ReportsScreen', () => {
  const navigate = jest.fn();
  const props = {
    navigation: { navigate },
    route: { key: 'Reports', name: 'Reports' },
  } as unknown as RootStackScreenProps<'Reports'>;

  beforeEach(() => {
    navigate.mockClear();
    __resetAppPreferencesStoreForTests();
  });

  it.each([
    ['nutrition', 'NutritionReport'],
    ['hydration', 'HydrationReport'],
    ['substances', 'SubstancesReport'],
    ['sleep', 'SleepAnalytics'],
    ['measurements', 'MeasurementsReport'],
    ['mood', 'MoodReport'],
    ['exercise', 'ExerciseStatistics'],
  ])('opens the %s report', (key, route) => {
    const { getByTestId } = render(<ReportsScreen {...props} />);
    fireEvent.press(getByTestId(`reports-link-${key}`));
    expect(navigate).toHaveBeenCalledWith(route);
  });

  it('lists the reports in the saved order and leaves hidden ones off', () => {
    useAppPreferencesStore.setState({
      reportOrder: ['mood', 'exercise'],
      hiddenReports: ['sleep'],
    });

    const { queryAllByTestId, queryByTestId } = render(
      <ReportsScreen {...props} />
    );

    expect(
      queryAllByTestId(/^reports-link-/).map((link) =>
        String(link.props.testID).replace('reports-link-', '')
      )
    ).toEqual([
      'mood',
      'exercise',
      'nutrition',
      'hydration',
      'substances',
      'measurements',
    ]);
    expect(queryByTestId('reports-link-sleep')).toBeNull();
  });
});
