// Utility to sync user roles based on OIDC groups found in the id_token.

const { jwtDecode } = require('jwt-decode');

/**
 * Syncs user roles based on OIDC groups found in the id_token.
 * @param {Object} deps Dependencies: { pool, userRepository }
 * @param {string} userId The user ID to sync
 * @param {string} adminGroup The OIDC group name that grants admin access
 */
async function syncUserGroups(deps, userId, adminGroup) {
    const { pool, userRepository } = deps;

    if (!adminGroup) return;

    try {
        const { rows: allAccounts } = await pool.query(
            'SELECT provider_id, id_token FROM "account" WHERE user_id = $1 ORDER BY updated_at DESC',
            [userId]
        );

        const oidcAccount = allAccounts.find(a => a.id_token);

        if (!oidcAccount) {
            console.log(`[AUTH] OIDC Sync: No account with id_token found for user ${userId}. Skipping group sync.`);
            return;
        }

        if (oidcAccount?.id_token) {
            try {
                const payload = jwtDecode(oidcAccount.id_token);
                const groupsClaim = payload.groups || [];
                const groups = Array.isArray(groupsClaim) ? groupsClaim : [groupsClaim];

                const currentRole = await userRepository.getUserRole(userId);

                if (groups.includes(adminGroup)) {
                    if (currentRole !== 'admin') {
                        console.log(`[AUTH] OIDC Sync: Promoting user ${userId} to admin (Group: ${adminGroup})`);
                        await userRepository.updateUserRole(userId, 'admin');
                    }
                } else {
                    if (currentRole === 'admin') {
                        console.log(`[AUTH] OIDC Sync: Revoking admin from user ${userId} (Not in group: ${adminGroup})`);
                        await userRepository.updateUserRole(userId, 'user');
                    }
                }
            } catch (e) {
                console.error(`[AUTH] OIDC Sync: Failed to decode id_token for user ${userId}:`, e);
            }
        }
    } catch (err) {
        console.error(`[AUTH] OIDC Group Sync Error for user ${userId}:`, err);
    }
}

module.exports = { syncUserGroups };
