const { getClient, getSystemClient } = require('../db/poolManager');
const { log } = require('../config/logging'); // Import log

async function createUser(userId, email, hashedPassword, full_name) {
  const client = await getSystemClient(); // System client for user creation
  try {
    await client.query('BEGIN'); // Start transaction for atomicity

    // Insert into auth.users
    await client.query(
      'INSERT INTO auth.users (id, email, password_hash, created_at, updated_at) VALUES ($1, $2, $3, now(), now())',
      [userId, email, hashedPassword]
    );

    // Insert into profiles
    await client.query(
      'INSERT INTO profiles (id, full_name, created_at, updated_at) VALUES ($1, $2, now(), now())',
      [userId, full_name]
    );

    // Insert into user_goals
    await client.query(
      'INSERT INTO user_goals (user_id, created_at, updated_at) VALUES ($1, now(), now())',
      [userId]
    );

    await client.query('COMMIT'); // Commit transaction
    return userId;
  } catch (error) {
    await client.query('ROLLBACK'); // Rollback on error
    throw error;
  } finally {
    client.release();
  }
}

async function findUserByEmail(email) {
  const client = await getSystemClient(); // System client for finding user by email (authentication)
  try {
    const result = await client.query(
      'SELECT id, email, password_hash, role, is_active, mfa_secret, mfa_totp_enabled, mfa_email_enabled, mfa_recovery_codes, mfa_enforced, magic_link_token, magic_link_expires FROM auth.users WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function findUserById(userId) {
  const client = await getSystemClient(); // System client for finding user by ID (authentication/admin)
  try {
    const result = await client.query(
      'SELECT id, email, role, created_at, mfa_secret, mfa_totp_enabled, mfa_email_enabled, mfa_recovery_codes, mfa_enforced, magic_link_token, magic_link_expires, email_mfa_code, email_mfa_expires_at FROM auth.users WHERE id = $1',
      [userId]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function findUserIdByEmail(email) {
  const client = await getSystemClient(); // System client for finding user ID by email (authentication)
  try {
    const result = await client.query(
      'SELECT id FROM auth.users WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function generateApiKey(userId, newApiKey, description) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `INSERT INTO user_api_keys (user_id, api_key, description, permissions, created_at, updated_at)
       VALUES ($1, $2, $3, $4, now(), now()) RETURNING id, api_key, description, created_at, is_active`,
      [userId, newApiKey, description, { health_data_write: true }] // Default permission
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function deleteApiKey(apiKeyId, userId) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      'DELETE FROM user_api_keys WHERE id = $1 AND user_id = $2 RETURNING id',
      [apiKeyId, userId]
    );
    return result.rowCount > 0;
  } finally {
    client.release();
  }
}

async function getAccessibleUsers(userId) {
  const client = await getSystemClient(); // System client for bypassing RLS
  try {
    const result = await client.query(
      `SELECT
         fa.owner_user_id AS user_id,
         p.full_name,
         au.email AS email,
         fa.access_permissions AS permissions,
         fa.access_end_date
       FROM family_access fa
       JOIN profiles p ON p.id = fa.owner_user_id
       JOIN auth.users au ON au.id = fa.owner_user_id
       WHERE fa.family_user_id = $1
         AND fa.is_active = TRUE
         AND (fa.access_end_date IS NULL OR fa.access_end_date > NOW())`,
      [userId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function getUserProfile(userId) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `SELECT id, full_name, phone_number, TO_CHAR(date_of_birth, 'YYYY-MM-DD') AS date_of_birth, bio, avatar_url, gender FROM profiles WHERE id = $1`,
      [userId]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function updateUserProfile(userId, full_name, phone_number, date_of_birth, bio, avatar_url, gender) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `UPDATE profiles
       SET full_name = COALESCE($2, full_name),
           phone_number = COALESCE($3, phone_number),
           date_of_birth = COALESCE($4, date_of_birth),
           bio = COALESCE($5, bio),
           avatar_url = COALESCE($6, avatar_url),
           gender = COALESCE($7, gender),
           updated_at = now()
        WHERE id = $1
        RETURNING *`,
      [userId, full_name, phone_number, date_of_birth, bio, avatar_url, gender]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function getUserApiKeys(userId) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      'SELECT id, description, api_key, created_at, last_used_at, is_active FROM user_api_keys WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function updateUserPassword(userId, hashedPassword) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      'UPDATE auth.users SET password_hash = $1, updated_at = now() WHERE id = $2 RETURNING id',
      [hashedPassword, userId]
    );
    return result.rowCount > 0;
  } finally {
    client.release();
  }
}

async function updateUserEmail(userId, newEmail) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      'UPDATE auth.users SET email = $1, updated_at = now() WHERE id = $2 RETURNING id',
      [newEmail, userId]
    );
    return result.rowCount > 0;
  } finally {
    client.release();
  }
}

async function getUserRole(userId) {
  const client = await getSystemClient(); // System client for getting user role (admin check)
  try {
    const result = await client.query(
      'SELECT role FROM auth.users WHERE id = $1',
      [userId]
    );
    return result.rows[0] ? result.rows[0].role : null;
  } finally {
    client.release();
  }
}

async function updateUserRole(userId, role) {
  const client = await getSystemClient(); // System client for updating user role (admin operation)
  try {
    const result = await client.query(
      'UPDATE auth.users SET role = $1, updated_at = now() WHERE id = $2 RETURNING id',
      [role, userId]
    );
    return result.rowCount > 0;
  } finally {
    client.release();
  }
}

async function createOidcUser(userId, email, fullName, providerId, oidcSub) {
    const client = await getSystemClient(); // System client for OIDC user creation
    try {
        await client.query('BEGIN');

        // Insert into auth.users for OIDC
        const userResult = await client.query(
            `INSERT INTO auth.users (id, email, password_hash, created_at, updated_at)
             VALUES ($1, $2, '', now(), now()) RETURNING id`,
            [userId, email]
        );
        const newUserId = userResult.rows[0].id;

        // Insert into profiles
        await client.query(
            'INSERT INTO profiles (id, full_name, created_at, updated_at) VALUES ($1, $2, now(), now())',
            [newUserId, fullName]
        );

        // Insert into user_goals
        await client.query(
            'INSERT INTO user_goals (user_id, created_at, updated_at) VALUES ($1, now(), now())',
            [newUserId]
        );

        // Link the new user to the OIDC provider
        await client.query(
            'INSERT INTO user_oidc_links (user_id, oidc_provider_id, oidc_sub) VALUES ($1, $2, $3)',
            [newUserId, providerId, oidcSub]
        );

        await client.query('COMMIT');
        return newUserId;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

async function findUserOidcLink(userId, providerId) {
    const client = await getSystemClient(); // System client for finding OIDC link (authentication)
    try {
        const result = await client.query(
            'SELECT * FROM user_oidc_links WHERE user_id = $1 AND oidc_provider_id = $2',
            [userId, providerId]
        );
        return result.rows[0];
    } finally {
        client.release();
    }
}


async function createUserOidcLink(userId, providerId, oidcSub) {
    const client = await getSystemClient(); // System client for creating OIDC link
    try {
        await client.query(
            'INSERT INTO user_oidc_links (user_id, oidc_provider_id, oidc_sub) VALUES ($1, $2, $3)',
            [userId, providerId, oidcSub]
        );
    } finally {
        client.release();
    }
}

async function findUserByOidcSub(oidcSub, providerId) {
    const client = await getSystemClient(); // System client for finding user by OIDC sub (authentication)
    try {
        const result = await client.query(
            `SELECT u.id, u.email, u.role, u.is_active
             FROM auth.users u
             JOIN user_oidc_links oidc ON u.id = oidc.user_id
             WHERE oidc.oidc_sub = $1 AND oidc.oidc_provider_id = $2`,
            [oidcSub, providerId]
        );
        return result.rows[0];
    } finally {
        client.release();
    }
}

async function updateUserOidcLink(linkId, newOidcSub) {
    const client = await getSystemClient(); // System client for updating OIDC link
    try {
        await client.query(
            'UPDATE user_oidc_links SET oidc_sub = $1, updated_at = NOW() WHERE id = $2',
            [newOidcSub, linkId]
        );
    } finally {
        client.release();
    }
}

async function updatePasswordResetToken(userId, token, expires) {
  const client = await getSystemClient(); // System client for password reset token management
  try {
    const result = await client.query(
      'UPDATE auth.users SET password_reset_token = $1, password_reset_expires = $2, updated_at = now() WHERE id = $3 RETURNING id',
      [token, expires, userId]
    );
    return result.rowCount > 0;
  } finally {
    client.release();
  }
}

async function findUserByPasswordResetToken(token) {
  const client = await getSystemClient(); // System client for password reset token lookup
  try {
    const result = await client.query(
      'SELECT id, email, password_hash, password_reset_expires FROM auth.users WHERE password_reset_token = $1 AND to_timestamp(password_reset_expires / 1000) > NOW()',
      [token]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function updateUserLastLogin(userId) {
  const client = await getSystemClient(); // System client for updating last login
  try {
    await client.query(
      'UPDATE auth.users SET last_login_at = now() WHERE id = $1',
      [userId]
    );
  } finally {
    client.release();
  }
}

async function getAllUsers(limit, offset, searchTerm) {
  const client = await getSystemClient(); // System client for getting all users (admin operation)
  try {
    let query = `
      SELECT
        au.id,
        au.email,
        au.role,
        au.is_active,
        au.created_at,
        au.last_login_at,
        p.full_name
      FROM auth.users au
      LEFT JOIN profiles p ON au.id = p.id
    `;
    const params = [];
    let whereClause = '';

    if (searchTerm) {
      whereClause += ` WHERE LOWER(au.email) LIKE LOWER($${params.length + 1}) OR LOWER(p.full_name) LIKE LOWER($${params.length + 1}) `;
      params.push(`%${searchTerm}%`);
    }

    query += whereClause;
    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await client.query(query, params);
    return result.rows;
  } finally {
    client.release();
  }
}

async function deleteUser(userId) {
  const client = await getSystemClient(); // System client for deleting user (admin operation)
  try {
    await client.query('BEGIN');

    // Delete from tables that have a direct foreign key to auth.users with CASCADE DELETE
    // For tables without CASCADE DELETE, or for more complex logic, explicit deletion is needed.
    // Based on the schema, profiles, user_goals, user_api_keys should have CASCADE DELETE.
    // We might need to explicitly delete from other tables if they don't have CASCADE.

    // Example: Delete from profiles (assuming CASCADE DELETE is set up)
    await client.query('DELETE FROM profiles WHERE id = $1', [userId]);

    // Example: Delete from user_goals (assuming CASCADE DELETE is set up)
    await client.query('DELETE FROM user_goals WHERE user_id = $1', [userId]);

    // Example: Delete from user_api_keys (assuming CASCADE DELETE is set up)
    await client.query('DELETE FROM user_api_keys WHERE user_id = $1', [userId]);

    // Delete from auth.users (this should trigger cascades for other tables if configured)
    const result = await client.query('DELETE FROM auth.users WHERE id = $1 RETURNING id', [userId]);

    await client.query('COMMIT');
    return result.rowCount > 0;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function updateUserStatus(userId, isActive) {
  const client = await getSystemClient(); // System client for updating user status (admin operation)
  try {
    const result = await client.query(
      'UPDATE auth.users SET is_active = $1, updated_at = now() WHERE id = $2 RETURNING id',
      [isActive, userId]
    );
    return result.rowCount > 0;
  } finally {
    client.release();
  }
}

async function updateUserFullName(userId, fullName) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      'UPDATE profiles SET full_name = $1, updated_at = now() WHERE id = $2 RETURNING id',
      [fullName, userId]
    );
    return result.rowCount > 0;
  } finally {
    client.release();
  }
}

async function updateUserMfaSettings(userId, mfaSecret, mfaTotpEnabled, mfaEmailEnabled, mfaRecoveryCodes, mfaEnforced, emailMfaCode, emailMfaExpiresAt) {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      `UPDATE auth.users
       SET mfa_secret = COALESCE($1, mfa_secret),
           mfa_totp_enabled = COALESCE($2, mfa_totp_enabled),
           mfa_email_enabled = COALESCE($3, mfa_email_enabled),
           mfa_recovery_codes = $4,
           mfa_enforced = COALESCE($5, mfa_enforced),
           email_mfa_code = $6,
           email_mfa_expires_at = $7,
           updated_at = now()
        WHERE id = $8 RETURNING id`,
      [mfaSecret, mfaTotpEnabled, mfaEmailEnabled, mfaRecoveryCodes, mfaEnforced, emailMfaCode, emailMfaExpiresAt, userId]
    );
    log('debug', `Executing query for userId ${userId} with parameters:`, { mfaSecret, mfaTotpEnabled, mfaEmailEnabled, mfaRecoveryCodes, mfaEnforced, emailMfaCode, emailMfaExpiresAt, userId });
    return result.rowCount > 0;
  } finally {
    client.release();
  }
}

async function getMfaSettings(userId) {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      'SELECT mfa_secret, mfa_totp_enabled, mfa_email_enabled, mfa_recovery_codes, mfa_enforced, email_mfa_code, email_mfa_expires_at FROM auth.users WHERE id = $1',
      [userId]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function setMfaEnforced(userId, mfaEnforced) {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      'UPDATE auth.users SET mfa_enforced = $1, updated_at = now() WHERE id = $2 RETURNING id',
      [mfaEnforced, userId]
    );
    return result.rowCount > 0;
  } finally {
    client.release();
  }
}

async function storeMagicLinkToken(userId, token, expires) {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      'UPDATE auth.users SET magic_link_token = $1, magic_link_expires = $2, updated_at = now() WHERE id = $3 RETURNING id',
      [token, expires, userId]
    );
    return result.rowCount > 0;
  } finally {
    client.release();
  }
}

async function getMagicLinkToken(token) {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      'SELECT id, email, magic_link_expires, mfa_totp_enabled, mfa_email_enabled, mfa_enforced FROM auth.users WHERE magic_link_token = $1',
      [token]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function clearMagicLinkToken(userId) {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      'UPDATE auth.users SET magic_link_token = NULL, magic_link_expires = NULL, updated_at = now() WHERE id = $1 RETURNING id',
      [userId]
    );
    return result.rowCount > 0;
  } finally {
    client.release();
  }
}

async function isOidcUser(userId) {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      'SELECT EXISTS (SELECT 1 FROM public.user_oidc_links WHERE user_id = $1) AS is_oidc_user',
      [userId]
    );
    return result.rows[0].is_oidc_user;
  } finally {
    client.release();
  }
}


module.exports = {
  createUser,
  createOidcUser,
  findUserByEmail,
  findUserById,
  findUserIdByEmail,
  generateApiKey,
  deleteApiKey,
  getAccessibleUsers,
  getUserProfile,
  updateUserProfile,
  getUserApiKeys,
  updateUserPassword,
  updateUserEmail,
  getUserRole,
  updateUserRole,
  updatePasswordResetToken,
  findUserByPasswordResetToken,
  findUserOidcLink,
  createUserOidcLink,
  findUserByOidcSub,
  updateUserLastLogin,
  getAllUsers,
  deleteUser,
  updateUserStatus,
  updateUserFullName,
  updateUserOidcLink,
  updateUserMfaSettings,
  getMfaSettings,
  setMfaEnforced,
  storeMagicLinkToken,
  getMagicLinkToken,
  clearMagicLinkToken,
  isOidcUser,
};