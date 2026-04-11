import { decodeJwt } from 'jose';
import { log } from '../config/logging.js';
/**
 * Syncs user roles based on OIDC groups found in the id_token or UserInfo endpoint.
 * @param {Object} deps Dependencies: { pool, userRepository, oidcProviderRepository }
 * @param {string} userId The user ID to sync
 * @param {string} adminGroup The OIDC group name that grants admin access
 * @param {string} [providerId] Optional provider ID to help fetch UserInfo if id_token is insufficient
 */

async function syncUserGroups(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deps: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminGroup: any,
  providerId = null
) {
  const { pool, userRepository, oidcProviderRepository } = deps;
  if (!adminGroup) return;
  try {
    const { rows: allAccounts } = await pool.query(
      'SELECT provider_id, id_token, access_token FROM "account" WHERE user_id = $1 ORDER BY updated_at DESC',
      [userId]
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const oidcAccount = allAccounts.find((a: any) =>
      a.provider_id.startsWith('oidc-')
    );
    if (!oidcAccount) {
      log(
        'info',
        `[AUTH] OIDC Sync: No OIDC account found for user ${userId}. Skipping group sync.`
      );
      return;
    }
    let groups = [];
    let decodedPayload = null;
    // 1. Try id_token first
    if (oidcAccount.id_token) {
      try {
        decodedPayload = decodeJwt(oidcAccount.id_token);
        // Check expiration
        const now = Math.floor(Date.now() / 1000);
        if (decodedPayload.exp && decodedPayload.exp < now) {
          log(
            'info',
            `[AUTH] OIDC Sync: Token expired for user ${userId}. Skipping group sync.`
          );
          return;
        }
        const groupsClaim = decodedPayload.groups || [];
        groups = Array.isArray(groupsClaim)
          ? groupsClaim.filter(Boolean)
          : groupsClaim
            ? [groupsClaim]
            : [];
      } catch (e) {
        log(
          'error',
          `[AUTH] OIDC Sync: Failed to decode id_token for user ${userId}:`,
          e
        );
      }
    }
    // 2. If no groups found in id_token and we have an access_token, try UserInfo
    if (
      groups.length === 0 &&
      oidcAccount.access_token &&
      oidcProviderRepository
    ) {
      try {
        const pid = providerId || oidcAccount.provider_id.replace('oidc-', '');
        const provider = await oidcProviderRepository.getOidcProviderById(pid);
        if (provider && provider.userInfoEndpoint) {
          log(
            'info',
            `[AUTH] OIDC Sync: No groups in id_token. Fetching from UserInfo: ${provider.userInfoEndpoint}`
          );
          const response = await fetch(provider.userInfoEndpoint, {
            headers: { Authorization: `Bearer ${oidcAccount.access_token}` },
          });
          if (response.ok) {
            const userInfo = await response.json();
            const groupsClaim = userInfo.groups || [];
            groups = Array.isArray(groupsClaim)
              ? groupsClaim.filter(Boolean)
              : groupsClaim
                ? [groupsClaim]
                : [];
            log(
              'info',
              `[AUTH] OIDC Sync: Fetched ${groups.length} groups from UserInfo.`
            );
          }
        }
      } catch (error) {
        log('error', '[AUTH] OIDC Sync: UserInfo fetch failed:', error);
      }
    }
    // 3. Process the groups (even if empty, we might need to revoke admin)
    const currentRole = await userRepository.getUserRole(userId);
    if (groups.includes(adminGroup)) {
      if (currentRole !== 'admin') {
        log(
          'info',
          `[AUTH] OIDC Sync: Promoting user ${userId} to admin (Group: ${adminGroup})`
        );
        await userRepository.updateUserRole(userId, 'admin');
      }
    } else {
      // If we have any valid login signal (id_token decoded or UserInfo fetched)
      // but no admin group, ensure they are just a 'user'.
      if (currentRole === 'admin') {
        log(
          'info',
          `[AUTH] OIDC Sync: Revoking admin from user ${userId} (Not in group: ${adminGroup})`
        );
        await userRepository.updateUserRole(userId, 'user');
      }
    }
  } catch (err) {
    log('error', `[AUTH] OIDC Group Sync Error for user ${userId}:`, err);
  }
}
export { syncUserGroups };
export default {
  syncUserGroups,
};
