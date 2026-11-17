import { get, type Server } from 'node:http';
import express, {
  type ErrorRequestHandler,
  type RequestHandler,
  type Response,
} from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import foodCoreService from '../services/foodCoreService.js';

vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  default: () => ((_req, _res, next) => next()) satisfies RequestHandler,
}));
vi.mock('../services/foodCoreService.js', () => ({
  default: { lookupBarcode: vi.fn() },
}));

const lookup = vi.mocked(foodCoreService.lookupBarcode);
// This legacy CommonJS route has a runtime default without a TypeScript export.
const { default: foodRoutes } =
  (await import('../routes/v2/foodRoutes.js')) as unknown as {
    default: express.Router;
  };
const errors: unknown[] = [];
let waitBeforeLookup: ((response: Response) => Promise<void>) | undefined;
const app = express();
app.use(async (req, res, next) => {
  req.userId = 'profile';
  req.authenticatedUserId = 'actor';
  await waitBeforeLookup?.(res);
  next();
});
app.use('/v2/foods', foodRoutes);
const handleError: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  errors.push(error);
  res.status(500).json({ error: 'Barcode lookup failed' });
};
app.use(handleError);

describe('barcode request cancellation', () => {
  let server: Server;
  let url: string;

  beforeEach(async () => {
    lookup.mockReset();
    errors.length = 0;
    waitBeforeLookup = undefined;
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('No test port');
    url = `http://127.0.0.1:${address.port}/v2/foods/barcode/4006381333931`;
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it('aborts provider work when the waiting client disconnects', async () => {
    let finish!: (result: Awaited<ReturnType<typeof lookup>>) => void;
    lookup.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    const client = get(url);
    client.on('error', () => {});
    try {
      await vi.waitFor(() => expect(lookup).toHaveBeenCalledTimes(1));
      const signal = lookup.mock.calls[0]?.[4]?.signal;
      expect(signal).toBeInstanceOf(AbortSignal);
      expect(signal?.aborted).toBe(false);
      client.destroy();
      await vi.waitFor(() => expect(signal?.aborted).toBe(true));
      finish({ source: 'not_found', food: null });
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(errors).toEqual([]);
    } finally {
      client.destroy();
      finish({ source: 'not_found', food: null });
    }
  });

  it('starts with an aborted signal if the client left during upstream middleware', async () => {
    let resume!: () => void;
    const middlewareEntered = new Promise<Response>((resolve) => {
      waitBeforeLookup = (response) => {
        resolve(response);
        return new Promise<void>((release) => {
          resume = release;
        });
      };
    });
    lookup.mockResolvedValueOnce({ source: 'not_found', food: null });
    const client = get(url);
    client.on('error', () => {});
    try {
      const response = await middlewareEntered;
      const disconnected = new Promise<void>((resolve) => {
        response.once('close', resolve);
      });
      client.destroy();
      await disconnected;
      expect(response.destroyed).toBe(true);
      resume();
      await vi.waitFor(() => expect(lookup).toHaveBeenCalledTimes(1));
      expect(lookup.mock.calls[0]?.[4]?.signal?.aborted).toBe(true);
      expect(errors).toEqual([]);
    } finally {
      client.destroy();
      resume?.();
    }
  });

  it('does not abort a normally completed response and preserves user context', async () => {
    lookup.mockResolvedValueOnce({ source: 'not_found', food: null });
    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ source: 'not_found', food: null });
    expect(lookup).toHaveBeenCalledWith(
      '4006381333931',
      'profile',
      undefined,
      'actor',
      { includeProviderMetadata: true, signal: expect.any(AbortSignal) }
    );
    expect(lookup.mock.calls[0]?.[4]?.signal?.aborted).toBe(false);
  });

  it('still reports provider errors while the client is connected', async () => {
    const failure = new Error('Provider unavailable');
    lookup.mockRejectedValueOnce(failure);
    const response = await fetch(url);
    expect(response.status).toBe(500);
    expect(errors).toEqual([failure]);
  });
});
