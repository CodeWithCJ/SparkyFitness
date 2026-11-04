import express from 'express';
// @ts-expect-error TS7016 supertest typing
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

import { log } from '../config/logging.js';
import errorHandler from '../middleware/errorHandler.js';
import { ValidationError } from '../utils/errors.js';

function appThrowing(error: unknown) {
  const app = express();
  app.get('/boom', () => {
    throw error;
  });
  app.use(errorHandler);
  return app;
}

function withFields(message: string, fields: Record<string, unknown>) {
  return Object.assign(new Error(message), fields);
}

const originalNodeEnv = process.env.NODE_ENV;

beforeEach(() => {
  vi.mocked(log).mockClear();
});

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

describe('errorHandler', () => {
  it('answers a PostgreSQL error with a generic 500 and logs the detail', async () => {
    const pgError = withFields('relation "secret_table" does not exist', {
      code: '42P01',
      severity: 'ERROR',
    });

    const res = await request(appThrowing(pgError)).get(
      '/boom?token=reset-secret'
    );

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal Server Error' });
    expect(JSON.stringify(res.body)).not.toContain('secret_table');
    const [level, line] = vi.mocked(log).mock.calls[0]!;
    expect(level).toBe('error');
    expect(line).toContain('GET /boom');
    expect(line).not.toContain('reset-secret');
    expect(line).toContain('relation "secret_table" does not exist');
  });

  it.each([
    [
      'ENOTFOUND',
      withFields('getaddrinfo ENOTFOUND sparky-db.internal', {
        code: 'ENOTFOUND',
      }),
    ],
    [
      '57P01',
      withFields('terminating connection due to administrator command', {
        code: '57P01',
      }),
    ],
    [
      'pg-pool timeout',
      new Error('Connection terminated due to connection timeout'),
    ],
    [
      'a 500 caused by ECONNREFUSED',
      withFields('Failed to get session', {
        statusCode: 500,
        cause: withFields('connect ECONNREFUSED 10.0.0.5:5432', {
          code: 'ECONNREFUSED',
        }),
      }),
    ],
  ])(
    'answers a connection failure (%s) with 503, Retry-After and no detail',
    async (_name, error) => {
      const res = await request(appThrowing(error)).get('/boom');

      expect(res.status).toBe(503);
      expect(res.headers['retry-after']).toBe('5');
      expect(res.body).toEqual({
        error: 'Service temporarily unavailable. Please try again.',
      });
      expect(vi.mocked(log).mock.calls[0]![1]).toContain(
        (error as Error).message
      );
    }
  );

  it('keeps the message of an app error thrown without a status', async () => {
    const res = await request(appThrowing(new Error('Food not found.'))).get(
      '/boom'
    );

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Food not found.' });
  });

  it.each([
    [
      'a system error',
      withFields('EACCES: permission denied, open /app/uploads/x.jpg', {
        code: 'EACCES',
        errno: -13,
        syscall: 'open',
      }),
    ],
    [
      'an app error wrapping a database error',
      new Error('Failed to get activity details: column "x" does not exist', {
        cause: withFields('column "x" does not exist', {
          code: '42703',
          severity: 'ERROR',
        }),
      }),
    ],
    [
      'a database error with status 500',
      withFields('relation "secret_table" does not exist', {
        code: '42P01',
        severity: 'ERROR',
        status: 500,
      }),
    ],
  ])('hides %s behind a generic 500', async (_name, error) => {
    const res = await request(appThrowing(error)).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal Server Error' });
  });

  it('keeps an app message that only keeps the database error as its cause', async () => {
    const duplicate = new Error(
      'A goal preset with this name already exists.',
      {
        cause: withFields(
          'duplicate key value violates unique constraint "goal_presets_name"',
          { code: '23505', severity: 'ERROR' }
        ),
      }
    );

    const res = await request(appThrowing(duplicate)).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: 'A goal preset with this name already exists.',
    });
  });

  it('answers refused connections grouped in an AggregateError with 503', async () => {
    const refused = (address: string) =>
      withFields(`connect ECONNREFUSED ${address}:5432`, {
        code: 'ECONNREFUSED',
        errno: -111,
        syscall: 'connect',
      });
    const aggregate = Object.assign(
      new AggregateError([refused('10.0.0.5'), refused('fd00::5')], ''),
      { code: 'ECONNREFUSED' }
    );

    const res = await request(appThrowing(aggregate)).get('/boom');

    expect(res.status).toBe(503);
    expect(res.headers['retry-after']).toBe('5');
    expect(res.body).toEqual({
      error: 'Service temporarily unavailable. Please try again.',
    });
  });

  it('uses statusCode when status is not a number', async () => {
    const res = await request(
      appThrowing(
        withFields('Invalid date range.', { status: 'bad', statusCode: 400 })
      )
    ).get('/boom');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid date range.');
  });

  it.each([
    [404, 'Exercise not found.'],
    [409, 'A backup is already running.'],
    [502, 'The provider did not answer.'],
  ])(
    'keeps the message of an error created with status %i',
    async (status, message) => {
      const res = await request(
        appThrowing(withFields(message, { status, code: 'SOME_CODE' }))
      ).get('/boom');

      expect(res.status).toBe(status);
      expect(res.body).toEqual({ error: message, code: 'SOME_CODE' });
    }
  );

  it('keeps the message of an error with a statusCode', async () => {
    const res = await request(
      appThrowing(withFields('Invalid date range.', { statusCode: 400 }))
    ).get('/boom');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid date range.');
  });

  it('keeps validation messages', async () => {
    const res = await request(
      appThrowing(new ValidationError('Weight must be positive.'))
    ).get('/boom');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Weight must be positive.');
  });

  it('still maps a unique violation to 409', async () => {
    const res = await request(
      appThrowing(
        withFields('duplicate key value violates unique constraint "x"', {
          code: '23505',
        })
      )
    ).get('/boom');

    expect(res.status).toBe(409);
    expect(res.body.error).toBe(
      'Conflict: A resource with this unique identifier already exists.'
    );
  });

  it('maps a reversed lab reference range to 400', async () => {
    const res = await request(
      appThrowing(
        withFields(
          'new row for relation "lab_results" violates check constraint "lab_results_ref_range_check"',
          { code: '23514', constraint: 'lab_results_ref_range_check' }
        )
      )
    ).get('/boom');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ref_range_low must not exceed ref_range_high');
  });

  it('still maps a too-large payload to 413', async () => {
    const res = await request(
      appThrowing(
        withFields('request entity too large', { type: 'entity.too.large' })
      )
    ).get('/boom');

    expect(res.status).toBe(413);
    expect(res.body.code).toBe('IMAGE_TOO_LARGE');
  });

  it('shows the real message and stack in development', async () => {
    process.env.NODE_ENV = 'development';

    const res = await request(
      appThrowing(withFields('relation "t" does not exist', { code: '42P01' }))
    ).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('relation "t" does not exist');
    expect(res.body.code).toBe('42P01');
    expect(res.body.details).toContain('Error: relation "t" does not exist');
  });

  it('handles a thrown value that is not an Error', async () => {
    const res = await request(appThrowing('plain string')).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal Server Error' });
    expect(vi.mocked(log).mock.calls[0]![1]).toContain('plain string');
  });
});
