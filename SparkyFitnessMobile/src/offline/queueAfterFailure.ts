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
  return queue();
}
