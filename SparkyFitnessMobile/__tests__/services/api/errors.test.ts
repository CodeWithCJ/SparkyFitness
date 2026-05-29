import { ApiError, getApiErrorMessage } from '../../../src/services/api/errors';

describe('getApiErrorMessage', () => {
  it('returns the message from an ApiError with an { error } body', () => {
    const error = new ApiError(
      'Bad Gateway',
      502,
      JSON.stringify({ error: 'FatSecret API error (code 21): Invalid IP address detected' }),
    );
    expect(getApiErrorMessage(error)).toBe(
      'FatSecret API error (code 21): Invalid IP address detected',
    );
  });

  it('returns the message from an ApiError with a { message } body', () => {
    const error = new ApiError('Bad Gateway', 502, JSON.stringify({ message: 'Something failed' }));
    expect(getApiErrorMessage(error)).toBe('Something failed');
  });

  it('prefers the { error } field over { message } when both are present', () => {
    const error = new ApiError(
      'Bad Gateway',
      502,
      JSON.stringify({ error: 'primary', message: 'secondary' }),
    );
    expect(getApiErrorMessage(error)).toBe('primary');
  });

  it('returns null when the body is not JSON', () => {
    const error = new ApiError('Bad Gateway', 502, 'not json');
    expect(getApiErrorMessage(error)).toBeNull();
  });

  it('returns null when the ApiError has no body', () => {
    const error = new ApiError('Bad Gateway', 502);
    expect(getApiErrorMessage(error)).toBeNull();
  });

  it('returns null for a non-ApiError value', () => {
    expect(getApiErrorMessage(new Error('plain error'))).toBeNull();
    expect(getApiErrorMessage('a string')).toBeNull();
    expect(getApiErrorMessage(null)).toBeNull();
  });
});
