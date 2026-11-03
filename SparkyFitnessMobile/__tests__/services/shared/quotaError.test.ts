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
