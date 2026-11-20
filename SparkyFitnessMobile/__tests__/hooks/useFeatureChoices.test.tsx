import { act, renderHook, waitFor } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import type { FeatureChoicesResponse } from '@workspace/shared';
import {
  useFeatureChoicesQuery,
  useSetMobileFeatureChoice,
} from '../../src/hooks/useFeatureChoices';
import { useMobileFeatures } from '../../src/hooks/useMobileFeatures';
import {
  featureChoicesQueryKey,
  serverConfigsQueryKey,
} from '../../src/hooks/queryKeys';
import {
  fetchFeatureChoices,
  updateFeatureChoices,
} from '../../src/services/api/featureChoicesApi';
import { getSettings } from '../../src/services/api/cycleApi';
import { ApiError } from '../../src/services/api/errors';
import {
  createQueryWrapper,
  createTestQueryClient,
  showServerOnScreen,
  testServer,
  type QueryClient,
} from './queryTestUtils';

jest.mock('../../src/services/api/featureChoicesApi', () => ({
  fetchFeatureChoices: jest.fn(),
  updateFeatureChoices: jest.fn(),
}));

jest.mock('../../src/services/api/cycleApi', () => ({
  getSettings: jest.fn(),
  putSettings: jest.fn(),
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn() }),
}));

const getMock = jest.mocked(fetchFeatureChoices);
const updateMock = jest.mocked(updateFeatureChoices);

const choices = (
  feature_choices: FeatureChoicesResponse['feature_choices']
): FeatureChoicesResponse => ({ feature_choices });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** Lets pending saves start and observers hear about cache changes. */
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

let queryClient: QueryClient;

function setup() {
  return renderHook(
    () => ({
      read: useFeatureChoicesQuery(),
      write: useSetMobileFeatureChoice(),
      features: useMobileFeatures(),
    }),
    { wrapper: createQueryWrapper(queryClient) }
  );
}

const cached = () =>
  queryClient.getQueryData<FeatureChoicesResponse | null>(
    featureChoicesQueryKey
  );

beforeEach(() => {
  jest.resetAllMocks();
  queryClient = createTestQueryClient();
  showServerOnScreen(queryClient);
  jest.mocked(getSettings).mockResolvedValue(null);
});

afterEach(() => {
  queryClient.clear();
});

