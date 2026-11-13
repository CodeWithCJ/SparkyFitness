import {
  type CompareMetricKey,
  type CompareResponse,
  compareResponseSchema,
  type CompareSinceResponse,
  compareSinceResponseSchema,
  type CompareSpanMode,
} from '@workspace/shared';
import { apiFetch } from './apiClient';

export interface CompareParams {
  a: CompareMetricKey;
  b: CompareMetricKey;
  mode: CompareSpanMode;
  timing: -1 | 0 | 1;
  start: string;
  end: string;
}

export interface CompareSinceParams {
  /** The habit. */
  a: CompareMetricKey;
  /** The outcome. */
  b: CompareMetricKey;
  /** The day the habit started; null asks the server for its suggestion. */
  habitStart: string | null;
  /** A line in the outcome's raw scale; null leaves the server's default. */
  line: number | null;
}

async function getCompare(
  query: readonly (readonly [string, string])[]
): Promise<unknown> {
  const search = query
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  return apiFetch<unknown>({
    endpoint: `/api/v2/reports/compare?${search}`,
    serviceName: 'compareApi',
    operation: 'compare two things',
  });
}

/**
 * Asks the server how two things move together. The response is parsed so a
 * contract drift fails loudly instead of surfacing as undefined fields.
 */
export async function fetchCompare(p: CompareParams): Promise<CompareResponse> {
  const raw = await getCompare([
    ['a', p.a],
    ['b', p.b],
    ['mode', p.mode],
    ['timing', String(p.timing)],
    ['start', p.start],
    ['end', p.end],
  ]);
  return compareResponseSchema.parse(raw);
}

/**
 * Asks whether the outcome changed since the habit started. The start and the
 * line are sent only once the person has picked them.
 */
export async function fetchCompareSince(
  p: CompareSinceParams
): Promise<CompareSinceResponse> {
  const raw = await getCompare([
    ['a', p.a],
    ['b', p.b],
    ['mode', 'since'],
    ...(p.habitStart === null ? [] : [['habitStart', p.habitStart] as const]),
    ...(p.line === null ? [] : [['line', String(p.line)] as const]),
  ]);
  return compareSinceResponseSchema.parse(raw);
}
