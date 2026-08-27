import React from 'react';
import { Platform } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FoodSettingsScreen from '../../src/screens/FoodSettingsScreen';
import * as preferencesApi from '../../src/services/api/preferencesApi';
import { preferencesQueryKey } from '../../src/hooks/queryKeys';

// Mutable so a test can put the screen in a multi-provider state, the only state
// where the aggregated "All Providers" option is offered.
let mockProviders: { id: string; provider_name: string }[] = [];
jest.mock('../../src/hooks/useExternalProviders', () => ({
  useExternalProviders: () => ({ providers: mockProviders, isLoading: false }),
}));

// Records every picker's props so a test can assert the value the screen
// resolved and drive onSelect, which the plain View stub cannot do.
type CapturedPickerProps = {
  title?: string;
  value: string;
  options: { label: string; value: string }[];
  onSelect: (value: string) => void;
};
const mockPickerProps: CapturedPickerProps[] = [];
jest.mock('../../src/components/BottomSheetPicker', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (props: CapturedPickerProps) => {
      mockPickerProps.push(props);
      return <View testID="bottom-sheet-picker" />;
    },
  };
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

const mockNavigation = { goBack: jest.fn(), setOptions: jest.fn(), navigate: jest.fn() } as any;
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

const navigation = mockNavigation;
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

const foodProviderPicker = () =>
  mockPickerProps.find((p) => p.title === 'Search Provider');

describe('FoodSettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProviders = [];
    mockPickerProps.length = 0;
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

  it('exposes navigation to Meal Types and does not render Suggested Meal Times inline', () => {
    const { getByText, queryByText } = renderScreen({});
    // Navigation entry to the single owner of default_time settings.
    expect(getByText('Meal Types')).toBeTruthy();
    fireEvent.press(getByText('Meal Types'));
    expect(navigation.navigate).toHaveBeenCalledWith('MealTypeSettings');
    // The duplicate editor is gone.
    expect(queryByText('Suggested Meal Times')).toBeNull();
    expect(queryByText(/Set target start times for your meal categories/i)).toBeNull();
  });

  describe('default food provider: "All Providers"', () => {
    const twoProviders = [
      { id: 'prov-usda', provider_name: 'USDA' },
      { id: 'prov-off', provider_name: 'OpenFoodFacts' },
    ];

    it('offers All Providers above one provider', () => {
      mockProviders = twoProviders;
      renderScreen({});
      expect(foodProviderPicker()?.options[0]).toEqual({
        label: 'All Providers',
        value: '__all__',
      });
    });

    it('does not offer All Providers with a single provider', () => {
      mockProviders = [twoProviders[0]];
      renderScreen({});
      expect(
        foodProviderPicker()?.options.map((o: { value: string }) => o.value),
      ).toEqual(['prov-usda']);
    });

    it('shows the sentinel as the selected value when the preference is on', () => {
      mockProviders = twoProviders;
      renderScreen({
        food_search_all_providers_default: true,
        default_food_data_provider_id: 'prov-usda',
      });
      expect(foodProviderPicker()?.value).toBe('__all__');
    });

    it('degrades to the stored provider when only one provider is left', () => {
      // The option is hidden below two providers, so surfacing the sentinel
      // would leave the picker showing its placeholder.
      mockProviders = [twoProviders[0]];
      renderScreen({
        food_search_all_providers_default: true,
        default_food_data_provider_id: 'prov-usda',
      });
      expect(foodProviderPicker()?.value).toBe('prov-usda');
    });

    it('shows the first active provider when the stored one is no longer active', () => {
      // The one remaining provider is not the stored one. Search falls back to
      // the first active provider, so surfacing the placeholder here would
      // contradict the provider the next search actually uses.
      mockProviders = [twoProviders[1]];
      renderScreen({
        food_search_all_providers_default: true,
        default_food_data_provider_id: 'prov-usda',
      });
      expect(foodProviderPicker()?.value).toBe('prov-off');
    });

    it('stays on the placeholder when no default was ever stored', () => {
      // Distinct from the case above: nothing was chosen, so the picker should
      // read "First available" rather than asserting a provider on the user's
      // behalf.
      mockProviders = twoProviders;
      renderScreen({
        food_search_all_providers_default: false,
        default_food_data_provider_id: null,
      });
      expect(foodProviderPicker()?.value).toBe('');
    });

    it('persists the flag without writing the sentinel into the uuid column', async () => {
      // default_food_data_provider_id is a uuid; sending '__all__' would fail
      // the column's input conversion, and keeping the stored provider is what
      // lets turning All Providers back off restore it.
      const spy = jest
        .spyOn(preferencesApi, 'updatePreferences')
        .mockResolvedValue({} as any);
      mockProviders = twoProviders;
      renderScreen({ default_food_data_provider_id: 'prov-usda' });
      foodProviderPicker()?.onSelect('__all__');
      await waitFor(() => {
        expect(spy).toHaveBeenCalledWith({
          food_search_all_providers_default: true,
        });
      });
    });

    it('clears the flag when a real provider is picked', async () => {
      const spy = jest
        .spyOn(preferencesApi, 'updatePreferences')
        .mockResolvedValue({} as any);
      mockProviders = twoProviders;
      renderScreen({ food_search_all_providers_default: true });
      foodProviderPicker()?.onSelect('prov-off');
      await waitFor(() => {
        expect(spy).toHaveBeenCalledWith({
          default_food_data_provider_id: 'prov-off',
          food_search_all_providers_default: false,
        });
      });
    });
  });
});
