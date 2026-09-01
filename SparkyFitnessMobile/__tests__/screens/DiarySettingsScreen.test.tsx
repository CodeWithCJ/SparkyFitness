import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import DiarySettingsScreen from '../../src/screens/DiarySettingsScreen';
import { useAppPreferencesStore } from '../../src/stores/appPreferencesStore';
import { initializeI18n } from '../../src/localization/i18n';

jest.mock('../../src/hooks', () => ({
  useServerConnection: jest.fn(() => ({ isConnected: true, isLoading: false })),
  useCustomNutrients: jest.fn(() => ({
    customNutrients: [],
    isLoading: false,
  })),
  useNutrientDisplayPreferences: jest.fn(() => ({
    preferences: [],
    isLoading: false,
  })),
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

jest.mock('uniwind', () => ({
  useCSSVariable: (keys: string | string[]) =>
    Array.isArray(keys) ? keys.map(() => '#111827') : '#111827',
}));

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

const renderScreen = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider initialMetrics={{ frame, insets }}>
        <DiarySettingsScreen {...({ navigation: {}, route: {} } as never)} />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
};

describe('DiarySettingsScreen', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  beforeEach(() => {
    useAppPreferencesStore.setState({ diarySummaryVisible: false });
  });

  test('renders the Diary Summary row with a Switch reflecting the stored preference', () => {
    const { getByText, getByLabelText } = renderScreen();

    expect(getByText('Diary Summary')).toBeTruthy();
    expect(getByLabelText('Diary Summary').props.value).toBe(false);

    useAppPreferencesStore.setState({ diarySummaryVisible: true });
    expect(renderScreen().getByLabelText('Diary Summary').props.value).toBe(
      true
    );
  });

  test('toggling the Diary Summary switch writes the new value to the store', () => {
    const { getByLabelText } = renderScreen();

    fireEvent(getByLabelText('Diary Summary'), 'valueChange', true);

    expect(useAppPreferencesStore.getState().diarySummaryVisible).toBe(true);
  });

  test('the Switch carries an accessibilityLabel equal to its row title', () => {
    const { getByText, getByLabelText } = renderScreen();

    expect(getByText('Diary Summary')).toBeTruthy();
    expect(getByLabelText('Diary Summary')).toBeTruthy();
  });
});
