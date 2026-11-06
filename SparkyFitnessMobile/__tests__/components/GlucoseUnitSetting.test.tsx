import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import GlucoseUnitSetting from '../../src/components/GlucoseUnitSetting';
import { usePreferences } from '../../src/hooks/usePreferences';
import { updatePreferences } from '../../src/services/api/preferencesApi';
import { preferencesQueryKey } from '../../src/hooks/queryKeys';
import { initializeI18n } from '../../src/localization/i18n';

jest.mock('../../src/hooks/useServerConnection', () => ({
  useServerConnection: () => ({ isConnected: true }),
}));
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: jest.fn(),
}));
jest.mock('../../src/services/api/preferencesApi', () => ({
  updatePreferences: jest.fn(),
}));
jest.mock('../../src/components/BottomSheetPicker', () => {
  const { Pressable, Text } = require('react-native');
  return ({
    options,
    value,
    onSelect,
  }: {
    value: string;
    options: { value: string; label: string }[];
    onSelect: (value: string) => void;
  }) => [
    <Text key="selected" testID="selected-unit">
      {value}
    </Text>,
    ...options.map((option) => (
      <Pressable key={option.value} onPress={() => onSelect(option.value)}>
        <Text>{option.label}</Text>
      </Pressable>
    )),
  ];
});
beforeAll(() => initializeI18n());
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(usePreferences).mockReturnValue({
    preferences: { default_glucose_unit: 'mmol/L' },
    isLoading: false,
    isError: false,
  } as ReturnType<typeof usePreferences>);
});
function setup() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  render(
    <QueryClientProvider client={client}>
      <GlucoseUnitSetting />
    </QueryClientProvider>
  );
  return { client, invalidate };
}
test('saves the account preference and refreshes charts through the preference cache', async () => {
  jest
    .mocked(updatePreferences)
    .mockResolvedValue({ default_glucose_unit: 'mg/dL' });
  const { client, invalidate } = setup();
  fireEvent.press(screen.getByText('mg/dL'));
  await waitFor(() =>
    expect(updatePreferences).toHaveBeenCalledWith({
      default_glucose_unit: 'mg/dL',
    })
  );
  await waitFor(() =>
    expect(invalidate).toHaveBeenCalledWith({ queryKey: preferencesQueryKey })
  );
  client.clear();
});
test('reports save failures without changing the displayed account preference', async () => {
  jest.mocked(updatePreferences).mockRejectedValue(new Error('offline'));
  const { client } = setup();
  fireEvent.press(screen.getByText('mg/dL'));
  await waitFor(() =>
    expect(Toast.show).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        text1: 'Could not save glucose unit.',
      })
    )
  );
  expect(screen.getByTestId('selected-unit').props.children).toBe('mmol/L');
  client.clear();
});
