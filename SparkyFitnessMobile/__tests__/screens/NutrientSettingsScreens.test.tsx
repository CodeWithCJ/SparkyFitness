import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import CustomNutrientFormScreen from '../../src/screens/CustomNutrientFormScreen';
import NutrientDisplaySettingsScreen from '../../src/screens/NutrientDisplaySettingsScreen';
import { initializeI18n } from '../../src/localization/i18n';
import {
  createCustomNutrient,
  fetchCustomNutrients,
  updateCustomNutrient,
} from '../../src/services/api/customNutrientsApi';
import {
  fetchNutrientDisplayPreferences,
  resetNutrientDisplayPreference,
  updateNutrientDisplayPreference,
} from '../../src/services/api/preferencesApi';

jest.mock('../../src/hooks/useServerConnection', () => ({
  useServerConnection: () => ({ isConnected: true, isLoading: false }),
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
jest.mock('../../src/components/BottomSheetPicker', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));
jest.mock('../../src/services/api/customNutrientsApi');
jest.mock('../../src/services/api/preferencesApi');

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

const renderWithProviders = (ui: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider initialMetrics={{ frame, insets }}>
        {ui}
      </SafeAreaProvider>
    </QueryClientProvider>
  );
};

beforeAll(async () => {
  await initializeI18n('en');
});

beforeEach(() => {
  jest.clearAllMocks();
  (fetchCustomNutrients as jest.Mock).mockResolvedValue([
    { id: 'cn1', name: 'Magnesium', unit: 'mg', aliases: ['Mg'] },
  ]);
});

describe('CustomNutrientFormScreen', () => {
  test('creates a nutrient from the entered name, unit and aliases', async () => {
    (createCustomNutrient as jest.Mock).mockResolvedValue({});
    const goBack = jest.fn();
    const { getByTestId, getByText } = renderWithProviders(
      <CustomNutrientFormScreen
        {...({ navigation: { goBack }, route: { params: {} } } as never)}
      />
    );

    fireEvent.changeText(getByTestId('custom-nutrient-name'), ' Omega-3 ');
    fireEvent.changeText(getByTestId('custom-nutrient-unit'), 'mg');
    fireEvent.press(getByText('Save'));

    await waitFor(() =>
      expect(createCustomNutrient).toHaveBeenCalledWith({
        name: 'Omega-3',
        unit: 'mg',
        aliases: [],
      })
    );
    await waitFor(() => expect(goBack).toHaveBeenCalled());
  });

  test('does not save when the name or unit is empty', () => {
    const { getByText } = renderWithProviders(
      <CustomNutrientFormScreen
        {...({
          navigation: { goBack: jest.fn() },
          route: { params: {} },
        } as never)}
      />
    );

    fireEvent.press(getByText('Save'));

    expect(createCustomNutrient).not.toHaveBeenCalled();
  });

  test('edits an existing nutrient seeded from its saved values', async () => {
    (updateCustomNutrient as jest.Mock).mockResolvedValue({});
    const { findByDisplayValue, getByTestId, getByText } = renderWithProviders(
      <CustomNutrientFormScreen
        {...({
          navigation: { goBack: jest.fn() },
          route: { params: { nutrientId: 'cn1' } },
        } as never)}
      />
    );

    await findByDisplayValue('Magnesium');
    fireEvent.changeText(getByTestId('custom-nutrient-unit'), 'g');
    fireEvent.press(getByText('Save'));

    await waitFor(() =>
      expect(updateCustomNutrient).toHaveBeenCalledWith('cn1', {
        name: 'Magnesium',
        unit: 'g',
        aliases: ['Mg'],
      })
    );
  });
});

describe('NutrientDisplaySettingsScreen', () => {
  beforeEach(() => {
    (fetchNutrientDisplayPreferences as jest.Mock).mockResolvedValue([
      {
        view_group: 'food_database',
        platform: 'mobile',
        visible_nutrients: ['protein', 'carbs'],
      },
    ]);
    (updateNutrientDisplayPreference as jest.Mock).mockResolvedValue({});
    (resetNutrientDisplayPreference as jest.Mock).mockResolvedValue({});
  });

  test('shows a hidden nutrient by appending it to the visible list', async () => {
    const { findByLabelText } = renderWithProviders(
      <NutrientDisplaySettingsScreen {...({ navigation: {} } as never)} />
    );

    fireEvent(await findByLabelText('Show Fat'), 'valueChange', true);

    await waitFor(() =>
      expect(updateNutrientDisplayPreference).toHaveBeenCalledWith(
        'food_database',
        'mobile',
        ['protein', 'carbs', 'fat']
      )
    );
  });

  test('moves a visible nutrient down', async () => {
    const { findByTestId } = renderWithProviders(
      <NutrientDisplaySettingsScreen {...({ navigation: {} } as never)} />
    );

    fireEvent.press(await findByTestId('move-down-protein'));

    await waitFor(() =>
      expect(updateNutrientDisplayPreference).toHaveBeenCalledWith(
        'food_database',
        'mobile',
        ['carbs', 'protein']
      )
    );
  });

  test('resets the selected view group', async () => {
    const { findByTestId } = renderWithProviders(
      <NutrientDisplaySettingsScreen {...({ navigation: {} } as never)} />
    );

    fireEvent.press(await findByTestId('reset-nutrient-display'));

    await waitFor(() =>
      expect(resetNutrientDisplayPreference).toHaveBeenCalledWith(
        'food_database',
        'mobile'
      )
    );
  });
});
