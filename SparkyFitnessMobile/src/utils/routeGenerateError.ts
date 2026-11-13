import type { TFunction } from 'i18next';
import {
  routeGenerateErrorKind,
  type RouteGenerateErrorKind,
} from '@workspace/shared';
import { ApiError } from '../services/api/errors';
import { TimeoutError } from './concurrency';

/** What went wrong with a generate call, from the thrown error. */
export function classifyRouteGenerateError(
  error: unknown
): RouteGenerateErrorKind {
  if (error instanceof TimeoutError) return 'timeout';
  if (error instanceof ApiError)
    return routeGenerateErrorKind(error.statusCode);
  return 'unknown';
}

/** A short, translated sentence for a failed generate call. */
export function routeGenerateErrorMessage(
  error: unknown,
  t: TFunction
): string {
  return routeGenerateKindMessage(classifyRouteGenerateError(error), t);
}

/** The same sentence from an already classified failure. */
export function routeGenerateKindMessage(
  kind: RouteGenerateErrorKind,
  t: TFunction
): string {
  switch (kind) {
    case 'noRoute':
      return t('routes.generateError.noRoute', {
        defaultValue:
          'No route found there. Try another spot or a different distance.',
      });
    case 'rateLimited':
      return t('routes.generateError.rateLimited', {
        defaultValue: 'Too many route requests. Wait a few minutes and retry.',
      });
    case 'engineError':
      return t('routes.generateError.engineError', {
        defaultValue: 'The routing service had a problem. Try again shortly.',
      });
    case 'timeout':
      return t('routes.generateError.timeout', {
        defaultValue: 'The routing service took too long. Try again.',
      });
    case 'notConfigured':
      return t('routes.generateError.notConfigured', {
        defaultValue:
          'No routing provider is set up. Add one in Settings > External Providers on the web app.',
      });
    case 'invalid':
      return t('routes.generateError.invalid', {
        defaultValue: 'Those points cannot be routed.',
      });
    default:
      return t('routes.generateError.unknown', {
        defaultValue: 'Could not generate a route.',
      });
  }
}
