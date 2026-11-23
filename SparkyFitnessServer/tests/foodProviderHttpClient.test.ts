import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { providerFetchJson } from '../integrations/foodProviders/httpClient.js';
import * as logging from '../config/logging.js';

const mockSchema = z.object({
  id: z.number(),
  name: z.string(),
});

describe('foodProvider httpClient (providerFetchJson)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('parses successful 200 responses matching schema', async () => {
    const mockResponse = new Response(
      JSON.stringify({ id: 123, name: 'Apple' }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse);

    const result = await providerFetchJson('https://api.example.com/item', {
      providerType: 'cooktool' as any,
      schema: mockSchema,
    });

    expect(result).toEqual({ id: 123, name: 'Apple' });
  });

  it('maps 401 and 403 to status 400 with API key rejected message', async () => {
    const mock401 = new Response('Unauthorized', { status: 401 });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mock401);

    await expect(
      providerFetchJson('https://api.example.com/item', {
        providerType: 'cooktool' as any,
        schema: mockSchema,
      })
    ).rejects.toMatchObject({
      message: 'cooktool rejected the API key',
      status: 400,
    });

    const mock403 = new Response('Forbidden', { status: 403 });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mock403);

    await expect(
      providerFetchJson('https://api.example.com/item', {
        providerType: 'nutrientgraph' as any,
        schema: mockSchema,
      })
    ).rejects.toMatchObject({
      message: 'nutrientgraph rejected the API key',
      status: 400,
    });
  });

  it('maps 429 with Retry-After header', async () => {
    const mock429 = new Response('Rate limited', {
      status: 429,
      headers: { 'Retry-After': '30' },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mock429);

    await expect(
      providerFetchJson('https://api.example.com/item', {
        providerType: 'cooktool' as any,
        schema: mockSchema,
      })
    ).rejects.toMatchObject({
      message: 'cooktool rate limit exceeded (retry after 30s)',
      status: 429,
      retryAfter: 30,
    });
  });

  it('maps 5xx and network errors to status 502', async () => {
    const mock500 = new Response('Internal Server Error', { status: 500 });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mock500);

    await expect(
      providerFetchJson('https://api.example.com/item', {
        providerType: 'cooktool' as any,
        schema: mockSchema,
      })
    ).rejects.toMatchObject({
      status: 502,
    });

    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
      new Error('Connection reset')
    );

    await expect(
      providerFetchJson('https://api.example.com/item', {
        providerType: 'cooktool' as any,
        schema: mockSchema,
      })
    ).rejects.toMatchObject({
      status: 502,
    });
  });

  it('maps schema validation failures to status 502', async () => {
    const mockInvalidShape = new Response(JSON.stringify({ wrong: 'shape' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockInvalidShape);

    await expect(
      providerFetchJson('https://api.example.com/item', {
        providerType: 'cooktool' as any,
        schema: mockSchema,
      })
    ).rejects.toMatchObject({
      message: 'Unexpected response shape from cooktool',
      status: 502,
    });
  });

  it('never logs headers or secret API keys', async () => {
    const logSpy = vi.spyOn(logging, 'log');
    const secretKey = 'ctk_super_secret_key_12345';

    const mockResponse = new Response(JSON.stringify({ id: 1, name: 'Test' }), {
      status: 200,
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse);

    await providerFetchJson(
      'https://api.example.com/v1/ingredients?key=' + secretKey,
      {
        providerType: 'cooktool' as any,
        headers: { 'x-api-key': secretKey },
        schema: mockSchema,
      }
    );

    for (const call of logSpy.mock.calls) {
      for (const arg of call) {
        expect(JSON.stringify(arg)).not.toContain(secretKey);
      }
    }
  });
});
