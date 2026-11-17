import type { ServerResponse } from 'node:http';

/** Abort response-bound work on a premature disconnect; clean up when it settles. */
export function createResponseAbortSignal(response: ServerResponse): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const abort = () => {
    if (!response.writableFinished) controller.abort();
  };
  response.once('close', abort);
  // Upstream middleware may finish after the client has already left.
  if (response.destroyed) abort();

  return {
    signal: controller.signal,
    cleanup: () => {
      response.removeListener('close', abort);
    },
  };
}
