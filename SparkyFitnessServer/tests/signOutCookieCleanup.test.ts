import { describe, expect, it } from 'vitest';
// @ts-expect-error TS7016 — no @types/supertest in project
import request from 'supertest';
import express, { type Request, type Response } from 'express';
import { applySignOutCookieCleanup } from '../middleware/signOutCookieCleanup.js';

const CLEAR = /^sparky_active_user_id=; /;

// Fake Better Auth handler that emulates better-call's node adapter setResponse:
// it iterates its own headers and calls res.setHeader, which REPLACES any
// Set-Cookie headers express or upstream middleware already set.
function fakeBetterAuthHandler(cookies: string[]) {
  return (_req: Request, res: Response) => {
    if (cookies && cookies.length) {
      res.setHeader('Set-Cookie', cookies);
    }
    res.statusCode = 200;
    res.end(JSON.stringify({ success: true }));
  };
}

function buildApp(handler: (req: Request, res: Response) => void) {
  const app = express();
  app.post('/api/auth/sign-out', (req, res) => {
    applySignOutCookieCleanup(res);
    handler(req, res);
  });
  return app;
}

describe('applySignOutCookieCleanup', () => {
  it('preserves the delete cookie when Better Auth writes its own Set-Cookie', async () => {
    const app = buildApp(
      fakeBetterAuthHandler([
        'sparky.session_token=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax',
        'sparky.session_data=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax',
      ])
    );

    const res = await request(app).post('/api/auth/sign-out');
    const cookies = res.headers['set-cookie'];

    expect(cookies).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^sparky\.session_token=;/),
        expect.stringMatching(/^sparky\.session_data=;/),
        expect.stringMatching(CLEAR),
      ])
    );
    const clear = cookies.find((c: string) => CLEAR.test(c));
    expect(clear).toContain('HttpOnly');
    expect(clear).toContain('SameSite=Strict');
    expect(clear).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  });

  it('emits the delete cookie when Better Auth writes no Set-Cookie', async () => {
    const app = buildApp(fakeBetterAuthHandler([]));

    const res = await request(app).post('/api/auth/sign-out');
    const cookies = res.headers['set-cookie'];

    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatch(CLEAR);
  });

  it('does not duplicate the delete cookie on repeated setHeader calls', async () => {
    const app = buildApp((_req, res) => {
      res.setHeader('Set-Cookie', ['a=1']);
      res.setHeader('Set-Cookie', ['a=1', 'b=2']);
      res.setHeader('Set-Cookie', ['a=1', 'b=2', 'c=3']);
      res.end('{}');
    });

    const res = await request(app).post('/api/auth/sign-out');
    const cookies = res.headers['set-cookie'];
    const clearCount = cookies.filter((c: string) => CLEAR.test(c)).length;

    expect(clearCount).toBe(1);
    expect(cookies).toEqual(
      expect.arrayContaining([
        'a=1',
        'b=2',
        'c=3',
        expect.stringMatching(CLEAR),
      ])
    );
  });

  it('tolerates falsy setHeader values without emitting "undefined"', async () => {
    const app = buildApp((_req, res) => {
      // Simulate a caller passing undefined (defensive: should never happen,
      // but the wrapper must not leak a stringified "undefined" into the header).
      res.setHeader('Set-Cookie', undefined as unknown as string[]);
      res.end('{}');
    });

    const res = await request(app).post('/api/auth/sign-out');
    const cookies = res.headers['set-cookie'];

    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatch(CLEAR);
    expect(cookies[0]).not.toContain('undefined');
  });

  it('passes through setHeader calls for non-Set-Cookie headers', async () => {
    const app = buildApp((_req, res) => {
      res.setHeader('X-Custom', 'value');
      res.setHeader('Set-Cookie', ['session=abc']);
      res.end('{}');
    });

    const res = await request(app).post('/api/auth/sign-out');
    expect(res.headers['x-custom']).toBe('value');
    expect(res.headers['set-cookie']).toEqual(
      expect.arrayContaining(['session=abc', expect.stringMatching(CLEAR)])
    );
  });

  it('includes Secure attribute in production', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const app = buildApp(fakeBetterAuthHandler([]));
      const res = await request(app).post('/api/auth/sign-out');
      expect(res.headers['set-cookie'][0]).toContain('Secure');
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});
