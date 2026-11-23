import { ApiError } from '../../src/services/api/errors';
import { serverMayBeDown } from '../../src/utils/serverErrors';
import { TimeoutError } from '../../src/utils/concurrency';

describe('serverMayBeDown', () => {
  it('counts a rejected fetch, a timeout, a 5xx and a 429', () => {
    expect(serverMayBeDown(new TypeError('Network request failed'))).toBe(true);
    expect(serverMayBeDown(new TimeoutError('request', 5000))).toBe(true);
    expect(serverMayBeDown(new ApiError('bad gateway', 502))).toBe(true);
    expect(serverMayBeDown(new ApiError('slow down', 429))).toBe(true);
  });

  it("counts Android's plain-Error network failures", () => {
    expect(
      serverMayBeDown(
        new Error(
          'fetch failed: java.net.UnknownHostException: Unable to resolve host "fitdev.example.com": No address associated with hostname'
        )
      )
    ).toBe(true);
    expect(
      serverMayBeDown(new Error('fetch failed: java.net.ConnectException'))
    ).toBe(true);
    expect(serverMayBeDown(new Error('Connection refused'))).toBe(true);
  });

  it('does not count an answer from the server or an app error', () => {
    expect(serverMayBeDown(new ApiError('not found', 404))).toBe(false);
    expect(serverMayBeDown(new ApiError('conflict', 409))).toBe(false);
    expect(serverMayBeDown(new ApiError('unauthorized', 401))).toBe(false);
    expect(serverMayBeDown(new Error('Validation failed'))).toBe(false);
    expect(serverMayBeDown('fetch failed')).toBe(false);
    expect(serverMayBeDown(undefined)).toBe(false);
  });
});
