import foodRepository from '../../models/foodRepository.js';
import { actorUserIdFor } from '../../db/poolManager.js';

// Window for tool-layer exact-name matching over the server's substring
// search. An exact match could fall outside it only when more than this many
// foods contain the searched name as a substring.
export const NAME_RESOLUTION_WINDOW = 500;

// Case-insensitive exact name lookup (MCP's `name ILIKE $1` without
// wildcards). Returns the raw catalog row including default_variant.
export async function findFoodByExactName(userId: string, name: string) {
  const rows = await foodRepository.getFoodsWithPagination(
    name,
    null,
    userId,
    NAME_RESOLUTION_WINDOW,
    0,
    null
  );
  const matches = rows.filter(
    (r: { name: unknown }) =>
      String(r.name).toLowerCase() === name.toLowerCase()
  );
  // In a family member's account the search also returns the signed-in
  // person's own foods; one of the account owner's wins a tie by name.
  if (actorUserIdFor(userId) !== userId) {
    const owned = matches.find(
      (r: { user_id?: string | null }) => r.user_id === userId
    );
    if (owned) return owned;
  }
  return matches[0];
}
