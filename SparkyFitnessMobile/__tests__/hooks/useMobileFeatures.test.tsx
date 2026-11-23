import { act, renderHook, waitFor } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import {
  useCycleSwitch,
  useMobileFeatures,
} from '../../src/hooks/useMobileFeatures';
import { useCycleSettings } from '../../src/hooks/useCycleSettings';
import {
  cycleSettingsQueryKey,
  serverConfigsQueryKey,
} from '../../src/hooks/queryKeys';
import { getSettings, putSettings } from '../../src/services/api/cycleApi';
import type { SharedCycleSettings } from '../../src/types/womensHealth';
import {
  createQueryWrapper,
  createTestQueryClient,
  showServerOnScreen,
  testServer,
  type QueryClient,
} from './queryTestUtils';

jest.mock('../../src/services/api/cycleApi', () => ({
  getSettings: jest.fn(),
  putSettings: jest.fn(),
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate }),
}));

const getMock = jest.mocked(getSettings);
const putMock = jest.mocked(putSettings);

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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

let queryClient: QueryClient;

function setup() {
  return renderHook(
    () => ({ features: useMobileFeatures(), cycle: useCycleSwitch() }),
    { wrapper: createQueryWrapper(queryClient) }
  );
}

beforeEach(() => {
  jest.resetAllMocks();
  queryClient = createTestQueryClient();
  showServerOnScreen(queryClient);
});

afterEach(() => {
  queryClient.clear();
});

describe('useMobileFeatures', () => {
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

  it.each([
    ['turned off on purpose', cycleRow({ enabled: false }), true],
    ['on', cycleRow(), false],
    ['never set up (no row)', null, false],
  ])(
    'hides the reproductive categories only when cycle is %s',
    async (_label, row, hidden) => {
      getMock.mockResolvedValue(row);
      const { result } = setup();
      await waitFor(() => expect(result.current.cycle.state).toBe('ready'));
      const { isExplicitlyOff, hiddenCustomCategories } =
        result.current.features;
      expect(isExplicitlyOff('cycle')).toBe(hidden);
      expect(hiddenCustomCategories.has('menstruation_flow')).toBe(hidden);
      expect(hiddenCustomCategories.has('ovulation_test')).toBe(hidden);
    }
  );

  it('keeps the same hidden set across renders, so lists built from it stay put', async () => {
    getMock.mockResolvedValue(cycleRow({ enabled: false }));
    const { result, rerender } = setup();
    await waitFor(() => expect(result.current.cycle.state).toBe('ready'));
    const first = result.current.features.hiddenCustomCategories;
    rerender({});
    expect(result.current.features.hiddenCustomCategories).toBe(first);
  });

  it('hides nothing and shows nothing while cycle settings load', () => {
    getMock.mockReturnValue(new Promise(() => {}));
    const { result } = setup();
    expect(result.current.cycle.state).toBe('loading');
    expect(result.current.features.isEnabled('cycle')).toBe(false);
    expect(result.current.features.isExplicitlyOff('cycle')).toBe(false);
    expect(result.current.features.hiddenCustomCategories.size).toBe(0);
  });

  it('stays usable when a later refetch fails, with what loaded', async () => {
    getMock.mockResolvedValueOnce(cycleRow());
    const { result } = setup();
    await waitFor(() => expect(result.current.cycle.state).toBe('ready'));

    getMock.mockRejectedValueOnce(new Error('offline'));
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: cycleSettingsQueryKey });
    });

    expect(queryClient.getQueryState(cycleSettingsQueryKey)?.status).toBe(
      'error'
    );
    expect(result.current.cycle.state).toBe('ready');
    expect(result.current.cycle.on).toBe(true);
  });
});

