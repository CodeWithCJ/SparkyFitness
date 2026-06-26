import React from 'react';
import { Platform } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FoodSettingsScreen from '../../src/screens/FoodSettingsScreen';
import * as preferencesApi from '../../src/services/api/preferencesApi';
import { preferencesQueryKey } from '../../src/hooks/queryKeys';

jest.mock('../../src/hooks/useExternalProviders', () => ({
  useExternalProviders: () => ({ providers: [], isLoading: false }),
}));

jest.mock('../../src/components/BottomSheetPicker', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="bottom-sheet-picker" /> };
});

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="icon" /> };
});

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const navigation = { goBack: jest.fn() } as any;
const route = { params: {} } as any;

function renderScreen(initialPrefs: any) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(preferencesQueryKey, initialPrefs);
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <FoodSettingsScreen navigation={navigation} route={route} />
      </QueryClientProvider>,
    ),
  };
}

describe('FoodSettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the renamed "Food Settings" header', () => {
    const { getByText, queryByText } = renderScreen({});
    if (Platform.OS === 'ios') {
      // On iOS the title is provided by the native stack header (configured in
      // App.tsx via createStackScreenOptions), so the inline title is hidden.
      expect(queryByText('Food Settings')).toBeNull();
    } else {
      expect(getByText('Food Settings')).toBeTruthy();
    }
  });

  it('renders the Show Net Carbs toggle row with description', () => {
    const { getByText } = renderScreen({});
    expect(getByText('Show Net Carbs')).toBeTruthy();
    expect(
      getByText(
        /When enabled, carbohydrate summaries display net carbs/i,
      ),
    ).toBeTruthy();
  });

  it('reflects the current preference state on the Switch', () => {
    const { UNSAFE_getAllByType } = renderScreen({ show_net_carbs: true });
    const { Switch } = require('react-native');
    const switches = UNSAFE_getAllByType(Switch);
    // The Show Net Carbs switch is the first switch on the screen.
    expect(switches[0].props.value).toBe(true);
  });

  it('calls updatePreferences when the toggle is flipped', async () => {
    const spy = jest
      .spyOn(preferencesApi, 'updatePreferences')
      .mockResolvedValue({ show_net_carbs: true } as any);
    const { UNSAFE_getAllByType } = renderScreen({ show_net_carbs: false });
    const { Switch } = require('react-native');
    const switches = UNSAFE_getAllByType(Switch);
    fireEvent(switches[0], 'valueChange', true);
    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith({ show_net_carbs: true });
    });
  });
});
