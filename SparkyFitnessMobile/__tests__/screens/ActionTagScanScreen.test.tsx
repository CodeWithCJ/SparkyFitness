import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import ActionTagScanScreen from '../../src/screens/ActionTagScanScreen';
import { useServerConnection } from '../../src/hooks';
import { scanActionTag } from '../../src/services/api/actionTagsApi';
import { ApiError } from '../../src/services/api/errors';
import { initializeI18n } from '../../src/localization/i18n';
import type { RootStackScreenProps } from '../../src/types/navigation';

jest.mock('../../src/hooks', () => ({ useServerConnection: jest.fn() }));
jest.mock('../../src/services/api/actionTagsApi', () => ({
  scanActionTag: jest.fn(),
}));
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));
jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: () => false,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../src/services/api/measurementsApi', () => ({
  changeWaterIntake: jest.fn(() => Promise.resolve({})),
}));

const CODE = '0123456789abcdef0123456789abcdef';
const tag = {
  id: 'tag-1',
  tag_code: CODE,
  label: 'Stanley',
  action: { type: 'water' as const, container_id: 7, drinks: 1 },
  ask_before_running: false,
  last_run_at: null,
  created_at: '2026-10-30T00:00:00.000Z',
  updated_at: '2026-10-30T00:00:00.000Z',
};

const navigation = {
  goBack: jest.fn(),
  replace: jest.fn(),
  canGoBack: jest.fn(() => true),
};

const renderScreen = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ActionTagScanScreen
        {...({
          navigation,
          route: { params: { code: CODE } },
        } as unknown as RootStackScreenProps<'ActionTagScan'>)}
      />
    </QueryClientProvider>
  );

beforeAll(async () => {
  await initializeI18n();
});
beforeEach(() => {
  jest.clearAllMocks();
  navigation.canGoBack.mockReturnValue(true);
  jest.mocked(useServerConnection).mockReturnValue({
    isConnected: true,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useServerConnection>);
});

describe('ActionTagScanScreen', () => {
  it('logs once, offers Undo and returns to where the person was', async () => {
    jest.mocked(scanActionTag).mockResolvedValue({
      status: 'done',
      tag,
      summary: '1 × Stanley',
    });
    renderScreen();
    await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
    expect(scanActionTag).toHaveBeenCalledTimes(1);
    expect(scanActionTag).toHaveBeenCalledWith(
      expect.objectContaining({ tag_code: CODE })
    );
    expect(Toast.show).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'success',
        text1: 'Logged 1 × Stanley',
        text2: 'Tap to undo',
      })
    );
  });

  it('opens the dashboard when there is nothing to go back to', async () => {
    navigation.canGoBack.mockReturnValue(false);
    jest.mocked(scanActionTag).mockResolvedValue({
      status: 'done',
      tag,
      summary: '1 × Stanley',
    });
    renderScreen();
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith('Tabs', {
        screen: 'Dashboard',
      })
    );
  });

  it('logs nothing for an unknown tag and offers to set it up', async () => {
    jest
      .mocked(scanActionTag)
      .mockResolvedValue({ status: 'unknown_tag', tag: null, summary: null });
    renderScreen();
    fireEvent.press(await screen.findByText('Set up this tag'));
    expect(navigation.replace).toHaveBeenCalledWith('ActionTagForm', {
      tagCode: CODE,
    });
  });

  it('asks first when the tag requires it, then logs on confirm', async () => {
    jest
      .mocked(scanActionTag)
      .mockResolvedValueOnce({
        status: 'needs_confirmation',
        tag,
        summary: null,
      })
      .mockResolvedValueOnce({ status: 'done', tag, summary: '1 × Stanley' });
    renderScreen();
    fireEvent.press(await screen.findByText('Log it'));
    await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
    expect(scanActionTag).toHaveBeenLastCalledWith(
      expect.objectContaining({ confirmed: true })
    );
  });

  it('explains a deleted target and offers to fix the tag', async () => {
    jest
      .mocked(scanActionTag)
      .mockResolvedValue({ status: 'target_missing', tag, summary: null });
    renderScreen();
    fireEvent.press(await screen.findByText('Fix this tag'));
    expect(navigation.replace).toHaveBeenCalledWith('ActionTagForm', {
      tagId: 'tag-1',
    });
  });

  it('tells the person when the server is too old', async () => {
    jest
      .mocked(scanActionTag)
      .mockRejectedValue(new ApiError('Not found', 404));
    renderScreen();
    expect(
      await screen.findByText('Your server does not support NFC tags yet')
    ).toBeTruthy();
  });

  it('does not run before the server is reachable', () => {
    jest.mocked(useServerConnection).mockReturnValue({
      isConnected: false,
      isLoading: true,
      isError: false,
      refetch: jest.fn(),
    } as unknown as ReturnType<typeof useServerConnection>);
    renderScreen();
    expect(scanActionTag).not.toHaveBeenCalled();
  });
});
