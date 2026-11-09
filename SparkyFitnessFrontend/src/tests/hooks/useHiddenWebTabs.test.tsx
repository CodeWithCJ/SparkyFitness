import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { WebHideableTabId } from '@workspace/shared';
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
  return renderHook(
    () => ({ read: useHiddenWebTabs(), write: useSetWebTabHidden() }),
    { wrapper }
  );
}

const hiddenOf = (result: {
  current: { read: { hidden: ReadonlySet<WebHideableTabId> } };
}) => [...result.current.read.hidden].sort();

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

  it('hides nothing and asks for nothing while acting for someone else', () => {
    mockActingOnBehalf = true;
    const { result } = setup();
    expect(result.current.read.hidden.size).toBe(0);
    expect(result.current.read.isLoading).toBe(false);
    expect(getMock).not.toHaveBeenCalled();
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
