import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../integrations/fatsecret/fatsecretService.js', () => ({
  getFatSecretAccessToken: vi.fn(),
  assertNoFatSecretApiError: vi.fn(),
  // Created inside the factory: vi.mock is hoisted above module scope.
  foodNutrientCache: new Map(),
  CACHE_DURATION_MS: 60_000,
  FATSECRET_API_BASE_URL: 'https://platform.fatsecret.com/rest',
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../integrations/mealie/mealieService.js', () => ({
  default: class {},
}));
vi.mock('../integrations/tandoor/tandoorService.js', () => ({
  default: class {},
}));
vi.mock('../integrations/norish/norishService.js', () => ({
  default: class {},
}));

import { getFatSecretNutrients } from '../services/foodIntegrationService.js';
import {
  getFatSecretAccessToken,
  foodNutrientCache,
} from '../integrations/fatsecret/fatsecretService.js';

const mockToken = vi.mocked(getFatSecretAccessToken);
const cache = foodNutrientCache as Map<
  string,
  { data: unknown; expiry: number }
>;
const realFetch = globalThis.fetch;

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

/** A payload distinguishable by whether the premier image block is present. */
function payload(withImages: boolean) {
  return {
    food: {
      food_id: '1',
      ...(withImages
        ? { food_images: { food_image: [{ image_url: 'u' }] } }
        : {}),
    },
  };
}

beforeEach(() => {
  cache.clear();
  vi.clearAllMocks();
  mockToken.mockResolvedValue('token');
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('getFatSecretNutrients caching and premier fallback', () => {
  // Keyed on foodId alone, one tenant's basic (image-less) response was served
  // to another tenant's premier request, and vice versa.
  it('does not serve one client cached nutrients to another client', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ food: { food_id: 'a' } }))
      .mockResolvedValueOnce(jsonResponse({ food: { food_id: 'b' } }));

    const first = await getFatSecretNutrients('1', 'client-a', 'secret');
    const second = await getFatSecretNutrients('1', 'client-b', 'secret');

    expect(first).toEqual({ food: { food_id: 'a' } });
    expect(second).toEqual({ food: { food_id: 'b' } });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('reuses the cached entry for the same client and food', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(payload(true)));

    await getFatSecretNutrients('1', 'client-a', 'secret');
    await getFatSecretNutrients('1', 'client-a', 'secret');

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  // A transient failure (rate limit, timeout) must not disable images for an
  // hour; only a real entitlement failure should start the cooldown.
  it('does not start the premier cooldown after a transient failure', async () => {
    globalThis.fetch = vi
      .fn()
      // premier attempt fails transiently, basic fallback succeeds
      .mockResolvedValueOnce(
        new Response('rate limited', { status: 429, statusText: 'Too Many' })
      )
      .mockResolvedValueOnce(jsonResponse(payload(false)))
      // next food: premier must be attempted again, not skipped
      .mockResolvedValueOnce(jsonResponse(payload(true)));

    await getFatSecretNutrients('1', 'client-t', 'secret');
    await getFatSecretNutrients('2', 'client-t', 'secret');

    const urls = vi
      .mocked(globalThis.fetch)
      .mock.calls.map((c) => String(c[0]));
    // The third call is for food 2 and still asks for images.
    expect(urls[2]).toContain('food_id=2');
    expect(urls[2]).toContain('include_food_images=true');
  });

  it('starts the premier cooldown on an entitlement failure', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('{"error":{"code":14,"message":"Missing scope"}}', {
          status: 403,
          statusText: 'Forbidden',
        })
      )
      .mockResolvedValueOnce(jsonResponse(payload(false)))
      .mockResolvedValueOnce(jsonResponse(payload(false)));

    await getFatSecretNutrients('1', 'client-e', 'secret');
    await getFatSecretNutrients('2', 'client-e', 'secret');

    const urls = vi
      .mocked(globalThis.fetch)
      .mock.calls.map((c) => String(c[0]));
    // Food 2 goes straight to basic — no wasted premier handshake.
    expect(urls[2]).toContain('food_id=2');
    expect(urls[2]).not.toContain('include_food_images=true');
  });
});
