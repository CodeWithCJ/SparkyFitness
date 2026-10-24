import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  invalidateOpenFoodFactsSession,
  resolveOffFetch,
  resolveOpenFoodFactsProvider,
} from '../integrations/openfoodfacts/openFoodFactsAuth.js';
import { searchOpenFoodFactsByBarcodeFields } from '../integrations/openfoodfacts/openFoodFactsService.js';
import { searchYazioByBarcode } from '../integrations/yazio/yazioService.js';
import openFoodFactsProductReadRateLimitRepository from '../models/openFoodFactsProductReadRateLimitRepository.js';

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../integrations/openfoodfacts/openFoodFactsAuth.js', () => ({
  DEFAULT_OFF_BASE_URL: 'https://world.openfoodfacts.org',
  resolveOpenFoodFactsProvider: vi.fn(),
  invalidateOpenFoodFactsSession: vi.fn(),
  resolveOffFetch: vi.fn(),
}));
vi.mock('../models/openFoodFactsProductReadRateLimitRepository.js');

const barcode = '0094395000172';
const abortReason = new DOMException('Lookup canceled', 'AbortError');
const fetchMock = vi.fn<typeof fetch>();
let credentialSequence = 0;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function pendingTransport() {
  const started = deferred<AbortSignal | null | undefined>();
  const response = deferred<Response>();
  const transport: typeof fetch = (_input, init) => {
    const signal = init?.signal;
    started.resolve(signal);
    return new Promise<Response>((resolve, reject) => {
      const onAbort = () => reject(signal?.reason);
      signal?.addEventListener('abort', onAbort, { once: true });
      void response.promise.then((result) => {
        signal?.removeEventListener('abort', onAbort);
        resolve(result);
      });
    });
  };
  return { started, response, transport };
}

function offLookup(signal: AbortSignal, authenticated = false) {
  return searchOpenFoodFactsByBarcodeFields(
    barcode,
    ['product_name'],
    'en',
    authenticated ? 'off-user' : undefined,
    authenticated ? 'off-provider' : undefined,
    'personal',
    signal
  );
}