describe('useCycleSwitch', () => {
  it('cannot be changed while the settings load', async () => {
    const pending = deferred<SharedCycleSettings | null>();
    getMock.mockReturnValueOnce(pending.promise);
    const { result } = setup();
    expect(result.current.cycle.state).toBe('loading');

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
    expect(result.current.cycle.on).toBe(false);
  });

  it('turns cycle on without marking it set up, and opens the setup the first time', async () => {
    getMock.mockResolvedValue(null);
    putMock.mockResolvedValue(cycleRow({ onboarded_at: null }));
    const { result } = setup();
    await waitFor(() => expect(result.current.cycle.state).toBe('ready'));

    act(() => result.current.cycle.setOn(true));

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('CycleOnboarding')
    );
    expect(putMock).toHaveBeenCalledTimes(1);
    expect(putMock).toHaveBeenCalledWith({ enabled: true }, testServer);
  });

  it('brings cycle back without the setup once it was set up', async () => {
    getMock.mockResolvedValue(cycleRow({ enabled: false }));
    putMock.mockResolvedValue(cycleRow());
    const { result } = setup();
    await waitFor(() => expect(result.current.cycle.state).toBe('ready'));
    expect(result.current.cycle.on).toBe(false);

    act(() => result.current.cycle.setOn(true));

    await waitFor(() => expect(result.current.cycle.on).toBe(true));
    expect(putMock).toHaveBeenCalledWith({ enabled: true }, testServer);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('turns cycle off with only `enabled`', async () => {
    getMock.mockResolvedValue(cycleRow());
    putMock.mockResolvedValue(cycleRow({ enabled: false }));
    const { result } = setup();
    await waitFor(() => expect(result.current.cycle.on).toBe(true));

    act(() => result.current.cycle.setOn(false));

    await waitFor(() => expect(result.current.cycle.on).toBe(false));
    expect(putMock).toHaveBeenCalledWith({ enabled: false }, testServer);
    expect(result.current.features.isExplicitlyOff('cycle')).toBe(true);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('says so when the change could not be saved', async () => {
    getMock.mockResolvedValue(cycleRow());
    putMock.mockRejectedValueOnce(new Error('offline'));
    const { result } = setup();
    await waitFor(() => expect(result.current.cycle.state).toBe('ready'));

    act(() => result.current.cycle.setOn(false));

    await waitFor(() =>
      expect(jest.mocked(Toast.show)).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error' })
      )
    );
    expect(result.current.cycle.on).toBe(true);
  });

  it('offers the setup while cycle is on but was never set up', async () => {
    getMock.mockResolvedValue(cycleRow({ onboarded_at: null }));
    const { result } = setup();
    await waitFor(() => expect(result.current.cycle.state).toBe('ready'));
    expect(result.current.cycle.needsSetup).toBe(true);
    act(() => result.current.cycle.openSetup());
    expect(mockNavigate).toHaveBeenCalledWith('CycleOnboarding');
  });

  it('ignores an answer that arrives after another account took over', async () => {
    getMock.mockResolvedValue(null);
    const answer = deferred<SharedCycleSettings>();
    putMock.mockReturnValueOnce(answer.promise);
    const { result } = setup();
    await waitFor(() => expect(result.current.cycle.state).toBe('ready'));

    act(() => result.current.cycle.setOn(true));
    await waitFor(() => expect(putMock).toHaveBeenCalled());
    // useAuth clears the cache when another account or server takes over.
    act(() => queryClient.clear());
    await act(async () => {
      answer.resolve(cycleRow({ onboarded_at: null }));
    });

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(
      queryClient.getQueryData<SharedCycleSettings | null>(
        cycleSettingsQueryKey
      )?.enabled
    ).toBeUndefined();
  });
});

describe('useCycleSettings saves', () => {
  function setupSave() {
    queryClient.setQueryData(
      cycleSettingsQueryKey,
      cycleRow({ mode: 'standard' })
    );
    return renderHook(() => useCycleSettings(), {
      wrapper: createQueryWrapper(queryClient),
    });
  }

  it('shows a save for the account still on screen', async () => {
    getMock.mockResolvedValue(cycleRow({ mode: 'ttc' }));
    putMock.mockResolvedValue(cycleRow({ mode: 'ttc' }));
    const { result } = setupSave();

    act(() => result.current.updateSettings({ mode: 'ttc' }));

    await waitFor(() =>
      expect(
        queryClient.getQueryData<SharedCycleSettings>(cycleSettingsQueryKey)
          ?.mode
      ).toBe('ttc')
    );
  });

  it("doesn't show a save that answers after another account took over", async () => {
    getMock.mockReturnValue(new Promise(() => {}));
    const answer = deferred<SharedCycleSettings>();
    putMock.mockReturnValueOnce(answer.promise);
    const { result, unmount } = setupSave();

    act(() => result.current.updateSettings({ mode: 'ttc' }));
    await waitFor(() => expect(putMock).toHaveBeenCalled());
    // useAuth clears the cache when another account or server takes over.
    unmount();
    act(() => queryClient.clear());
    await act(async () => {
      answer.resolve(cycleRow({ mode: 'ttc' }));
    });

    expect(queryClient.getQueryData(cycleSettingsQueryKey)).toBeUndefined();
  });

  it('keeps the switch as saved when a read from before it answers late', async () => {
    getMock.mockResolvedValueOnce(cycleRow());
    const { result } = setup();
    await waitFor(() => expect(result.current.cycle.state).toBe('ready'));

    // A refresh is already on its way, with the value from before the change.
    const oldRead = deferred<SharedCycleSettings | null>();
    getMock.mockReturnValueOnce(oldRead.promise);
    void queryClient.refetchQueries({ queryKey: cycleSettingsQueryKey });
    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(2));

    putMock.mockResolvedValueOnce(cycleRow({ enabled: false }));
    act(() => result.current.cycle.setOn(false));
    await waitFor(() => expect(result.current.cycle.on).toBe(false));

    await act(async () => {
      oldRead.resolve(cycleRow());
    });
    await waitFor(() =>
      expect(
        queryClient.getQueryState(cycleSettingsQueryKey)?.fetchStatus
      ).toBe('idle')
    );
    expect(result.current.cycle.on).toBe(false);
  });

  it('undoes only its own field when a save fails after the switch saved', async () => {
    getMock.mockResolvedValue(cycleRow({ mode: 'standard' }));
    const switched = deferred<SharedCycleSettings>();
    putMock
      .mockReturnValueOnce(switched.promise)
      .mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(
      () => ({ cycle: useCycleSwitch(), edit: useCycleSettings() }),
      { wrapper: createQueryWrapper(queryClient) }
    );
    await waitFor(() => expect(result.current.cycle.state).toBe('ready'));

    // Off, and while that saves, a field edited on another screen.
    act(() => result.current.cycle.setOn(false));
    await waitFor(() => expect(putMock).toHaveBeenCalledTimes(1));
    act(() => result.current.edit.updateSettings({ mode: 'ttc' }));
    // The edit has kept its copy of the settings from before the switch.
    await waitFor(() =>
      expect(
        queryClient.getQueryData<SharedCycleSettings>(cycleSettingsQueryKey)
          ?.mode
      ).toBe('ttc')
    );
    await act(async () => {
      switched.resolve(cycleRow({ enabled: false, mode: 'standard' }));
    });
    await waitFor(() => expect(putMock).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(jest.mocked(Toast.show)).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error' })
      )
    );

    const cached = queryClient.getQueryData<SharedCycleSettings>(
      cycleSettingsQueryKey
    );
    expect(cached?.enabled).toBe(false);
    expect(cached?.mode).toBe('standard');
  });

  it('sends each save to the server it was made on, even if another one is active by then', async () => {
    getMock.mockResolvedValue(cycleRow());
    const first = deferred<SharedCycleSettings>();
    putMock
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(cycleRow({ enabled: false, mode: 'ttc' }))
      .mockResolvedValueOnce(cycleRow({ enabled: false, mode: 'ttc' }));
    const { result } = renderHook(
      () => ({ cycle: useCycleSwitch(), edit: useCycleSettings() }),
      { wrapper: createQueryWrapper(queryClient) }
    );
    await waitFor(() => expect(result.current.cycle.state).toBe('ready'));

    // A field edit, then the switch and another edit queued behind it.
    act(() => result.current.edit.updateSettings({ mode: 'ttc' }));
    await waitFor(() => expect(putMock).toHaveBeenCalledTimes(1));
    act(() => result.current.cycle.setOn(false));
    act(() => result.current.edit.updateSettings({ luteal_phase_length: 13 }));

    // A server switch stores the new active server before the cache is
    // cleared; the queued saves still belong to the first one.
    showServerOnScreen(queryClient, {
      ...testServer,
      id: 'server-b',
      url: 'https://b.example.com',
    });
    await act(async () => {
      first.resolve(cycleRow({ mode: 'ttc' }));
    });
    await waitFor(() => expect(putMock).toHaveBeenCalledTimes(3));
    expect(putMock.mock.calls.map(([, server]) => server.id)).toEqual([
      'server-a',
      'server-a',
      'server-a',
    ]);
  });

  it('saves nothing, and says so, when the server on screen is not known', async () => {
    getMock.mockResolvedValue(cycleRow());
    const { result } = renderHook(
      () => ({ cycle: useCycleSwitch(), edit: useCycleSettings() }),
      { wrapper: createQueryWrapper(queryClient) }
    );
    await waitFor(() => expect(result.current.cycle.state).toBe('ready'));

    queryClient.removeQueries({ queryKey: serverConfigsQueryKey });
    act(() => result.current.cycle.setOn(false));
    act(() => result.current.edit.updateSettings({ mode: 'ttc' }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(putMock).not.toHaveBeenCalled();
    expect(jest.mocked(Toast.show)).toHaveBeenCalledTimes(2);
    expect(result.current.cycle.on).toBe(true);
    expect(
      queryClient.getQueryData<SharedCycleSettings>(cycleSettingsQueryKey)?.mode
    ).toBe('standard');
  });

  it('runs one save at a time, so a quick off and on land in order', async () => {
    getMock.mockResolvedValue(cycleRow());
    const first = deferred<SharedCycleSettings>();
    putMock
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(cycleRow({ enabled: true }));
    const { result } = setup();
    await waitFor(() => expect(result.current.cycle.state).toBe('ready'));

    act(() => result.current.cycle.setOn(false));
    act(() => result.current.cycle.setOn(true));
    await waitFor(() => expect(putMock).toHaveBeenCalledTimes(1));

    await act(async () => {
      first.resolve(cycleRow({ enabled: false }));
    });
    await waitFor(() => expect(putMock).toHaveBeenCalledTimes(2));
    expect(putMock.mock.calls.map(([body]) => body)).toEqual([
      { enabled: false },
      { enabled: true },
    ]);
    await waitFor(() => expect(result.current.cycle.on).toBe(true));
  });
});
