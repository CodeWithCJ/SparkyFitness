import { z } from 'zod';
import type { FoodProviderType } from '@workspace/shared';
import {
  PUBLIC_ONLY_AI_NETWORK_POLICY,
  createGuardedFetch,
} from '../../utils/outboundUrlPolicy.js';
import { log } from '../../config/logging.js';

const guardedFetch = createGuardedFetch(PUBLIC_ONLY_AI_NETWORK_POLICY);

export interface ProviderFetchJsonOptions<T> {
  providerType: FoodProviderType;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  schema: z.ZodType<T>;
}

export async function providerFetchJson<T>(
  targetUrl: URL | string,
  opts: ProviderFetchJsonOptions<T>
): Promise<T> {
  const urlObj = typeof targetUrl === 'string' ? new URL(targetUrl) : targetUrl;
  const { providerType, headers = {}, signal, schema } = opts;

  // Never log API keys or full query params. Log provider and pathname only.
  log(
    'debug',
    `[providerFetchJson] Requesting ${providerType}: ${urlObj.pathname}`
  );

  let response: Response;
  try {
    response = await guardedFetch(urlObj.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'SparkyFitness/1.0',
        ...headers,
      },
      signal,
    });
  } catch (networkError) {
    if (signal?.aborted) {
      throw networkError;
    }
    log(
      'warn',
      `[providerFetchJson] ${providerType} network error:`,
      networkError instanceof Error
        ? networkError.message
        : String(networkError)
    );
    throw Object.assign(new Error(`${providerType} service is unavailable.`), {
      status: 502,
    });
  }

  if (response.status === 401 || response.status === 403) {
    log(
      'warn',
      `[providerFetchJson] ${providerType} rejected the API key (status ${response.status})`
    );
    throw Object.assign(new Error(`${providerType} rejected the API key`), {
      status: 400,
    });
  }

  if (response.status === 429) {
    const retryAfter = response.headers.get('retry-after');
    const msg = retryAfter
      ? `${providerType} rate limit exceeded (retry after ${retryAfter}s)`
      : `${providerType} rate limit exceeded`;
    log('warn', `[providerFetchJson] ${providerType} 429 rate limit reached`);
    throw Object.assign(new Error(msg), {
      status: 429,
      retryAfter: retryAfter ? Number(retryAfter) : undefined,
    });
  }

  if (!response.ok) {
    log(
      'warn',
      `[providerFetchJson] ${providerType} responded with error status ${response.status}`
    );
    throw Object.assign(
      new Error(`${providerType} returned status ${response.status}`),
      { status: 502 }
    );
  }

  let rawJson: unknown;
  try {
    rawJson = await response.json();
  } catch (jsonError) {
    log(
      'warn',
      `[providerFetchJson] ${providerType} returned invalid JSON:`,
      jsonError
    );
    throw Object.assign(
      new Error(`Invalid JSON response from ${providerType}`),
      { status: 502 }
    );
  }

  const parsed = schema.safeParse(rawJson);
  if (!parsed.success) {
    log(
      'warn',
      `[providerFetchJson] ${providerType} schema validation failed:`,
      parsed.error.issues.map((i) => ({ path: i.path, message: i.message }))
    );
    throw Object.assign(
      new Error(`Unexpected response shape from ${providerType}`),
      { status: 502 }
    );
  }

  return parsed.data;
}
