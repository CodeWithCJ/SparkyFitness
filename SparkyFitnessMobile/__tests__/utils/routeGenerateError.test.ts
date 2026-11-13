import { ApiError } from '../../src/services/api/errors';
import { TimeoutError } from '../../src/utils/concurrency';
import {
  classifyRouteGenerateError,
  routeGenerateErrorMessage,
} from '../../src/utils/routeGenerateError';

const t = ((key: string, options?: { defaultValue?: string }) =>
  options?.defaultValue ?? key) as never;

describe('routeGenerateError', () => {
  it.each([
    [422, 'noRoute', 'No route found'],
    [429, 'rateLimited', 'Too many route requests'],
    [502, 'engineError', 'routing service had a problem'],
    [504, 'timeout', 'took too long'],
    [503, 'notConfigured', 'No routing provider'],
  ])('maps a %s response to a short message', (status, kind, text) => {
    const error = new ApiError(`Server error: ${status}`, status, '{}');
    expect(classifyRouteGenerateError(error)).toBe(kind);
    expect(routeGenerateErrorMessage(error, t)).toContain(text);
  });

  it('treats a client-side timeout like an engine timeout', () => {
    const error = new TimeoutError('generate', 1000);
    expect(classifyRouteGenerateError(error)).toBe('timeout');
  });

  it('falls back for anything else', () => {
    expect(routeGenerateErrorMessage(new Error('offline'), t)).toBe(
      'Could not generate a route.'
    );
  });
});
