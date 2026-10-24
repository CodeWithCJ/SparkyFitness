import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getFatSecretAccessToken,
  searchFatSecretByBarcode,
} from '../integrations/fatsecret/fatsecretService.js';
import { searchUsdaFoodsByBarcode } from '../integrations/usda/usdaService.js';

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const barcode = '0094395000172';
const fetchMock = vi.fn<typeof fetch>();
let credentialSequence = 0;
const credentials = () => `barcode-cancellation-${++credentialSequence}`;
const tokenResponse = () =>
  Response.json({ access_token: 'barcode-access-token', expires_in: 3_600 });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

// Model a live transport: it only rejects on cancellation when the adapter
// actually forwards the signal to fetch. Releasing it also keeps a broken
// adapter's test deterministic instead of leaving the request hanging.
function pendingFetch() {
  const started = deferred<RequestInit | undefined>();
  let release!: (response: Response) => void;
  let aborted = false;
  let requested = false;
  const fetch: typeof globalThis.fetch = (_input, init) => {
    if (requested) return Promise.resolve(Response.json({}));
    requested = true;
    started.resolve(init);
    return new Promise<Response>((resolve, reject) => {
      release = resolve;
      const signal = init?.signal;
      signal?.addEventListener(
        'abort',
        () => {
          aborted = true;
          reject(signal.reason);
        },
        { once: true }
      );
    });
  };
  return {
    fetch,
    started: started.promise,
    release: (response: Response) => release(response),
    wasAborted: () => aborted,
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FatSecret barcode request cancellation', () => {
  it('aborts an uncached OAuth request without starting a barcode request', async () => {
    const controller = new AbortController();
    const reason = new Error('source deadline');
    const pending = pendingFetch();
    fetchMock.mockImplementation(pending.fetch);
    const lookup = searchFatSecretByBarcode(
      barcode,
      credentials(),
      'secret',
      true,
      controller.signal
    );
    const outcome = lookup.catch((error: unknown) => error);
    await pending.started;

    controller.abort(reason);
    pending.release(tokenResponse());

    expect(await outcome).toBe(reason);
    expect(pending.wasAborted()).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('aborts the barcode request when its OAuth token is already cached', async () => {
    const clientId = credentials();
    fetchMock.mockResolvedValueOnce(tokenResponse());
    await getFatSecretAccessToken(clientId, 'secret', 'basic barcode');
    fetchMock.mockReset();
    const pending = pendingFetch();
    fetchMock.mockImplementation(pending.fetch);
    const controller = new AbortController();
    const reason = new Error('source deadline');
    const lookup = searchFatSecretByBarcode(
      barcode,
      clientId,
      'secret',
      true,
      controller.signal
    );
    const outcome = lookup.catch((error: unknown) => error);
    await pending.started;

    controller.abort(reason);
    pending.release(new Response(null, { status: 404 }));

    expect(await outcome).toBe(reason);
    expect(pending.wasAborted()).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('aborts an in-flight alternate barcode request', async () => {
    const pending = pendingFetch();
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockImplementation(pending.fetch);
    const controller = new AbortController();
    const reason = new Error('source deadline');
    const lookup = searchFatSecretByBarcode(
      barcode,
      credentials(),
      'secret',
      true,
      controller.signal
    );
    const outcome = lookup.catch((error: unknown) => error);
    await pending.started;

    controller.abort(reason);
    pending.release(new Response(null, { status: 404 }));

    expect(await outcome).toBe(reason);
    expect(pending.wasAborted()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not request a barcode after an OAuth response resolves after abort', async () => {
    const controller = new AbortController();
    const reason = new Error('source deadline');
    fetchMock.mockImplementation(async () => {
      controller.abort(reason);
      return tokenResponse();
    });

    await expect(
      searchFatSecretByBarcode(
        barcode,
        credentials(),
        'secret',
        true,
        controller.signal
      )
    ).rejects.toBe(reason);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('does not fall back to basic scope when cancellation occurs while reading an OAuth rejection', async () => {
    const controller = new AbortController();
    const reason = new Error('source deadline');
    const response = Response.json({ error: 'invalid_scope' }, { status: 400 });
    const readJson = response.json.bind(response);
    vi.spyOn(response, 'json').mockImplementation(async () => {
      const data: unknown = await readJson();
      controller.abort(reason);
      return data;
    });
    fetchMock.mockResolvedValue(response);

    await expect(
      searchFatSecretByBarcode(
        barcode,
        credentials(),
        'secret',
        true,
        controller.signal
      )
    ).rejects.toBe(reason);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('forwards cancellation to an in-flight basic-scope OAuth fallback', async () => {
    const pending = pendingFetch();
    fetchMock
      .mockResolvedValueOnce(
        Response.json({ error: 'invalid_scope' }, { status: 400 })
      )
      .mockImplementation(pending.fetch);
    const controller = new AbortController();
    const reason = new Error('source deadline');
    const lookup = searchFatSecretByBarcode(
      barcode,
      credentials(),
      'secret',
      true,
      controller.signal
    );
    const outcome = lookup.catch((error: unknown) => error);
    await pending.started;

    controller.abort(reason);
    pending.release(tokenResponse());

    expect(await outcome).toBe(reason);
    expect(pending.wasAborted()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not request an alternate barcode after a 404 resolves after abort', async () => {
    const controller = new AbortController();
    const reason = new Error('source deadline');
    fetchMock.mockResolvedValueOnce(tokenResponse());
    fetchMock.mockImplementation(async () => {
      controller.abort(reason);
      return new Response(null, { status: 404 });
    });

    await expect(
      searchFatSecretByBarcode(
        barcode,
        credentials(),
        'secret',
        true,
        controller.signal
      )
    ).rejects.toBe(reason);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects an already cancelled lookup without requesting a cached token or barcode', async () => {
    const clientId = credentials();
    fetchMock.mockResolvedValueOnce(tokenResponse());
    await getFatSecretAccessToken(clientId, 'secret', 'basic barcode');
    fetchMock.mockReset();
    const controller = new AbortController();
    controller.abort();

    await expect(
      searchFatSecretByBarcode(
        barcode,
        clientId,
        'secret',
        true,
        controller.signal
      )
    ).rejects.toBe(controller.signal.reason);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'rejects cancellation while reading a successful barcode response (alternate: %s)',
    async (alternate) => {
      const controller = new AbortController();
      const reason = new Error('source deadline');
      const response = Response.json({ food: { food_id: '42' } });
      const readJson = response.json.bind(response);
      vi.spyOn(response, 'json').mockImplementation(async () => {
        const data: unknown = await readJson();
        controller.abort(reason);
        return data;
      });
      fetchMock.mockResolvedValueOnce(tokenResponse());
      if (alternate) {
        fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
      }
      fetchMock.mockResolvedValueOnce(response);

      await expect(
        searchFatSecretByBarcode(
          barcode,
          credentials(),
          'secret',
          true,
          controller.signal
        )
      ).rejects.toBe(reason);
    }
  );
});

describe('USDA barcode request cancellation', () => {
  it('aborts an in-flight fetch', async () => {
    const pending = pendingFetch();
    fetchMock.mockImplementation(pending.fetch);
    const controller = new AbortController();
    const reason = new Error('source deadline');
    const lookup = searchUsdaFoodsByBarcode(barcode, 'key', controller.signal);
    const outcome = lookup.catch((error: unknown) => error);
    await pending.started;

    controller.abort(reason);
    pending.release(Response.json({ foods: [] }));

    expect(await outcome).toBe(reason);
    expect(pending.wasAborted()).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('rejects an already cancelled lookup without a request', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      searchUsdaFoodsByBarcode(barcode, 'key', controller.signal)
    ).rejects.toBe(controller.signal.reason);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a response that resolves after cancellation', async () => {
    const controller = new AbortController();
    const reason = new Error('source deadline');
    fetchMock.mockImplementation(async () => {
      controller.abort(reason);
      return Response.json({ foods: [] });
    });

    await expect(
      searchUsdaFoodsByBarcode(barcode, 'key', controller.signal)
    ).rejects.toBe(reason);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('rejects cancellation while reading the response body', async () => {
    const controller = new AbortController();
    const reason = new Error('source deadline');
    const response = Response.json({ foods: [] });
    const readJson = response.json.bind(response);
    vi.spyOn(response, 'json').mockImplementation(async () => {
      const data: unknown = await readJson();
      controller.abort(reason);
      return data;
    });
    fetchMock.mockResolvedValue(response);

    await expect(
      searchUsdaFoodsByBarcode(barcode, 'key', controller.signal)
    ).rejects.toBe(reason);
  });
});
