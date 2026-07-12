import { TimeoutError } from '../../utils/concurrency';

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public body?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function getApiErrorMessage(error: unknown): string | null {
  if (error instanceof TimeoutError) {
    return 'Request timed out — check your server connection';
  }
  if (!(error instanceof ApiError) || !error.body) return null;
  try {
    const parsed = JSON.parse(error.body);
    if (typeof parsed?.error === 'string') return parsed.error;
    if (typeof parsed?.message === 'string') return parsed.message;
  } catch {
    // body wasn't JSON — fall through
  }
  return null;
}
