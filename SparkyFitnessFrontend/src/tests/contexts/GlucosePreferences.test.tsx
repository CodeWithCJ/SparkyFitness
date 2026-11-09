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

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  let saved = {
    default_glucose_unit: 'mmol/L',
    timezone: 'America/New_York',
    time_format: 'HH:mm',
    date_format: 'yyyy-MM-dd',
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
  const hook = renderHook(() => usePreferences(), { wrapper });
  return {
    ...hook,
    client,
    changeOtherSession: () => {
      saved.default_glucose_unit = 'mg/dL';
    },
  };
}

test('unrelated saves preserve another session unit; explicit edits save and establish a new baseline', async () => {
  const { result, client, changeOtherSession } = setup();
  // The provider starts on the machine's own zone, so on a machine in New York
  // the zone alone matches before the saved preferences load. The time
  // format only changes once they have.
  await waitFor(() => {
    expect(result.current.timezone).toBe('America/New_York');
    expect(result.current.timeFormat).toBe('HH:mm');
  });
  changeOtherSession();
  await act(async () => {
    await result.current.saveAllPreferences({ timeFormat: 'HH:mm' });
  });
  expect(mockSave.mock.calls.at(-1)![0]).not.toHaveProperty(
    'default_glucose_unit'
  );
  expect(result.current.glucoseUnit).toBe('mg/dL');
  await act(async () => {
    await result.current.saveAllPreferences({ glucoseUnit: 'mmol/L' });
  });
  expect(mockSave.mock.calls.at(-1)![0]).toHaveProperty(
    'default_glucose_unit',
    'mmol/L'
  );
  await act(async () => {
    await result.current.saveAllPreferences({ timeFormat: 'HH:mm' });
  });
  expect(mockSave.mock.calls.at(-1)![0]).not.toHaveProperty(
    'default_glucose_unit'
  );
  client.clear();
});

test('formats midnight sensor instants in the account zone while preserving calendar date semantics', async () => {
  const { result, client } = setup();
  // The provider starts on the machine's own zone, so on a machine in New York
  // the zone alone matches before the saved preferences load. The time
  // format only changes once they have.
  await waitFor(() => {
    expect(result.current.timezone).toBe('America/New_York');
    expect(result.current.timeFormat).toBe('HH:mm');
  });
  const midnight = new Date('2026-11-04T00:00:00Z');
  expect(result.current.formatTime(midnight, { asInstant: true })).toBe(
    '19:00'
  );
  expect(
    result.current.formatTime(midnight.toISOString(), { asInstant: true })
  ).toBe('19:00');
  expect(
    result.current.formatDateInUserTimezone(midnight, 'MMM d', {
      asInstant: true,
    })
  ).toBe('Nov 3');
  expect(
    result.current.formatDateInUserTimezone('2026-11-04', 'yyyy-MM-dd')
  ).toBe('2026-11-04');
  client.clear();
});
