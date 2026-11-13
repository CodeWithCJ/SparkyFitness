import i18n from '../../src/localization/i18n';
import translations from '../../src/localization/locales/en/translation.json';
beforeAll(() =>
  i18n.addResourceBundle('en', 'translation', translations, true, true)
);
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fetchChatMcpServers,
  saveChatMcpServers,
} from '../../src/services/api/chatMcpApi';
jest.mock('../../src/services/api/chatMcpApi');
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import AiSettingsScreen from '../../src/screens/AiSettingsScreen';
import { useAppPreferencesStore } from '../../src/stores/appPreferencesStore';

let mockAvailable = true;
jest.mock('../../src/services/onDeviceLabelScan', () => ({
  isOnDeviceLabelScanAvailable: () => mockAvailable,
}));
jest.mock('../../src/hooks/useActiveAiServiceSetting', () => ({
  useActiveAiServiceSetting: () => ({
    data: { service_name: 'OpenAI', model_name: 'gpt-x' },
    isLoading: false,
  }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));
jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
}));
jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: () => false,
}));

const renderScreen = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const result = render(
    <QueryClientProvider client={client}>
      <AiSettingsScreen
        navigation={{} as never}
        route={{ key: 'k', name: 'AiSettings' } as never}
      />
    </QueryClientProvider>
  );
  return { ...result, client };
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(fetchChatMcpServers).mockResolvedValue({ servers: [] });
  mockAvailable = true;
  useAppPreferencesStore.setState({ onDeviceLabelScanEnabled: false });
});

describe('AiSettingsScreen', () => {
  it('shows the active server provider', async () => {
    const { getByTestId, client } = renderScreen();
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(getByTestId('ai-settings-provider').props.children).toBe(
      'OpenAI · gpt-x'
    );
  });

  it('turns on-device label scanning on and off', async () => {
    const { getByTestId, client } = renderScreen();
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(getByTestId('ai-label-scan-switch').props.accessibilityLabel).toBe(
      'Scan Labels On Device'
    );
    fireEvent(getByTestId('ai-label-scan-switch'), 'valueChange', true);
    expect(useAppPreferencesStore.getState().onDeviceLabelScanEnabled).toBe(
      true
    );
    fireEvent(getByTestId('ai-label-scan-switch'), 'valueChange', false);
    expect(useAppPreferencesStore.getState().onDeviceLabelScanEnabled).toBe(
      false
    );
  });

  it('hides the toggle where Apple Intelligence is unavailable', async () => {
    mockAvailable = false;
    const { queryByTestId, getByText, client } = renderScreen();
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(queryByTestId('ai-label-scan-switch')).toBeNull();
    expect(getByText(/Not available on this device/)).toBeTruthy();
  });
});

const outsideServers = [
  { id: 'notes', name: 'Notes', send_user_id: false, enabled: false },
  { id: 'tasks', name: 'Tasks', send_user_id: true, enabled: true },
];
it('hides outside tools when no servers are available', async () => {
  jest.mocked(fetchChatMcpServers).mockResolvedValue({ servers: [] });
  const screen = renderScreen();
  await waitFor(() => expect(screen.client.isFetching()).toBe(0));
  expect(screen.queryByTestId('chat-mcp-servers-section')).toBeNull();
});
it('saves all choices and disables switches while saving', async () => {
  jest
    .mocked(fetchChatMcpServers)
    .mockResolvedValue({ servers: outsideServers });
  let finish!: (value: { servers: typeof outsideServers }) => void;
  jest.mocked(saveChatMcpServers).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const screen = renderScreen();
  const toggle = await screen.findByTestId('chat-mcp-server-switch-notes');
  expect(toggle.props.value).toBe(false);
  fireEvent(toggle, 'valueChange', true);
  await waitFor(() =>
    expect(saveChatMcpServers).toHaveBeenCalledWith(
      ['notes', 'tasks'],
      expect.anything()
    )
  );
  expect(
    screen.getByTestId('chat-mcp-server-switch-notes').props.disabled
  ).toBe(true);
  finish({
    servers: outsideServers.map((server) => ({
      ...server,
      send_user_id: true,
      enabled: true,
    })),
  });
  await waitFor(() =>
    expect(
      screen.getByTestId('chat-mcp-server-switch-notes').props.disabled
    ).toBe(false)
  );
  expect(screen.getByTestId('chat-mcp-server-switch-notes').props.value).toBe(
    true
  );
});
it('reverts outside tool choices on a failed save', async () => {
  jest
    .mocked(fetchChatMcpServers)
    .mockResolvedValue({ servers: outsideServers });
  jest.mocked(saveChatMcpServers).mockRejectedValue(new Error('offline'));
  const screen = renderScreen();
  fireEvent(
    await screen.findByTestId('chat-mcp-server-switch-notes'),
    'valueChange',
    true
  );
  await waitFor(() => expect(saveChatMcpServers).toHaveBeenCalled());
  await waitFor(() =>
    expect(
      screen.getByTestId('chat-mcp-server-switch-notes').props.disabled
    ).toBe(false)
  );
  expect(screen.getByTestId('chat-mcp-server-switch-notes').props.value).toBe(
    false
  );
});

it('shows account ID sharing only when configured by the admin', async () => {
  jest
    .mocked(fetchChatMcpServers)
    .mockResolvedValue({ servers: outsideServers });
  const screen = renderScreen();
  expect(await screen.findAllByText('Sees your account ID.')).toHaveLength(1);
});
it('shows a load failure and retries', async () => {
  jest.mocked(fetchChatMcpServers).mockRejectedValueOnce(new Error('offline'));
  const screen = renderScreen();
  expect(await screen.findByText('Could not load outside tools.')).toBeTruthy();
  fireEvent.press(screen.getByText('Try again'));
  await waitFor(() => expect(fetchChatMcpServers).toHaveBeenCalledTimes(2));
  await waitFor(() =>
    expect(screen.queryByText('Could not load outside tools.')).toBeNull()
  );
});
