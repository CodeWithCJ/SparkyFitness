import { serverMayBeDown } from '../utils/serverErrors';
import { TimeoutError } from '../utils/concurrency';

/**
 * After a save request failed: when the failure says the server could not be
 * reached, keeps the change on the phone by running `queue` and answers true
 * once that worked. A timeout is not taken as "never arrived", because the
 * server may have processed the request and only the answer was lost; that
 * is reported to the person as a failure rather than risking a second copy.
 */
export async function queueAfterConnectionFailure(
  error: unknown,
  queue: () => Promise<boolean>
): Promise<boolean> {
  if (!serverMayBeDown(error) || error instanceof TimeoutError) return false;
  if (isReadTimeout(error)) return false;
  return queue();
}

/**
 * A plain `Error` that says a read or socket timed out. The request got as
 * far as the server, which may have processed it. "Connect timed out" and
 * "failed to connect" mean it never arrived, so those still count as lost.
 */
function isReadTimeout(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message;
  if (/connect(ion)? timed out|failed to connect/i.test(message)) return false;
  return /timed out|timeout/i.test(message);
}
