import { describe, expect, it } from 'vitest';
import { publicErrorMessage } from '../utils/errors.js';

const pgError = () =>
  Object.assign(new Error('relation "users" does not exist'), {
    code: '42P01',
    severity: 'ERROR',
  });

const systemError = () =>
  Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:5432'), {
    errno: -111,
    syscall: 'connect',
    code: 'ECONNREFUSED',
  });

describe('publicErrorMessage', () => {
  it('keeps an app or provider message', () => {
    expect(publicErrorMessage(new Error('Strava token expired'))).toBe(
      'Strava token expired'
    );
  });

  it('hides a database error', () => {
    expect(publicErrorMessage(pgError())).toBe('Internal Server Error');
  });

  it('hides a system error', () => {
    expect(publicErrorMessage(systemError())).toBe('Internal Server Error');
  });

  it('hides an app error that repeats the database error it wraps', () => {
    const cause = pgError();
    expect(
      publicErrorMessage(new Error(`Sync failed: ${cause.message}`, { cause }))
    ).toBe('Internal Server Error');
  });

  it('keeps an app message that only carries a database error as its cause', () => {
    expect(
      publicErrorMessage(new Error('Sync failed', { cause: pgError() }))
    ).toBe('Sync failed');
  });

  it('falls back when there is no message', () => {
    expect(publicErrorMessage(new Error(''))).toBe('Internal Server Error');
    expect(publicErrorMessage({})).toBe('Internal Server Error');
    expect(publicErrorMessage('boom')).toBe('Internal Server Error');
    expect(publicErrorMessage(undefined)).toBe('Internal Server Error');
    expect(publicErrorMessage(null)).toBe('Internal Server Error');
  });

  it('uses a custom fallback', () => {
    expect(publicErrorMessage(pgError(), 'Sync failed.')).toBe('Sync failed.');
  });
});
