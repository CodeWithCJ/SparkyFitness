import userRepository from '../models/userRepository.js';

// Loose shape of the Better Auth user object that may be attached to a request.
type AdminUser = { email?: unknown; role?: unknown } | null | undefined;

/**
 * Single source of truth for the admin predicate: a super-admin email wins,
 * else the AUTHENTICATED user's role must be 'admin'. Compute role first —
 * `user?.role || getUserRole() === 'admin'` mis-parses as truthy. Leaf module
 * (only userRepository + process.env) so importers skip the auth.ts graph.
 */
export async function resolveIsAdmin(
  user: AdminUser,
  authenticatedUserId: string
): Promise<boolean> {
  const adminEmail = process.env.SPARKY_FITNESS_ADMIN_EMAIL;
  if (adminEmail && user?.email === adminEmail) {
    return true;
  }
  // No authenticated id ⇒ not admin; skip a pointless (and for '' a throwing) role lookup.
  if (!authenticatedUserId) {
    return false;
  }
  const role =
    user?.role || (await userRepository.getUserRole(authenticatedUserId));
  return role === 'admin';
}
