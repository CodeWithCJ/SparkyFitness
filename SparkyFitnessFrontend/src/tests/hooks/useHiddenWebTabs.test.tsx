import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WEB_TABS_PAGE_KEY, type WebHideableTabId } from '@workspace/shared';
import { dashboardLayoutKeys } from '@/api/keys/dashboardLayouts';
import {
  useHiddenWebTabs,
  useSetWebTabHidden,
} from '@/hooks/Settings/useHiddenWebTabs';
import {
  getHiddenWebTabs,
  saveHiddenWebTabs,
} from '@/api/Settings/dashboardLayouts';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);

jest.mock('@/api/Settings/dashboardLayouts', () => ({
  getHiddenWebTabs: jest.fn(),
  saveHiddenWebTabs: jest.fn(),
}));

let mockActingOnBehalf = false;
jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({ isActingOnBehalf: mockActingOnBehalf }),
}));

const getMock = getHiddenWebTabs as jest.Mock;
const saveMock = saveHiddenWebTabs as jest.Mock;

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const rendered = renderHook(
    () => ({ read: useHiddenWebTabs(), write: useSetWebTabHidden() }),
    { wrapper }
  );
  return { ...rendered, client };
}

const hiddenOf = (result: {
  current: { read: { hidden: ReadonlySet<WebHideableTabId> } };
}) => [...result.current.read.hidden].sort();