function yazioCredentials() {
  return {
    clientId: `cancellation-client-${++credentialSequence}`,
    clientSecret: 'cancellation-test-secret',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(resolveOffFetch).mockResolvedValue(fetchMock);
  vi.mocked(resolveOpenFoodFactsProvider).mockResolvedValue({
    session: 'shared-off-session',
    baseUrl: 'https://world.openfoodfacts.org',
    configurationIdentity: null,
  });
  vi.mocked(
    openFoodFactsProductReadRateLimitRepository.tryAcquire
  ).mockResolvedValue({
    acquired: true,
    token: '00000000-0000-4000-8000-000000000001',
    leaseExpiresAt: new Date(Date.now() + 60_000),
  });
  vi.mocked(
    openFoodFactsProductReadRateLimitRepository.release
  ).mockResolvedValue(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('OpenFoodFacts barcode cancellation', () => {
  it('aborts the active product transport with the caller signal', async () => {
    const controller = new AbortController();
    const pending = pendingTransport();
    fetchMock.mockImplementation(pending.transport);
    const result = expect(offLookup(controller.signal)).rejects.toBe(
      abortReason
    );
    const transportSignal = await pending.started.promise;

    controller.abort(abortReason);
    pending.response.resolve(
      Response.json({ status: 1, status_verbose: 'product found', product: {} })
    );

    await result;
    expect(transportSignal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('does not read a product after cancellation during shared authentication', async () => {
    const controller = new AbortController();
    const authentication =
      deferred<Awaited<ReturnType<typeof resolveOpenFoodFactsProvider>>>();
    vi.mocked(resolveOpenFoodFactsProvider).mockReturnValue(
      authentication.promise
    );
    fetchMock.mockResolvedValue(Response.json({ status: 1, product: {} }));
    const result = expect(offLookup(controller.signal, true)).rejects.toBe(
      abortReason
    );

    controller.abort(abortReason);
    authentication.resolve({
      session: 'shared-off-session',
      baseUrl: 'https://world.openfoodfacts.org',
      configurationIdentity: null,
    });

    await result;
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not read a product after cancellation during fetch-policy resolution', async () => {
    const controller = new AbortController();
    const resolution = deferred<typeof fetch>();
    const resolving = deferred<void>();
    vi.mocked(resolveOffFetch).mockImplementation(() => {
      resolving.resolve();
      return resolution.promise;
    });
    fetchMock.mockResolvedValue(Response.json({ status: 1, product: {} }));
    const result = expect(offLookup(controller.signal)).rejects.toBe(
      abortReason
    );
    await resolving.promise;

    controller.abort(abortReason);
    resolution.resolve(fetchMock);

    await result;
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not send a canceled queued product read when a permit becomes available', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    vi.mocked(
      openFoodFactsProductReadRateLimitRepository.tryAcquire
    ).mockResolvedValueOnce({
      acquired: false,
      retryAt: new Date(Date.now() + 50),
    });
    fetchMock.mockResolvedValue(Response.json({ status: 1, product: {} }));
    const result = expect(offLookup(controller.signal)).rejects.toBe(
      abortReason
    );
    void result.catch(() => {});
    await vi.advanceTimersByTimeAsync(0);

    controller.abort(abortReason);
    await vi.advanceTimersByTimeAsync(50);

    await result;
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      openFoodFactsProductReadRateLimitRepository.release
    ).toHaveBeenCalledOnce();
  });

  it('does not retry or invalidate the shared session after a canceled response', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(async () => {
      controller.abort(abortReason);
      return new Response('unavailable', { status: 503 });
    });

    await expect(offLookup(controller.signal, true)).rejects.toBe(abortReason);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(invalidateOpenFoodFactsSession).not.toHaveBeenCalled();
  });

  it('does not request the alternate barcode after cancellation while reading JSON', async () => {
    const controller = new AbortController();
    const response = Response.json({});
    vi.spyOn(response, 'json').mockImplementation(async () => {
      controller.abort(abortReason);
      return { status: 0, status_verbose: 'product not found' };
    });
    fetchMock.mockResolvedValue(response);

    await expect(offLookup(controller.signal)).rejects.toBe(abortReason);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe('Yazio barcode cancellation', () => {
  it('does not authenticate or read products for an already canceled lookup', async () => {
    const controller = new AbortController();
    controller.abort(abortReason);
    fetchMock.mockImplementation(async () => Response.json([]));

    await expect(
      searchYazioByBarcode(barcode, yazioCredentials(), controller.signal)
    ).rejects.toBe(abortReason);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('aborts the active guarded search transport before reading candidate details', async () => {
    const controller = new AbortController();
    const pending = pendingTransport();
    fetchMock
      .mockResolvedValueOnce(Response.json({ access_token: 'shared-token' }))
      .mockImplementationOnce(pending.transport)
      .mockResolvedValue(Response.json(null));
    const result = expect(
      searchYazioByBarcode(barcode, yazioCredentials(), controller.signal)
    ).rejects.toBe(abortReason);
    const transportSignal = await pending.started.promise;

    controller.abort(abortReason);
    pending.response.resolve(Response.json([{ id: 'candidate-1' }]));

    await result;
    expect(transportSignal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('aborts the active guarded detail transport before trying the next candidate', async () => {
    const controller = new AbortController();
    const pending = pendingTransport();
    fetchMock
      .mockResolvedValueOnce(Response.json({ access_token: 'shared-token' }))
      .mockResolvedValueOnce(
        Response.json([{ id: 'candidate-1' }, { id: 'candidate-2' }])
      )
      .mockImplementationOnce(pending.transport)
      .mockResolvedValue(Response.json(null));
    const result = expect(
      searchYazioByBarcode(barcode, yazioCredentials(), controller.signal)
    ).rejects.toBe(abortReason);
    const transportSignal = await pending.started.promise;

    controller.abort(abortReason);
    pending.response.resolve(Response.json(null));

    await result;
    expect(transportSignal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not request details after cancellation while reading search JSON', async () => {
    const controller = new AbortController();
    const response = Response.json([]);
    vi.spyOn(response, 'json').mockImplementation(async () => {
      controller.abort(abortReason);
      return [{ id: 'candidate-1' }];
    });
    fetchMock
      .mockResolvedValueOnce(Response.json({ access_token: 'shared-token' }))
      .mockResolvedValueOnce(response)
      .mockResolvedValue(Response.json(null));

    await expect(
      searchYazioByBarcode(barcode, yazioCredentials(), controller.signal)
    ).rejects.toBe(abortReason);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('lets shared authentication finish for another caller without starting canceled product reads', async () => {
    const controller = new AbortController();
    const credentials = yazioCredentials();
    const authentication = deferred<Response>();
    fetchMock
      .mockReturnValueOnce(authentication.promise)
      .mockImplementation(async () => Response.json([]));
    const canceled = expect(
      searchYazioByBarcode(barcode, credentials, controller.signal)
    ).rejects.toBe(abortReason);
    const active = searchYazioByBarcode(barcode, credentials);

    controller.abort(abortReason);
    authentication.resolve(Response.json({ access_token: 'shared-token' }));

    await canceled;
    await expect(active).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeUndefined();
  });
});
