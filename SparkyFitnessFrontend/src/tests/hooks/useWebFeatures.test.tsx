import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SharedCycleSettings } from '@workspace/shared';
import { cycleKeys } from '@/hooks/useCycle';
import {
  useCycleSwitch,
  useWebFeatures,
} from '@/hooks/Settings/useWebFeatures';
import { getSettings, putSettings } from '@/api/Cycle/cycleService';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);

jest.mock('@/api/Cycle/cycleService', () => ({
  getSettings: jest.fn(),
  putSettings: jest.fn(),
}));

let mockActingOnBehalf = false;
jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({ isActingOnBehalf: mockActingOnBehalf }),
}));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

const getMock = getSettings as jest.Mock;
const putMock = putSettings as jest.Mock;

const cycleRow = (
  overrides: Partial<SharedCycleSettings> = {}
): SharedCycleSettings => ({
  enabled: true,
  mode: 'standard',
  luteal_phase_length: 14,
  birth_control_method: 'none',
  conditions: [],
  show_fertile_window: true,
  preferred_products: [],
  dismissed_prompts: [],
  terminology: 'default',
  discreet_mode: false,
  onboarded_at: '2026-10-01T00:00:00.000Z',
  ...overrides,
});

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const rendered = renderHook(
    () => ({ features: useWebFeatures(), cycle: useCycleSwitch() }),
    { wrapper }
  );
  return { ...rendered, client };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('useWebFeatures', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockActingOnBehalf = false;
  });

  it.each([
    ['on', cycleRow(), true],
    ['turned off', cycleRow({ enabled: false }), false],
    ['never set up (no row)', null, false],
  ])('cycle is %s', async (_label, row, expected) => {
    getMock.mockResolvedValue(row);
    const { result } = setup();
    await waitFor(() => expect(result.current.cycle.state).toBe('ready'));
    expect(result.current.features.isEnabled('cycle')).toBe(expected);
    expect(result.current.cycle.on).toBe(expected);
    expect(result.current.cycle.needsSetup).toBe(false);
  });

  it('stays usable when a later refetch fails, with what loaded', async () => {
    getMock.mockResolvedValueOnce(cycleRow());
    const { result, client } = setup();
    await waitFor(() => expect(result.current.cycle.state).toBe('ready'));

    getMock.mockRejectedValueOnce(new Error('offline'));
    await act(async () => {
      await client.refetchQueries({ queryKey: cycleKeys.settings() });
      // Lets the observers hear about the failed refetch.
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(client.getQueryState(cycleKeys.settings())?.status).toBe('error');
    expect(result.current.cycle.state).toBe('ready');
    expect(result.current.cycle.on).toBe(true);
  });

  it('keeps cycle off while its settings load or after they fail', async () => {
    const pending = deferred<SharedCycleSettings>();
    getMock.mockReturnValueOnce(pending.promise);
    const { result } = setup();
    expect(result.current.cycle.state).toBe('loading');
    expect(result.current.features.isEnabled('cycle')).toBe(false);

    act(() => result.current.cycle.setOn(true));
    expect(putMock).not.toHaveBeenCalled();

    await act(async () => {
      pending.resolve(cycleRow());
    });
    await waitFor(() => expect(result.current.cycle.on).toBe(true));
  });

  it('cannot be changed after a failed load, only retried', async () => {
    getMock.mockRejectedValueOnce(new Error('offline'));
    const { result } = setup();
    await waitFor(() => expect(result.current.cycle.state).toBe('loadFailed'));
    act(() => result.current.cycle.setOn(true));
    expect(putMock).not.toHaveBeenCalled();

    getMock.mockResolvedValueOnce(cycleRow({ enabled: false }));
    act(() => result.current.cycle.reload());
    await waitFor(() => expect(result.current.cycle.state).toBe('ready'));
  });

  it('cannot be changed while acting for someone else', async () => {
    mockActingOnBehalf = true;
    getMock.mockResolvedValue(null);
    const { result } = setup();
    await waitFor(() => expect(getMock).toHaveBeenCalled());
    expect(result.current.cycle.state).toBe('actingOnBehalf');
    act(() => result.current.cycle.setOn(true));
    expect(putMock).not.toHaveBeenCalled();
  });
});

describe('useCycleSwitch', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockActingOnBehalf = false;
  });

  it('turns cycle on without marking it set up, and opens the setup the first time', async () => {
    getMock.mockResolvedValue(null);
    putMock.mockResolvedValue(cycleRow({ onboarded_at: null }));
    const { result } = setup();
    await waitFor(() => expect(result.current.cycle.state).toBe('ready'));

    act(() => result.current.cycle.setOn(true));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/cycle'));
    expect(putMock).toHaveBeenCalledTimes(1);
    expect(putMock).toHaveBeenCalledWith({ enabled: true });
  });

  it('brings cycle back without the setup once it was set up', async () => {
    getMock
      .mockResolvedValueOnce(cycleRow({ enabled: false }))
      .mockResolvedValue(cycleRow());
    putMock.mockResolvedValue(cycleRow());
    const { result } = setup();
    await waitFor(() => expect(result.current.cycle.state).toBe('ready'));
    expect(result.current.cycle.on).toBe(false);

    act(() => result.current.cycle.setOn(true));

    await waitFor(() => expect(result.current.cycle.on).toBe(true));
    expect(putMock).toHaveBeenCalledWith({ enabled: true });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('turns cycle off with only `enabled`', async () => {
    getMock.mockResolvedValue(cycleRow());
    putMock.mockResolvedValue(cycleRow({ enabled: false }));
    const { result } = setup();
    await waitFor(() => expect(result.current.cycle.on).toBe(true));

    act(() => result.current.cycle.setOn(false));

    await waitFor(() =>
      expect(putMock).toHaveBeenCalledWith({ enabled: false })
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('offers the setup while cycle is on but was never set up', async () => {
    getMock.mockResolvedValue(cycleRow({ onboarded_at: null }));
    const { result } = setup();
    await waitFor(() => expect(result.current.cycle.state).toBe('ready'));
    expect(result.current.cycle.needsSetup).toBe(true);
    act(() => result.current.cycle.openSetup());
    expect(mockNavigate).toHaveBeenCalledWith('/cycle');
  });

  it('ignores an answer that arrives after another account took over', async () => {
    getMock.mockResolvedValue(null);
    const answer = deferred<SharedCycleSettings>();
    putMock.mockReturnValueOnce(answer.promise);
    const { result, client } = setup();
    await waitFor(() => expect(result.current.cycle.state).toBe('ready'));

    act(() => result.current.cycle.setOn(true));
    await waitFor(() => expect(putMock).toHaveBeenCalled());
    // useAuth clears the cache when another account takes over.
    act(() => client.clear());
    await act(async () => {
      answer.resolve(cycleRow({ onboarded_at: null }));
    });

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(
      client.getQueryData<SharedCycleSettings | null>(cycleKeys.settings())
        ?.enabled
    ).toBeUndefined();
  });
});
