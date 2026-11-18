import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { FeatureChoicesResponse } from '@workspace/shared';
import { featureChoicesKeys } from '@/api/keys/settings';
import {
  getFeatureChoices,
  updateFeatureChoices,
} from '@/api/Settings/featureChoices';
import {
  useFeatureChoicesQuery,
  useSetWebFeatureChoice,
} from '@/hooks/Settings/useFeatureChoices';

jest.mock('@/api/Settings/featureChoices', () => ({
  getFeatureChoices: jest.fn(),
  updateFeatureChoices: jest.fn(),
}));

const getMock = getFeatureChoices as jest.Mock;
const updateMock = updateFeatureChoices as jest.Mock;

const choices = (
  feature_choices: FeatureChoicesResponse['feature_choices']
): FeatureChoicesResponse => ({ feature_choices });

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const rendered = renderHook(
    () => ({ read: useFeatureChoicesQuery(), write: useSetWebFeatureChoice() }),
    { wrapper }
  );
  return { ...rendered, client };
}

const cached = (client: QueryClient) =>
  client.getQueryData<FeatureChoicesResponse>(featureChoicesKeys.all);

/** Lets pending saves start and observers hear about cache changes. */
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('useSetWebFeatureChoice', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('saves a website choice and shows the saved choices', async () => {
    getMock.mockResolvedValue(choices({ mobile: { labResults: false } }));
    updateMock.mockResolvedValue(
      choices({ web: { labResults: false }, mobile: { labResults: false } })
    );
    const { result, client } = setup();
    await waitFor(() => expect(result.current.write.state).toBe('ready'));

    act(() => result.current.write.setFeatureOn('labResults', false));

    await waitFor(() =>
      expect(cached(client)?.feature_choices.web).toEqual({ labResults: false })
    );
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith({ web: { labResults: false } });
  });

  it('saves nothing until the choices have loaded', async () => {
    const pending = deferred<FeatureChoicesResponse>();
    getMock.mockReturnValueOnce(pending.promise);
    const { result } = setup();
    expect(result.current.write.state).toBe('loading');

    act(() => result.current.write.setFeatureOn('labResults', false));
    await settle();
    expect(updateMock).not.toHaveBeenCalled();

    await act(async () => pending.resolve(choices({})));
    await waitFor(() => expect(result.current.write.state).toBe('ready'));
  });

  it('offers a retry when the choices could not load', async () => {
    getMock.mockRejectedValueOnce(new Error('offline'));
    const { result } = setup();
    await waitFor(() => expect(result.current.write.state).toBe('loadFailed'));

    act(() => result.current.write.setFeatureOn('labResults', false));
    await settle();
    expect(updateMock).not.toHaveBeenCalled();

    getMock.mockResolvedValueOnce(choices({}));
    act(() => result.current.write.reload());
    await waitFor(() => expect(result.current.write.state).toBe('ready'));
  });

  it('keeps a save when a read from before it answers late', async () => {
    getMock.mockResolvedValueOnce(choices({}));
    const { result, client } = setup();
    await waitFor(() => expect(result.current.write.state).toBe('ready'));

    // A refetch starts (a window focus, say) and answers after the save.
    const late = deferred<FeatureChoicesResponse>();
    getMock.mockReturnValueOnce(late.promise);
    void client.refetchQueries({ queryKey: featureChoicesKeys.all });
    await waitFor(() =>
      expect(client.getQueryState(featureChoicesKeys.all)?.fetchStatus).toBe(
        'fetching'
      )
    );

    updateMock.mockResolvedValueOnce(choices({ web: { labResults: false } }));
    act(() => result.current.write.setFeatureOn('labResults', false));
    await waitFor(() =>
      expect(cached(client)?.feature_choices.web).toEqual({ labResults: false })
    );

    await act(async () => late.resolve(choices({})));
    await settle();
    expect(cached(client)?.feature_choices.web).toEqual({ labResults: false });
  });

  it('never shows an answer that arrives after another account took over', async () => {
    getMock.mockResolvedValueOnce(choices({}));
    const { result, client } = setup();
    await waitFor(() => expect(result.current.write.state).toBe('ready'));

    const save = deferred<FeatureChoicesResponse>();
    updateMock.mockReturnValueOnce(save.promise);
    act(() => result.current.write.setFeatureOn('labResults', false));
    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));

    // `useAuth` clears the cache when the account changes; the new account's
    // choices are still on their way.
    getMock.mockReturnValue(new Promise(() => {}));
    act(() => client.clear());

    await act(async () =>
      save.resolve(choices({ web: { labResults: false } }))
    );
    await settle();
    expect(cached(client)).toBeUndefined();
  });

  it('saves quick changes in order, one at a time', async () => {
    getMock.mockResolvedValueOnce(choices({}));
    const { result, client } = setup();
    await waitFor(() => expect(result.current.write.state).toBe('ready'));

    const first = deferred<FeatureChoicesResponse>();
    updateMock
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(choices({ web: { labResults: true } }));
    act(() => result.current.write.setFeatureOn('labResults', false));
    act(() => result.current.write.setFeatureOn('labResults', true));
    await settle();
    expect(updateMock).toHaveBeenCalledTimes(1);

    await act(async () =>
      first.resolve(choices({ web: { labResults: false } }))
    );
    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(2));
    expect(updateMock).toHaveBeenLastCalledWith({ web: { labResults: true } });
    await waitFor(() =>
      expect(cached(client)?.feature_choices.web).toEqual({ labResults: true })
    );
  });
});
