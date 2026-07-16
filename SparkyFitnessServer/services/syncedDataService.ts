import { log } from '../config/logging.js';
import {
  isUserOriginatedSource,
  getSyncedSourceSummary,
  deleteSyncedDataBySource,
} from '../models/syncedDataRepository.js';

// Lists the provider sources (garmin, healthkit, health_connect, ...) the user
// has synced entry data for, with per-table counts. Hand-entered data (the
// `manual` source and NULL) is excluded upstream in the repository.
async function getSyncedSources(userId: string) {
  return getSyncedSourceSummary(userId);
}

// Deletes all of the user's synced entries that came from a single provider
// source, across every synced entry table, in one transaction. Guards against
// the reserved `manual` source so hand-entered data can never be wiped here.
async function deleteSyncedSource(userId: string, source: string) {
  const trimmed = (source ?? '').trim();
  if (!trimmed) {
    throw new Error('A non-empty source is required.');
  }
  if (isUserOriginatedSource(trimmed)) {
    throw new Error('User-created data cannot be bulk-deleted here.');
  }
  try {
    return await deleteSyncedDataBySource(userId, trimmed);
  } catch (error) {
    log(
      'error',
      `Error in syncedDataService.deleteSyncedSource for user ${userId}, source '${trimmed}':`,
      error
    );
    throw error;
  }
}

export { getSyncedSources, deleteSyncedSource };
export default { getSyncedSources, deleteSyncedSource };
