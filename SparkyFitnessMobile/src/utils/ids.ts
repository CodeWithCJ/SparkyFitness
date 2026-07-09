import * as Crypto from 'expo-crypto';

/**
 * Generate an RFC4122 v4 UUID for client-created records that carry a stable id
 * from birth (e.g. a mid-workout exercise entry). `exercise_entries.id` is a
 * server `uuid` column and the request schema accepts an optional client uuid,
 * so a client-minted id round-trips unchanged instead of being reassigned on the
 * first save. `expo-crypto` is JS-only config — no prebuild required.
 */
export function newUuid(): string {
  return Crypto.randomUUID();
}
