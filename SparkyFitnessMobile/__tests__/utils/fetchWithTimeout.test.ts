import { fetchWithTimeout, TimeoutError } from '../../src/utils/concurrency';

const mockFetch = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
const originalFetch = global.fetch;

beforeEach(() => {
  jest.useFakeTimers();
  mockFetch.mockReset();
  global.fetch = mockFetch;
});
afterEach(() => {
  global.fetch = originalFetch;
  jest.useRealTimers();
});

function abortableFetch(
  _url: RequestInfo | URL,
  options?: RequestInit
): Promise<Response> {
  return new Promise((_resolve, reject) => {
    options?.signal?.addEventListener('abort', () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    });
  });
}

test('combines user cancellation with the request timeout', async () => {
  mockFetch.mockImplementation(abortableFetch);
  const controller = new AbortController();
  const remove = jest.spyOn(controller.signal, 'removeEventListener');
  const request = fetchWithTimeout(
    'https://example.test',
    { signal: controller.signal },
    1000
  );
  const check = expect(request).rejects.toMatchObject({ name: 'AbortError' });
  controller.abort();
  await check;
  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  expect(jest.getTimerCount()).toBe(0);
});

test('does not start a request that was already cancelled', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    fetchWithTimeout(
      'https://example.test',
      { signal: controller.signal },
      1000
    )
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(mockFetch).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

test('still produces TimeoutError when the caller has not cancelled', async () => {
  mockFetch.mockImplementation(abortableFetch);
  const request = fetchWithTimeout('https://example.test', {}, 1000);
  const check = expect(request).rejects.toBeInstanceOf(TimeoutError);
  await jest.advanceTimersByTimeAsync(1000);
  await check;
  expect(jest.getTimerCount()).toBe(0);
});
