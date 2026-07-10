import { fireEvent, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { renderWithClient } from '../test-utils';
import HuaweiHealthSettings from '@/pages/Settings/HuaweiHealthSettings';
import type { HuaweiHealthStatus } from '@/api/Integrations/huaweiHealth';

const mockConnect = jest.fn();
const mockSync = jest.fn();
const mockDisconnect = jest.fn();
let mockUser = {
  id: 'owner-1',
  activeUserId: 'owner-1',
  email: 'owner@example.com',
};
let mockStatus: {
  data: HuaweiHealthStatus;
  isLoading: boolean;
  isError: boolean;
} = {
  data: {
    available: true,
    connected: false,
    isActive: false,
    lastSyncAt: null,
    tokenExpiresAt: null,
    grantedScopes: [] as string[],
  },
  isLoading: false,
  isError: false,
};
let mockSyncResult: unknown;

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      _key: string,
      fallbackOrOptions?: string | Record<string, unknown>,
      interpolation?: Record<string, unknown>
    ) => {
      const fallback =
        typeof fallbackOrOptions === 'string'
          ? fallbackOrOptions
          : (fallbackOrOptions?.['defaultValue'] as string | undefined) || _key;
      const values =
        typeof fallbackOrOptions === 'object'
          ? fallbackOrOptions
          : interpolation || {};
      return Object.entries(values).reduce(
        (text, [key, value]) => text.replaceAll(`{{${key}}}`, String(value)),
        fallback
      );
    },
    i18n: { language: 'en' },
  }),
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUser }),
}));

jest.mock('@/hooks/Integrations/useHuaweiHealth', () => ({
  useHuaweiHealthStatus: (enabled: boolean) => ({
    ...mockStatus,
    enabled,
  }),
  useConnectHuaweiHealthMutation: () => ({
    mutateAsync: mockConnect,
    isPending: false,
  }),
  useSyncHuaweiHealthMutation: () => ({
    mutateAsync: mockSync,
    isPending: false,
    data: mockSyncResult,
  }),
  useDisconnectHuaweiHealthMutation: () => ({
    mutateAsync: mockDisconnect,
    isPending: false,
  }),
}));

describe('HuaweiHealthSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = {
      id: 'owner-1',
      activeUserId: 'owner-1',
      email: 'owner@example.com',
    };
    mockStatus = {
      data: {
        available: true,
        connected: false,
        isActive: false,
        lastSyncAt: null,
        tokenExpiresAt: null,
        grantedScopes: [],
      },
      isLoading: false,
      isError: false,
    };
    mockSyncResult = undefined;
  });

  it('explains the cloud flow and lets the profile owner connect', () => {
    renderWithClient(<HuaweiHealthSettings />);

    expect(screen.getByText('HUAWEI Health')).toBeInTheDocument();
    expect(
      screen.getByText(/your watch first syncs with the HUAWEI Health app/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/steps, calories burned, distance/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Connect account' })
    ).toBeEnabled();
  });

  it('keeps health linking owner-only while a family profile is active', () => {
    mockUser = {
      id: 'owner-1',
      activeUserId: 'family-2',
      email: 'owner@example.com',
    };

    renderWithClient(<HuaweiHealthSettings />);

    expect(
      screen.getByText('Only the account owner can link this service')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Connect account' })
    ).not.toBeInTheDocument();
  });

  it('shows a safe disabled state when instance credentials are absent', () => {
    mockStatus.data.available = false;

    renderWithClient(<HuaweiHealthSettings />);

    expect(
      screen.getByText('This server has not configured the integration')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Connect account' })
    ).toBeDisabled();
  });

  it('shows connected actions and warns without blocking partial consent', () => {
    mockStatus.data = {
      available: true,
      connected: true,
      isActive: true,
      lastSyncAt: '2026-07-10T12:00:00.000Z',
      tokenExpiresAt: '2026-07-10T13:00:00.000Z',
      grantedScopes: ['https://www.huawei.com/healthkit/step.read'],
    };

    renderWithClient(<HuaweiHealthSettings />);

    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.getByText('Some data is not authorized')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sync now' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeEnabled();
  });

  it('requires explicit confirmation before disconnecting', async () => {
    mockStatus.data.connected = true;
    mockStatus.data.isActive = true;
    mockDisconnect.mockResolvedValue({ connected: false });

    renderWithClient(<HuaweiHealthSettings />);
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm disconnect' }));

    await waitFor(() => expect(mockDisconnect).toHaveBeenCalledTimes(1));
  });
});
