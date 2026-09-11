import { describe, it, expect, vi } from 'vitest';
import type { Response as ExpressResponse } from 'express';
import { forwardResponseHeaders } from '../utils/forwardResponseHeaders.js';

const mockRes = () => {
  const setHeader = vi.fn();
  return {
    res: { setHeader } as unknown as ExpressResponse,
    setHeader,
  };
};

/**
 * Better Auth returns a Fetch `Response`. Forwarding its headers through
 * `Headers.forEach` + `res.setHeader` keeps only the last set-cookie, because
 * forEach yields each one separately and setHeader replaces rather than
 * appends. Sign-in emits a single cookie under the current config, so these
 * cover the multi-cookie response as a supported shape rather than as today's
 * behaviour.
 */
describe('forwardResponseHeaders', () => {
  it('forwards every Set-Cookie value, not just the last one', () => {
    const headers = new Headers();
    headers.append('set-cookie', 'session_token=abc; Path=/; HttpOnly');
    headers.append('set-cookie', 'session_data=xyz; Path=/; HttpOnly');
    const { res, setHeader } = mockRes();

    forwardResponseHeaders(headers, res);

    expect(setHeader).toHaveBeenCalledWith('set-cookie', [
      'session_token=abc; Path=/; HttpOnly',
      'session_data=xyz; Path=/; HttpOnly',
    ]);
  });

  it('sets Set-Cookie exactly once so no earlier value is replaced', () => {
    const headers = new Headers();
    headers.append('set-cookie', 'a=1');
    headers.append('set-cookie', 'b=2');
    headers.append('set-cookie', 'c=3');
    const { res, setHeader } = mockRes();

    forwardResponseHeaders(headers, res);

    const cookieCalls = setHeader.mock.calls.filter(
      ([key]) => String(key).toLowerCase() === 'set-cookie'
    );
    expect(cookieCalls).toHaveLength(1);
    expect(cookieCalls[0]?.[1]).toEqual(['a=1', 'b=2', 'c=3']);
  });

  it('still forwards ordinary headers', () => {
    const headers = new Headers();
    headers.append('content-type', 'application/json');
    headers.append('x-request-id', 'req-1');
    const { res, setHeader } = mockRes();

    forwardResponseHeaders(headers, res);

    expect(setHeader).toHaveBeenCalledWith('content-type', 'application/json');
    expect(setHeader).toHaveBeenCalledWith('x-request-id', 'req-1');
  });

  it('carries a single cookie through unchanged', () => {
    const headers = new Headers();
    headers.append('set-cookie', 'only=1; Path=/');
    const { res, setHeader } = mockRes();

    forwardResponseHeaders(headers, res);

    expect(setHeader).toHaveBeenCalledWith('set-cookie', ['only=1; Path=/']);
  });

  it('does not set Set-Cookie when the response carries none', () => {
    const headers = new Headers({ 'content-type': 'application/json' });
    const { res, setHeader } = mockRes();

    forwardResponseHeaders(headers, res);

    expect(
      setHeader.mock.calls.some(
        ([key]) => String(key).toLowerCase() === 'set-cookie'
      )
    ).toBe(false);
  });
});