describe('lab results in the app', () => {
  it.each([
    ['no choice', {}, true],
    ['turned off in the app', { mobile: { labResults: false } }, false],
    ['turned off on the website only', { web: { labResults: false } }, true],
  ] as const)('with %s', async (_label, feature_choices, expected) => {
    getMock.mockResolvedValue(choices(feature_choices));
    const { result } = setup();
    await waitFor(() => expect(result.current.write.state).toBe('ready'));
    expect(result.current.features.isEnabled('labResults')).toBe(expected);
    expect(result.current.features.isExplicitlyOff('labResults')).toBe(
      !expected
    );
  });

  it('stays on while the choices load or after they fail', async () => {
    const pending = deferred<FeatureChoicesResponse>();
    getMock.mockReturnValueOnce(pending.promise);
    const { result } = setup();
    expect(result.current.write.state).toBe('loading');
    expect(result.current.features.isEnabled('labResults')).toBe(true);

    getMock.mockRejectedValueOnce(new Error('offline'));
    await act(async () => {
      await queryClient.resetQueries({ queryKey: featureChoicesQueryKey });
    });
    await waitFor(() => expect(result.current.write.state).toBe('loadFailed'));
    expect(result.current.features.isEnabled('labResults')).toBe(true);
  });

  it('uses the defaults on a server older than Features, and cannot be switched there', async () => {
    getMock.mockRejectedValue(new ApiError('Not found', 404));
    const { result } = setup();
    await waitFor(() =>
      expect(result.current.write.state).toBe('serverTooOld')
    );
    expect(result.current.read.isError).toBe(false);
    expect(result.current.features.isEnabled('labResults')).toBe(true);

    act(() => result.current.write.setFeatureOn('labResults', false));
    await settle();
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe('useSetMobileFeatureChoice', () => {
  it('saves an app choice and shows the saved choices', async () => {
    getMock.mockResolvedValue(choices({ web: { labResults: false } }));
    updateMock.mockResolvedValue(
      choices({ web: { labResults: false }, mobile: { labResults: false } })
    );
    const { result } = setup();
    await waitFor(() => expect(result.current.write.state).toBe('ready'));

    act(() => result.current.write.setFeatureOn('labResults', false));

    await waitFor(() =>
      expect(result.current.features.isEnabled('labResults')).toBe(false)
    );
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith(
      { mobile: { labResults: false } },
      testServer
    );
  });

  it('saves nothing until the choices have loaded', async () => {
    const pending = deferred<FeatureChoicesResponse>();
    getMock.mockReturnValueOnce(pending.promise);
    const { result } = setup();

    act(() => result.current.write.setFeatureOn('labResults', false));
    await settle();
    expect(updateMock).not.toHaveBeenCalled();

    await act(async () => pending.resolve(choices({})));
    await waitFor(() => expect(result.current.write.state).toBe('ready'));
  });

  it('says so when a save fails, and keeps what was there', async () => {
    getMock.mockResolvedValue(choices({}));
    updateMock.mockRejectedValueOnce(new Error('offline'));
    const { result } = setup();
    await waitFor(() => expect(result.current.write.state).toBe('ready'));

    act(() => result.current.write.setFeatureOn('labResults', false));

    await waitFor(() => expect(Toast.show).toHaveBeenCalled());
    expect(jest.mocked(Toast.show).mock.calls[0][0]).toMatchObject({
      type: 'error',
    });
    expect(result.current.features.isEnabled('labResults')).toBe(true);
  });

  it('keeps a save when a read from before it answers late', async () => {
    getMock.mockResolvedValueOnce(choices({}));
    const { result } = setup();
    await waitFor(() => expect(result.current.write.state).toBe('ready'));

    // A refetch starts (a focus, say) and answers after the save.
    const late = deferred<FeatureChoicesResponse>();
    getMock.mockReturnValueOnce(late.promise);
    void queryClient.refetchQueries({ queryKey: featureChoicesQueryKey });
    await waitFor(() =>
      expect(
        queryClient.getQueryState(featureChoicesQueryKey)?.fetchStatus
      ).toBe('fetching')
    );

    updateMock.mockResolvedValueOnce(
      choices({ mobile: { labResults: false } })
    );
    act(() => result.current.write.setFeatureOn('labResults', false));
    await waitFor(() =>
      expect(cached()?.feature_choices.mobile).toEqual({ labResults: false })
    );

    await act(async () => late.resolve(choices({})));
    await settle();
    expect(cached()?.feature_choices.mobile).toEqual({ labResults: false });
  });

  it('never shows an answer that arrives after another account or server took over', async () => {
    getMock.mockResolvedValueOnce(choices({}));
    const { result } = setup();
    await waitFor(() => expect(result.current.write.state).toBe('ready'));

    const save = deferred<FeatureChoicesResponse>();
    updateMock.mockReturnValueOnce(save.promise);
    act(() => result.current.write.setFeatureOn('labResults', false));
    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));

    // useAuth clears the cache on an account or server switch; the new
    // account's choices are still on their way.
    getMock.mockReturnValue(new Promise(() => {}));
    act(() => queryClient.clear());

    await act(async () =>
      save.resolve(choices({ mobile: { labResults: false } }))
    );
    await settle();
    expect(cached()).toBeUndefined();
  });

  it('sends a change to the server it was made on, even if another one is active by then', async () => {
    getMock.mockResolvedValueOnce(choices({}));
    const { result } = setup();
    await waitFor(() => expect(result.current.write.state).toBe('ready'));

    const first = deferred<FeatureChoicesResponse>();
    updateMock
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(choices({ mobile: { labResults: true } }));
    act(() => result.current.write.setFeatureOn('labResults', false));
    act(() => result.current.write.setFeatureOn('labResults', true));
    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));

    // A server switch stores the new active server before the cache is
    // cleared; the queued change still belongs to the first one.
    showServerOnScreen(queryClient, {
      ...testServer,
      id: 'server-b',
      url: 'https://b.example.com',
    });
    await act(async () =>
      first.resolve(choices({ mobile: { labResults: false } }))
    );
    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(2));
    expect(updateMock.mock.calls.map(([, server]) => server.id)).toEqual([
      'server-a',
      'server-a',
    ]);
  });

  it('saves nothing, and says so, when the server on screen is not known', async () => {
    getMock.mockResolvedValueOnce(choices({}));
    const { result } = setup();
    await waitFor(() => expect(result.current.write.state).toBe('ready'));

    queryClient.removeQueries({ queryKey: serverConfigsQueryKey });
    act(() => result.current.write.setFeatureOn('labResults', false));
    await settle();

    expect(updateMock).not.toHaveBeenCalled();
    expect(Toast.show).toHaveBeenCalledTimes(1);
  });

  // Records the TanStack Query behaviour the binding above relies on: the
  // cache clear on a switch drops a save still queued, so it is never sent.
  it('does not send a change still queued when another account or server takes over', async () => {
    getMock.mockResolvedValueOnce(choices({}));
    const { result } = setup();
    await waitFor(() => expect(result.current.write.state).toBe('ready'));

    const first = deferred<FeatureChoicesResponse>();
    updateMock.mockReturnValueOnce(first.promise);
    act(() => result.current.write.setFeatureOn('labResults', false));
    act(() => result.current.write.setFeatureOn('labResults', true));
    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));

    // useAuth clears the cache on an account or server switch.
    getMock.mockReturnValue(new Promise(() => {}));
    act(() => queryClient.clear());
    await act(async () =>
      first.resolve(choices({ mobile: { labResults: false } }))
    );
    await settle();

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(Toast.show).not.toHaveBeenCalled();
  });

  it('saves quick changes in order, one at a time', async () => {
    getMock.mockResolvedValueOnce(choices({}));
    const { result } = setup();
    await waitFor(() => expect(result.current.write.state).toBe('ready'));

    const first = deferred<FeatureChoicesResponse>();
    updateMock
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(choices({ mobile: { labResults: true } }));
    act(() => result.current.write.setFeatureOn('labResults', false));
    act(() => result.current.write.setFeatureOn('labResults', true));
    await settle();
    expect(updateMock).toHaveBeenCalledTimes(1);

    await act(async () =>
      first.resolve(choices({ mobile: { labResults: false } }))
    );
    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(2));
    expect(updateMock).toHaveBeenLastCalledWith(
      { mobile: { labResults: true } },
      testServer
    );
    await waitFor(() =>
      expect(cached()?.feature_choices.mobile).toEqual({ labResults: true })
    );
  });
});