/** Lets pending saves start and observers hear about cache changes. */
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useHiddenWebTabs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActingOnBehalf = false;
  });

  it('loads the tabs the person hid', async () => {
    getMock.mockResolvedValue(['labs']);
    const { result } = setup();
    expect(result.current.read.hidden.size).toBe(0);
    await waitFor(() => expect(hiddenOf(result)).toEqual(['labs']));
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it('hides nothing, asks for nothing and saves nothing while acting for someone else', async () => {
    mockActingOnBehalf = true;
    const { result } = setup();
    expect(result.current.read.hidden.size).toBe(0);
    expect(result.current.read.editState).toBe('actingOnBehalf');
    act(() => result.current.write.setTabHidden('labs', true));
    await settle();
    expect(getMock).not.toHaveBeenCalled();
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('saves nothing until the list has loaded, and can load it again', async () => {
    getMock
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(['labs']);
    const { result } = setup();
    expect(result.current.read.editState).toBe('loading');
    await waitFor(() =>
      expect(result.current.read.editState).toBe('loadFailed')
    );

    // A guess ([] + goals) would replace the saved ['labs'].
    act(() => result.current.write.setTabHidden('goals', true));
    await settle();
    expect(saveMock).not.toHaveBeenCalled();
    expect(result.current.read.hidden.size).toBe(0);
    expect(result.current.read.editState).toBe('loadFailed');

    act(() => result.current.read.reload());
    await waitFor(() => expect(result.current.read.editState).toBe('ready'));
    expect(hiddenOf(result)).toEqual(['labs']);
  });

  it('changes the list at once and saves it whole', async () => {
    getMock.mockResolvedValue(['labs']);
    saveMock.mockImplementation(async (hidden: WebHideableTabId[]) => hidden);
    const { result } = setup();
    await waitFor(() => expect(hiddenOf(result)).toEqual(['labs']));

    act(() => result.current.write.setTabHidden('goals', true));

    await waitFor(() => expect(hiddenOf(result)).toEqual(['goals', 'labs']));
    await waitFor(() =>
      expect(saveMock).toHaveBeenCalledWith(['labs', 'goals'])
    );
  });

  it('keeps both of two quick changes', async () => {
    getMock.mockResolvedValue([]);
    const first = deferred<WebHideableTabId[]>();
    const second = deferred<WebHideableTabId[]>();
    saveMock
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const { result } = setup();
    await waitFor(() => expect(getMock).toHaveBeenCalled());

    act(() => result.current.write.setTabHidden('labs', true));
    act(() => result.current.write.setTabHidden('goals', true));
    await waitFor(() => expect(hiddenOf(result)).toEqual(['goals', 'labs']));

    // The first save answering does not drop the tap still being saved.
    await act(async () => first.resolve(['labs']));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2));
    expect(hiddenOf(result)).toEqual(['goals', 'labs']);

    expect(saveMock).toHaveBeenNthCalledWith(1, ['labs']);
    expect(saveMock).toHaveBeenNthCalledWith(2, ['labs', 'goals']);
    await act(async () => second.resolve(['labs', 'goals']));
    await waitFor(() => expect(hiddenOf(result)).toEqual(['goals', 'labs']));
  });

  it('rereads the list only once the last queued save has settled', async () => {
    getMock.mockResolvedValueOnce([]).mockResolvedValueOnce(['labs', 'goals']);
    const first = deferred<WebHideableTabId[]>();
    const second = deferred<WebHideableTabId[]>();
    saveMock
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const { result } = setup();
    await waitFor(() => expect(result.current.read.editState).toBe('ready'));

    act(() => result.current.write.setTabHidden('labs', true));
    act(() => result.current.write.setTabHidden('goals', true));
    await act(async () => first.reject(new Error('offline')));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2));

    // The queued save already carries both taps: no reread may undo them.
    await settle();
    expect(getMock).toHaveBeenCalledTimes(1);
    expect(hiddenOf(result)).toEqual(['goals', 'labs']);

    await act(async () => second.reject(new Error('offline')));
    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(hiddenOf(result)).toEqual(['goals', 'labs']));
  });

  it('does not let a reread that started earlier undo a newer tap', async () => {
    const reread = deferred<WebHideableTabId[]>();
    const second = deferred<WebHideableTabId[]>();
    getMock
      .mockResolvedValueOnce([])
      .mockImplementationOnce(() => reread.promise);
    saveMock
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementationOnce(() => second.promise);
    const { result } = setup();
    await waitFor(() => expect(result.current.read.editState).toBe('ready'));

    act(() => result.current.write.setTabHidden('labs', true));
    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(2));

    act(() => result.current.write.setTabHidden('goals', true));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2));
    expect(saveMock).toHaveBeenNthCalledWith(2, ['labs', 'goals']);

    // The reread answers while the newer save is still running.
    await act(async () => reread.resolve([]));
    await settle();
    expect(hiddenOf(result)).toEqual(['goals', 'labs']);

    await act(async () => second.resolve(['labs', 'goals']));
    await waitFor(() => expect(hiddenOf(result)).toEqual(['goals', 'labs']));
  });

  it('keeps the list as the server saved it', async () => {
    getMock.mockResolvedValue(['labs']);
    saveMock.mockResolvedValue(['goals', 'labs']);
    const { result, client } = setup();
    await waitFor(() => expect(hiddenOf(result)).toEqual(['labs']));

    act(() => result.current.write.setTabHidden('goals', true));

    await waitFor(() =>
      expect(
        client.getQueryData(dashboardLayoutKeys.byPage(WEB_TABS_PAGE_KEY))
      ).toEqual(['goals', 'labs'])
    );
    expect(saveMock).toHaveBeenCalledWith(['labs', 'goals']);
  });

  it("does not write a save's answer once another account has taken over", async () => {
    getMock.mockResolvedValueOnce(['labs']).mockResolvedValueOnce([]);
    const save = deferred<WebHideableTabId[]>();
    saveMock.mockImplementationOnce(() => save.promise);
    const { result, rerender, client } = setup();
    await waitFor(() => expect(hiddenOf(result)).toEqual(['labs']));

    act(() => result.current.write.setTabHidden('goals', true));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));

    // useAuth clears the cache for the new account, and the tab bar then
    // reads that account's own list.
    act(() => client.clear());
    rerender();
    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.read.editState).toBe('ready'));

    // The previous account's save answers after the switch.
    await act(async () => save.resolve(['labs', 'goals']));
    await settle();
    expect(hiddenOf(result)).toEqual([]);
  });

  it('goes back to the saved list when a save fails', async () => {
    getMock.mockResolvedValueOnce(['labs']).mockResolvedValueOnce(['labs']);
    const save = deferred<WebHideableTabId[]>();
    saveMock.mockImplementation(() => save.promise);
    const { result } = setup();
    await waitFor(() => expect(hiddenOf(result)).toEqual(['labs']));

    act(() => result.current.write.setTabHidden('goals', true));
    await waitFor(() => expect(hiddenOf(result)).toEqual(['goals', 'labs']));

    await act(async () => save.reject(new Error('offline')));

    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(hiddenOf(result)).toEqual(['labs']));
  });
});
