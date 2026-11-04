import { isRetryableHealthReadError } from '../../../src/services/shared/quotaError';

test.each<[string, boolean]>([
  ['API call quota exceeded', true],
  ['SecurityException: API call quota exceeded', true],
  ['Health Connect client is not initialized', true],
  ['Binder transaction failed', true],
  ['SecurityException: permission denied', false],
  ['Record type is not supported', false],
])('classifies native read failure %s for retry', (message, expected) => {
  expect(isRetryableHealthReadError(new Error(message))).toBe(expected);
});

test.each([
  'PERMISSION_ERROR',
  'AGGREGATION_NOT_SUPPORTED',
  'SDK_VERSION_ERROR',
])('keeps native %s failures permanent without a matching message', (code) => {
  const failure = Object.assign(new Error('Native read failed'), { code });
  expect(isRetryableHealthReadError(failure)).toBe(false);
  expect(isRetryableHealthReadError({ code })).toBe(false);
});

test.each(['ARGUMENT_VALIDATION_ERROR', 'UNKNOWN_ERROR'])(
  'keeps native %s failures retryable',
  (code) => {
    const failure = Object.assign(new Error('Native read failed'), { code });
    expect(isRetryableHealthReadError(failure)).toBe(true);
  }
);

test.each([
  'API call quota exceeded',
  'Health Connect client is not initialized',
])('prioritizes retryable %s over a permission code', (message) => {
  const failure = Object.assign(new Error(message), {
    code: 'PERMISSION_ERROR',
  });
  expect(isRetryableHealthReadError(failure)).toBe(true);
  expect(
    isRetryableHealthReadError({ code: 'PERMISSION_ERROR', message })
  ).toBe(true);
});
