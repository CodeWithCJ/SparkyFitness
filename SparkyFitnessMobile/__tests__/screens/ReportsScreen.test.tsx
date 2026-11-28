import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import ReportsScreen from '../../src/screens/ReportsScreen';
import { initializeI18n } from '../../src/localization/i18n';
import {
  useAppPreferencesStore,
  __resetAppPreferencesStoreForTests,
} from '../../src/stores/appPreferencesStore';
import type { RootStackScreenProps } from '../../src/types/navigation';

let mockFeaturesOff = new Set<string>();
jest.mock('../../src/hooks/useMobileFeatures', () => ({
  useMobileFeatures: () => ({
    isEnabled: (key: string) => !mockFeaturesOff.has(key),
  }),
}));
let mockConnected = true;
jest.mock('../../src/hooks/useServerConnection', () => ({
  useServerConnection: () => ({ isConnected: mockConnected }),
}));
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
    mockFeaturesOff = new Set();
    mockConnected = true;
  });

  it.each([
    ['nutrition', 'NutritionReport'],
    ['hydration', 'HydrationReport'],
    ['substances', 'SubstancesReport'],
    ['sleep', 'SleepAnalytics'],
    ['measurements', 'MeasurementsReport'],
    ['mood', 'MoodReport'],
    ['exercise', 'ExerciseStatistics'],
    ['heartRate', 'HeartRateReport'],
    ['oralCare', 'OralCareReport'],
    ['compare', 'CompareReport'],
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
      'heartRate',
      'oralCare',
      'compare',
    ]);
    expect(queryByTestId('reports-link-sleep')).toBeNull();
  });

  it('still lists Compare when the saved order predates it', () => {
    useAppPreferencesStore.setState({
      reportOrder: [
        'nutrition',
        'hydration',
        'substances',
        'sleep',
        'measurements',
        'mood',
        'exercise',
      ],
    });
    const { getByTestId } = render(<ReportsScreen {...props} />);
    expect(getByTestId('reports-link-compare')).toBeTruthy();
  });

  it('leaves Oral care off while oral care is turned off, keeping its place', () => {
    mockFeaturesOff = new Set(['oralCare']);
    const { queryByTestId, getByTestId } = render(<ReportsScreen {...props} />);
    expect(queryByTestId('reports-link-oralCare')).toBeNull();
    expect(getByTestId('reports-link-compare')).toBeTruthy();
    // Nothing else is gone, so no notice.
    expect(queryByTestId('features-off-notice')).toBeNull();
    expect(useAppPreferencesStore.getState().hiddenReports).toEqual([]);
  });

  it('says features are off when the only reports left are of features turned off', () => {
    useAppPreferencesStore.setState({
      hiddenReports: [
        'nutrition',
        'hydration',
        'substances',
        'sleep',
        'measurements',
        'mood',
        'exercise',
        'heartRate',
        'compare',
      ],
    });
    mockFeaturesOff = new Set(['oralCare']);
    const { queryAllByTestId, getByTestId, unmount } = render(
      <ReportsScreen {...props} />
    );
    expect(queryAllByTestId(/^reports-link-/)).toHaveLength(0);
    fireEvent.press(getByTestId('features-off-manage'));
    expect(navigate).toHaveBeenCalledWith('FeatureSettings');
    unmount();

    mockConnected = false;
    const offline = render(<ReportsScreen {...props} />);
    expect(offline.getByTestId('features-off-notice')).toBeTruthy();
    expect(offline.queryByTestId('features-off-manage')).toBeNull();
  });
});
