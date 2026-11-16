import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import {
  PreferencesProvider,
  usePreferences,
} from '@/contexts/PreferencesContext';

let mockUser = { id: 'owner', activeUserId: 'owner' };
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

// Every save answers only when released, so a test can hold a save in flight.
async function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const state: { saved: Record<string, unknown> } = {
    saved: {
      timezone: 'America/New_York',
      time_format: 'HH:mm',
      date_format: 'yyyy-MM-dd',
      default_weight_unit: 'kg',
      default_measurement_unit: 'cm',
      default_distance_unit: 'km',
      bac_distribution_formula: 'watson',
      bac_elimination_rate: '0.150',
      bac_display_unit: 'permille',
    },
  };
  jest
    .spyOn(client, 'fetchQuery')
    .mockImplementation(async (options) =>
      options.queryKey[0] === 'user' ? { ...state.saved } : []
    );
  const releases: (() => void)[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  mockSave.mockReset();
  mockSave.mockImplementation(async (updates) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise<void>((resolve) => releases.push(resolve));
    state.saved = { ...state.saved, ...updates };
    inFlight -= 1;
    return state.saved;
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>
      <PreferencesProvider>{children}</PreferencesProvider>
    </QueryClientProvider>
  );
  const hook = renderHook(() => usePreferences(), { wrapper });
  await waitFor(() => expect(hook.result.current.timeFormat).toBe('HH:mm'));
  const release = async (index: number) => {
    await waitFor(() => expect(releases).toHaveLength(index + 1));
    await act(async () => {
      releases[index]!();
    });
  };
  return {
    ...hook,
    client,
    state,
    release,
    maxInFlight: () => maxInFlight,
  };
}

afterEach(() => {
  mockUser = { id: 'owner', activeUserId: 'owner' };
});

test('overlapping BAC saves reach the server in order, so the last change is kept', async () => {
  const { result, client, state, release, maxInFlight } = await setup();

  act(() => {
    result.current.setBacDistributionFormula('forrest');
  });
  act(() => {
    result.current.setBacDisplayUnit('percent');
  });

  await release(0);
  await release(1);

  await waitFor(() => expect(result.current.bacDisplayUnit).toBe('percent'));
  expect(maxInFlight()).toBe(1);
  expect(state.saved['bac_display_unit']).toBe('percent');
  expect(state.saved['bac_distribution_formula']).toBe('forrest');
  expect(result.current.bacDistributionFormula).toBe('forrest');
  client.clear();
});

test('two setters before a rerender both reach the server', async () => {
  const { result, client, state, release } = await setup();

  // Both setters come from the same render, so the second one's snapshot
  // would still hold the old formula without the queued edits.
  act(() => {
    result.current.setBacDistributionFormula('forrest');
    result.current.setBacDisplayUnit('percent');
  });

  await release(0);
  // The first save has landed; the unit is still waiting to be written and
  // must not fall back to the server's older value meanwhile.
  expect(result.current.bacDisplayUnit).toBe('percent');
  await release(1);

  await waitFor(() => expect(state.saved['bac_display_unit']).toBe('percent'));
  expect(state.saved['bac_distribution_formula']).toBe('forrest');
  expect(result.current.bacDistributionFormula).toBe('forrest');
  expect(result.current.bacDisplayUnit).toBe('percent');
  client.clear();
});

test('a save queued before another profile takes over is not sent', async () => {
  const { result, rerender, client, release } = await setup();

  act(() => {
    result.current.setBacDistributionFormula('forrest');
  });
  act(() => {
    result.current.setBacDisplayUnit('percent');
  });
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));

  mockUser = { id: 'owner', activeUserId: 'family-member' };
  rerender();
  await release(0);

  // Let the queue run; the second save belonged to the previous profile.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(mockSave).toHaveBeenCalledTimes(1);
  client.clear();
});

test('a reload still waiting when another edit starts does not undo that edit', async () => {
  const { result, client, state, release } = await setup();

  // Hold every reload; each answers with what the server had when it was asked.
  const reloads: (() => void)[] = [];
  jest.spyOn(client, 'fetchQuery').mockImplementation(async (options) => {
    if (options.queryKey[0] !== 'user') return [];
    const snapshot = { ...state.saved };
    await new Promise<void>((resolve) => reloads.push(resolve));
    return snapshot;
  });
  const answerReload = async (index: number) => {
    await waitFor(() => expect(reloads).toHaveLength(index + 1));
    await act(async () => {
      reloads[index]!();
    });
  };

  act(() => {
    result.current.setBacDistributionFormula('forrest');
  });
  await release(0);
  // The first save has landed and its reload is waiting for the server.
  await waitFor(() => expect(reloads).toHaveLength(1));

  act(() => {
    result.current.setBacDisplayUnit('percent');
  });
  expect(result.current.bacDisplayUnit).toBe('percent');

  // The reload answers with the unit the server had before the new edit.
  await answerReload(0);
  expect(result.current.bacDisplayUnit).toBe('percent');

  await release(1);
  await answerReload(1);

  await waitFor(() => expect(state.saved['bac_display_unit']).toBe('percent'));
  expect(state.saved['bac_distribution_formula']).toBe('forrest');
  expect(result.current.bacDisplayUnit).toBe('percent');
  expect(result.current.bacDistributionFormula).toBe('forrest');
  client.clear();
});
