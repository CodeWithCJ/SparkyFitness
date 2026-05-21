import { describe, expect, it } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';
import { formatGarminMicroserviceError } from '../integrations/garminconnect/garminConnectService.js';

function makeAxiosError(opts: {
  responseData?: unknown;
  status?: number;
  code?: string;
  message?: string;
}): AxiosError {
  const err = new AxiosError(
    opts.message ?? '',
    opts.code,
    undefined,
    undefined,
    opts.responseData !== undefined
      ? {
          data: opts.responseData,
          status: opts.status ?? 500,
          statusText: 'Error',
          headers: {},
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          config: { headers: new AxiosHeaders() } as any,
        }
      : undefined
  );
  return err;
}

describe('formatGarminMicroserviceError', () => {
  it('prefers FastAPI HTTPException detail when present', () => {
    const err = makeAxiosError({
      responseData: { detail: 'Garmin authentication failed: bad credentials' },
      status: 401,
    });
    const { detail } = formatGarminMicroserviceError(err);
    expect(detail).toBe('Garmin authentication failed: bad credentials');
  });

  it('falls back to axios error code when no response body (e.g. microservice unreachable)', () => {
    // This is the exact failure mode that previously produced an empty
    // "Failed to login to Garmin: " toast: connection refused, no response.
    const err = makeAxiosError({ code: 'ECONNREFUSED', message: '' });
    const { detail } = formatGarminMicroserviceError(err);
    expect(detail).toBe('ECONNREFUSED');
  });

  it('falls back to Error.message for non-axios errors', () => {
    const err = new Error('Garmin tokens not found for this user.');
    const { detail } = formatGarminMicroserviceError(err);
    expect(detail).toBe('Garmin tokens not found for this user.');
  });

  it('returns a literal placeholder when nothing usable is available', () => {
    // Cast a weird value through unknown to exercise the safety net.
    const { detail } = formatGarminMicroserviceError({} as unknown);
    expect(detail).toBe('[object Object]');
  });

  it('prefers axios response detail over axios code', () => {
    const err = makeAxiosError({
      responseData: { detail: 'Garmin rate limit hit: retry later' },
      status: 429,
      code: 'ERR_BAD_REQUEST',
    });
    const { detail } = formatGarminMicroserviceError(err);
    expect(detail).toBe('Garmin rate limit hit: retry later');
  });

  it('returns errorData containing the response body when present', () => {
    const body = { detail: 'x', request_id: 'abc-123' };
    const err = makeAxiosError({ responseData: body, status: 500 });
    const { errorData } = formatGarminMicroserviceError(err);
    expect(errorData).toEqual(body);
  });

  it('returns errorData containing axios code when no response body', () => {
    const err = makeAxiosError({ code: 'ETIMEDOUT', message: '' });
    const { errorData } = formatGarminMicroserviceError(err);
    expect(errorData).toBe('ETIMEDOUT');
  });

  it('handles axios errors with response body but no detail field', () => {
    const err = makeAxiosError({ responseData: { foo: 'bar' }, status: 500 });
    const { detail } = formatGarminMicroserviceError(err);
    // Should not surface "[object Object]"; falls through to Error.message
    // or code. axios.AxiosError without message → empty → falls to String(err).
    expect(detail).not.toBe('[object Object]');
  });
});
