import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ChatSettingsScreen from '../../src/screens/ChatSettingsScreen';
import { preferencesQueryKey } from '../../src/hooks/queryKeys';
import * as preferencesApi from '../../src/services/api/preferencesApi';
import * as aiApi from '../../src/services/api/aiSettingsApi';
import type { UserPreferences } from '../../src/types/preferences';
import type { RootStackScreenProps } from '../../src/types/navigation';

jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));
jest.mock('../../src/hooks/useVoicePreferencesRefresh', () => ({
  useVoicePreferencesRefresh: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../src/components/Icon', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('../../src/services/api/preferencesApi');
jest.mock('../../src/services/api/aiSettingsApi');

type PickerProps = {
  value: string;
  options: { value: string; label: string }[];
  onSelect: (id: string) => void;
};
let mockPicker: PickerProps | undefined;
jest.mock('../../src/components/BottomSheetPicker', () => ({
  __esModule: true,
  default: (props: PickerProps) => {
    mockPicker = props;
    return null;
  },
}));
const service = {
  id: 'chat-model',
  service_name: 'Chat model',
  service_type: 'google',
  model_name: 'gemini-2.5-flash',
  is_active: true,
  supports_audio_input: true,
};
let saved: UserPreferences;
const update = jest.mocked(preferencesApi.updatePreferences);

function renderScreen(prefs: Partial<UserPreferences> = {}) {
  saved = {
    voice_input_enabled: true,
    active_voice_ai_service_id: null,
    ...prefs,
  } as UserPreferences;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(preferencesQueryKey, saved);
  jest
    .mocked(preferencesApi.fetchPreferences)
    .mockImplementation(async () => saved);
  update.mockImplementation(async (patch) => {
    saved = { ...saved, ...patch };
    return saved;
  });
  const screenProps = {
    navigation: {},
    route: { key: 'chat-settings', name: 'ChatSettings' },
  } as RootStackScreenProps<'ChatSettings'>;
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <ChatSettingsScreen {...screenProps} />
      </QueryClientProvider>
    ),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPicker = undefined;
  jest.mocked(aiApi.fetchVoiceServiceOptions).mockResolvedValue([
    { ...service, id: 'other', service_name: 'Other model' },
    service,
    { ...service, id: 'off', service_name: 'Disabled', is_active: false },
    {
      ...service,
      id: 'text',
      service_name: 'Text',
      supports_audio_input: false,
    },
  ]);
  jest.mocked(aiApi.fetchActiveAiServiceSetting).mockResolvedValue(service);
});

it('defaults to System without inheriting an audio-capable chat provider', async () => {
  const screen = renderScreen();
  await waitFor(() =>
    expect(aiApi.fetchActiveAiServiceSetting).toHaveBeenCalled()
  );
  expect(screen.getByText('System (default)')).toBeTruthy();
  expect(mockPicker).toBeUndefined();
  expect(update).not.toHaveBeenCalled();
});

it('requires an explicit AI model choice and suggests the compatible chat model first', async () => {
  const screen = renderScreen();
  fireEvent.press(screen.getByText('AI transcription'));
  await waitFor(() => expect(mockPicker?.options).toHaveLength(2));
  expect(mockPicker?.value).toBe('');
  expect(mockPicker?.options[0]?.value).toBe('chat-model');
  expect(mockPicker?.options[0]?.label).toContain('Used for chat');
  expect(update).not.toHaveBeenCalled();
  act(() => mockPicker?.onSelect('chat-model'));
  await waitFor(() =>
    expect(update).toHaveBeenCalledWith({
      active_voice_ai_service_id: 'chat-model',
    })
  );
  await waitFor(() =>
    expect(
      screen.queryClient.getQueryData<UserPreferences>(preferencesQueryKey)
        ?.active_voice_ai_service_id
    ).toBe('chat-model')
  );
});

it('saves visibility on the server without erasing the voice model', async () => {
  const screen = renderScreen({ active_voice_ai_service_id: 'chat-model' });
  fireEvent(screen.getByLabelText('Voice input'), 'valueChange', false);
  await waitFor(() =>
    expect(update).toHaveBeenCalledWith({ voice_input_enabled: false })
  );
  await waitFor(() => expect(screen.queryByText('Recognition')).toBeNull());
  expect(saved.active_voice_ai_service_id).toBe('chat-model');
});

it('persists null when switching back to System', async () => {
  const screen = renderScreen({ active_voice_ai_service_id: 'chat-model' });
  fireEvent.press(screen.getByText('System (default)'));
  await waitFor(() =>
    expect(update).toHaveBeenCalledWith({ active_voice_ai_service_id: null })
  );
});
