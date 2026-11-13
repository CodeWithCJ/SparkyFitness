import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import {
  PreferencesProvider,
  usePreferences,
} from '@/contexts/PreferencesContext';
import { SUPPORTED_DATE_FORMATS } from '@workspace/shared';

const mockUser = { id: 'owner' };
const mockSave = jest.fn();
const mockWater = jest.fn();
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUser, loading: false }),
}));
jest.mock('@/hooks/Settings/usePreferences', () => ({
  preferencesOptions: {
    user: () => ({ queryKey: ['user'] }),
    nutrients: () => ({ queryKey: ['nutrients'] }),
  },
  useUpdatePreferencesMutation: () => ({ mutateAsync: mockSave }),
}));
jest.mock('@/hooks/Settings/useWaterContainers', () => ({
  useCreateWaterContainerMutation: () => ({ mutateAsync: mockWater }),
  useSetPrimaryWaterContainerMutation: () => ({ mutateAsync: mockWater }),
}));

function setup(initialDateFormat = 'dd.MM.yyyy') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  let saved = {
    default_glucose_unit: 'mmol/L',
    timezone: 'UTC',
    time_format: 'HH:mm',
    date_format: initialDateFormat,
    default_weight_unit: 'kg',
    default_measurement_unit: 'cm',
    default_distance_unit: 'km',
  };
  jest
    .spyOn(client, 'fetchQuery')
    .mockImplementation(async (options) =>
      options.queryKey[0] === 'user' ? saved : []
    );
  mockSave.mockImplementation(async (updates) => {
    saved = { ...saved, ...updates };
    return saved;
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>
      <PreferencesProvider>{children}</PreferencesProvider>
    </QueryClientProvider>
  );
  return { client, wrapper };
}

describe('DateFormatPreferences', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  it('includes dd.MM.yyyy in SUPPORTED_DATE_FORMATS', () => {
    expect(SUPPORTED_DATE_FORMATS).toContain('dd.MM.yyyy');
  });

  it('formats dates as DD.MM.YYYY when dateFormat is dd.MM.yyyy', async () => {
    const { wrapper } = setup('dd.MM.yyyy');
    const { result } = renderHook(() => usePreferences(), { wrapper });

    await waitFor(() => {
      expect(result.current.dateFormat).toBe('dd.MM.yyyy');
    });

    const formatted = result.current.formatDate('2024-12-25');
    expect(formatted).toBe('25.12.2024');
  });

  it('normalizes uppercase DD.MM.YYYY from backend to dd.MM.yyyy', async () => {
    const { wrapper } = setup('DD.MM.YYYY');
    const { result } = renderHook(() => usePreferences(), { wrapper });

    await waitFor(() => {
      expect(result.current.dateFormat).toBe('dd.MM.yyyy');
    });

    const formatted = result.current.formatDate('2026-03-09');
    expect(formatted).toBe('09.03.2026');
  });

  it('persists dd.MM.yyyy when dateFormat is updated', async () => {
    const { wrapper } = setup('MM/dd/yyyy');
    const { result } = renderHook(() => usePreferences(), { wrapper });

    await waitFor(() => {
      expect(result.current.dateFormat).toBe('MM/dd/yyyy');
    });

    await act(async () => {
      await result.current.saveAllPreferences({ dateFormat: 'dd.MM.yyyy' });
    });

    await waitFor(() => {
      expect(result.current.dateFormat).toBe('dd.MM.yyyy');
    });

    expect(result.current.formatDate('2025-07-04')).toBe('04.07.2025');
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({ date_format: 'dd.MM.yyyy' })
    );
  });
});
