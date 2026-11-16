import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import {
  PreferencesProvider,
  usePreferences,
} from '@/contexts/PreferencesContext';

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

test('overlapping BAC saves reach the server in order, so the last change is kept', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  let saved: Record<string, unknown> = {
    timezone: 'America/New_York',
    time_format: 'HH:mm',
    date_format: 'yyyy-MM-dd',
    default_weight_unit: 'kg',
    default_measurement_unit: 'cm',
    default_distance_unit: 'km',
    bac_distribution_formula: 'watson',
    bac_elimination_rate: '0.150',
    bac_display_unit: 'permille',
  };
  jest
    .spyOn(client, 'fetchQuery')
    .mockImplementation(async (options) =>
      options.queryKey[0] === 'user' ? { ...saved } : []
    );
  // The first save answers slowly; without ordering the second one would
  // commit first and then be overwritten by the older snapshot.
  const releases: (() => void)[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  mockSave.mockImplementation(async (updates) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise<void>((resolve) => releases.push(resolve));
    saved = { ...saved, ...updates };
    inFlight -= 1;
    return saved;
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>
      <PreferencesProvider>{children}</PreferencesProvider>
    </QueryClientProvider>
  );
  const { result } = renderHook(() => usePreferences(), { wrapper });
  await waitFor(() => expect(result.current.timeFormat).toBe('HH:mm'));

  act(() => {
    result.current.setBacDistributionFormula('forrest');
  });
  act(() => {
    result.current.setBacDisplayUnit('percent');
  });

  await waitFor(() => expect(releases).toHaveLength(1));
  await act(async () => {
    releases[0]!();
  });
  await waitFor(() => expect(releases).toHaveLength(2));
  await act(async () => {
    releases[1]!();
  });

  await waitFor(() => expect(result.current.bacDisplayUnit).toBe('percent'));
  expect(maxInFlight).toBe(1);
  expect(saved['bac_display_unit']).toBe('percent');
  expect(saved['bac_distribution_formula']).toBe('forrest');
  expect(result.current.bacDistributionFormula).toBe('forrest');
  client.clear();
});
