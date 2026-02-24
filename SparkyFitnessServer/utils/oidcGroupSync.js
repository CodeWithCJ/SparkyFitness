// Utility to sync user roles based on OIDC groups found in the id_token.

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
            'SELECT provider_id, id_token FROM "account" WHERE user_id = $1',
            [userId]
        );

        const oidcAccount = allAccounts.find(a => a.id_token);

        if (!oidcAccount) {
            console.log(`[AUTH] OIDC Sync: No account with id_token found for user ${userId}. Skipping group sync.`);
            return;
        }

        if (oidcAccount && oidcAccount.id_token) {
            const idToken = oidcAccount.id_token;
            const parts = idToken.split('.');
            if (parts.length < 2) return;

            const payloadBase64 = parts[1];
            if (payloadBase64) {
                // Use Buffer to decode base64url or base64
                const payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString());
                const groups = payload.groups || [];

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
            }
        }
    } catch (err) {
        console.error(`[AUTH] OIDC Group Sync Error for user ${userId}:`, err);
    }
}

module.exports = { syncUserGroups };
