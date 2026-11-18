import { ApiError } from '../services/api/errors';
import { TimeoutError } from './concurrency';

/**
 * True when a failed request suggests the server itself is not answering: a
 * network error (React Native's fetch rejects with a TypeError), a timeout, or
 * a 5xx/429 (often a reverse proxy in front of a stopped server). A 4xx means
 * the server answered; app errors such as validation or a cancelled request
 * say nothing about the connection.
 */
export function serverMayBeDown(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.statusCode >= 500 || error.statusCode === 429;
  }
  return (
    error instanceof TimeoutError ||
    error instanceof TypeError ||
    isNetworkFailure(error)
  );
}

/**
 * Android's fetch rejects a request that never reached the server with a
 * plain `Error` (for example "fetch failed: java.net.UnknownHostException:
 * Unable to resolve host ..."), not a `TypeError`. Only the message tells it
 * apart from an app error, so it is matched on the wording of the network
 * layer.
 */
const NETWORK_FAILURE_MESSAGE =
  /fetch failed|network request failed|network error|unknownhost|unable to resolve host|failed to connect|connection (refused|reset|closed|timed out)|connect timed out|timed out|socketexception|sockettimeout|econn(refused|reset|aborted)|enotfound|eai_again|software caused connection abort/i;

function isNetworkFailure(error: unknown): boolean {
  return error instanceof Error && NETWORK_FAILURE_MESSAGE.test(error.message);
}
