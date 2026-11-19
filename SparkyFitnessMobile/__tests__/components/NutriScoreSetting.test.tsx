import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import NutriScoreSetting from '../../src/components/NutriScoreSetting';
import { usePreferences } from '../../src/hooks/usePreferences';
import { updatePreferences } from '../../src/services/api/preferencesApi';
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
    onSelect,
  }: {
    options: { value: string; label: string }[];
    onSelect: (value: string) => void;
  }) =>
    options.map((option) => (
      <Pressable key={option.value} onPress={() => onSelect(option.value)}>
        <Text>{option.label}</Text>
      </Pressable>
    ));
});

beforeAll(() => initializeI18n());
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(updatePreferences).mockResolvedValue({});
  jest.mocked(usePreferences).mockReturnValue({
    preferences: { nutri_score_enabled: false, front_of_pack_region: 'none' },
    isLoading: false,
    isError: false,
  } as ReturnType<typeof usePreferences>);
});

function setup() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <NutriScoreSetting />
    </QueryClientProvider>
  );
  return client;
}

test('turning the switch on saves nutri_score_enabled', async () => {
  const client = setup();

  fireEvent(screen.getByRole('switch'), 'valueChange', true);

  await waitFor(() =>
    expect(updatePreferences).toHaveBeenCalledWith({
      nutri_score_enabled: true,
    })
  );
  client.clear();
});

test('picking a region saves front_of_pack_region', async () => {
  const client = setup();

  fireEvent.press(screen.getByText('Brazil (ANVISA)'));

  await waitFor(() =>
    expect(updatePreferences).toHaveBeenCalledWith({
      front_of_pack_region: 'brazil',
    })
  );
  client.clear();
});
