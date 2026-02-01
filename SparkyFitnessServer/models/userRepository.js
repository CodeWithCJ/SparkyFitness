const { getClient, getSystemClient } = require('../db/poolManager');
const { log } = require('../config/logging'); // Import log

async function createUser(userId, email, hashedPassword, full_name) {
  const client = await getSystemClient(); // System client for user creation
  try {
    await client.query('BEGIN'); // Start transaction for atomicity

    // Insert into "user"
    await client.query(
      'INSERT INTO "user" (id, email, name, created_at, updated_at) VALUES ($1, $2, $3, now(), now())',
      [userId, email, full_name]
    );

    // Insert into "account" for email/password
    await client.query(
      'INSERT INTO "account" (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES (gen_random_uuid(), $1, $2, $3, $4, now(), now())',
      [email, 'credential', userId, hashedPassword]
    );

    // Initialize profile and goals safely
    await ensureUserInitialization(userId, full_name, client);

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
      `SELECT u.id, u.email, acc.password AS password_hash, u.role, true as is_active, p.full_name
       FROM "user" u
       LEFT JOIN "account" acc ON u.id = acc.user_id AND acc.provider_id = 'credential'
       LEFT JOIN profiles p ON u.id = p.id
       WHERE LOWER(u.email) = LOWER($1)
       ORDER BY p.full_name IS NOT NULL DESC, u.created_at DESC`,
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
      `SELECT u.id, u.email, u.role, u.created_at, p.full_name,
              tf.secret as mfa_secret,
              u.two_factor_enabled as mfa_totp_enabled,
              u.mfa_email_enabled,
              tf.backup_codes as mfa_recovery_codes,
              u.mfa_enforced,
              u.email_mfa_code, u.email_mfa_expires_at
       FROM "user" u
       LEFT JOIN profiles p ON u.id = p.id
       LEFT JOIN two_factor tf ON u.id = tf.user_id
       WHERE u.id = $1`,
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
      'SELECT id FROM "user" WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    return result.rows[0];
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
         u.email AS email,
         fa.access_permissions AS permissions,
         fa.access_end_date
       FROM family_access fa
       JOIN profiles p ON p.id = fa.owner_user_id
       JOIN "user" u ON u.id = fa.owner_user_id
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


async function updateUserPassword(userId, hashedPassword) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      'UPDATE "account" SET password = $1, updated_at = now() WHERE user_id = $2 AND provider_id = \'credential\' RETURNING user_id',
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
    await client.query('BEGIN');
    await client.query(
      'UPDATE "user" SET email = $1, updated_at = now() WHERE id = $2',
      [newEmail, userId]
    );
    await client.query(
      'UPDATE "account" SET account_id = $1, updated_at = now() WHERE user_id = $2 AND provider_id = \'credential\'',
      [newEmail, userId]
    );
    await client.query('COMMIT');
    return true;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function getUserRole(userId) {
  const client = await getSystemClient(); // System client for getting user role (admin check)
  try {
    const result = await client.query(
      'SELECT role FROM "user" WHERE id = $1',
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
      'UPDATE "user" SET role = $1, updated_at = now() WHERE id = $2 RETURNING id',
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

    // Insert into "user"
    const userResult = await client.query(
      `INSERT INTO "user" (id, email, created_at, updated_at)
             VALUES ($1, $2, now(), now()) RETURNING id`,
      [userId, email]
    );
    const newUserId = userResult.rows[0].id;

    // Initialize profile and goals safely
    await ensureUserInitialization(newUserId, fullName, client);

    // Link the new user to the OIDC provider (account table)
    await client.query(
      'INSERT INTO "account" (id, account_id, provider_id, user_id, created_at, updated_at) VALUES (gen_random_uuid(), $1, $2, $3, now(), now())',
      [oidcSub, 'oidc-' + providerId, newUserId]
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
      'SELECT * FROM "account" WHERE user_id = $1 AND provider_id = $2',
      [userId, 'oidc-' + providerId]
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
      'INSERT INTO "account" (id, account_id, provider_id, user_id, created_at, updated_at) VALUES (gen_random_uuid(), $1, $2, $3, now(), now())',
      [oidcSub, 'oidc-' + providerId, userId]
    );
  } finally {
    client.release();
  }
}

async function findUserByOidcSub(oidcSub, providerId) {
  const client = await getSystemClient(); // System client for finding user by OIDC sub (authentication)
  try {
    const result = await client.query(
      `SELECT u.id, u.email, u.role, true as is_active
             FROM "user" u
             JOIN "account" acc ON u.id = acc.user_id
             WHERE acc.account_id = $1 AND acc.provider_id = $2`,
      [oidcSub, 'oidc-' + providerId]
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
      'UPDATE "account" SET account_id = $1, updated_at = NOW() WHERE id = $2',
      [newOidcSub, linkId]
    );
  } finally {
    client.release();
  }
}

async function updatePasswordResetToken(userId, token, expires) {
  const client = await getSystemClient();
  try {
    // Legacy support: Better Auth uses its own system. 
    // We return true to avoid breaking callers during transition.
    return true;
  } finally {
    client.release();
  }
}

async function findUserByPasswordResetToken(token) {
  const client = await getSystemClient(); // System client for password reset token lookup
  try {
    const result = await client.query(
      'SELECT id, email FROM "user" WHERE id = (SELECT user_id FROM "verification" WHERE value = $1 AND expires_at > NOW())',
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
      'UPDATE "user" SET updated_at = now() WHERE id = $1', // Better Auth doesn't have last_login_at by default
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
        u.id,
        u.email,
        u.role,
        true as is_active,
        u.created_at,
        p.full_name
      FROM "user" u
      LEFT JOIN profiles p ON u.id = p.id
    `;
    const params = [];
    let whereClause = '';

    if (searchTerm) {
      whereClause += ` WHERE LOWER(u.email) LIKE LOWER($${params.length + 1}) OR LOWER(p.full_name) LIKE LOWER($${params.length + 1}) `;
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
    // Delete from "user" (this should trigger cascades for session, account, etc.)
    const result = await client.query('DELETE FROM "user" WHERE id = $1 RETURNING id', [userId]);

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
      'UPDATE "user" SET updated_at = now() WHERE id = $2 RETURNING id',
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
    const query = `
      UPDATE "user"
      SET two_factor_enabled = COALESCE($2, two_factor_enabled),
          mfa_email_enabled = COALESCE($3, mfa_email_enabled),
          mfa_enforced = COALESCE($4, mfa_enforced),
          email_mfa_code = COALESCE($5, email_mfa_code),
          email_mfa_expires_at = COALESCE($6, email_mfa_expires_at),
          updated_at = now()
      WHERE id = $1
      RETURNING id
    `;
    const result = await client.query(query, [
      userId,
      mfaTotpEnabled,
      mfaEmailEnabled,
      mfaEnforced,
      emailMfaCode,
      emailMfaExpiresAt
    ]);

    // Handle two_factor table updates
    if (mfaSecret !== undefined || mfaRecoveryCodes !== undefined) {
      const twoFactorQuery = `
        INSERT INTO "two_factor" (id, user_id, secret, backup_codes, created_at, updated_at)
        VALUES (gen_random_uuid(), $1, $2, $3, now(), now())
        ON CONFLICT (user_id) DO UPDATE SET
          secret = COALESCE($2, EXCLUDED.secret),
          backup_codes = COALESCE($3, EXCLUDED.backup_codes),
          updated_at = now()
      `;
      await client.query(twoFactorQuery, [userId, mfaSecret, mfaRecoveryCodes]);
    }

    return result.rowCount > 0;
  } finally {
    client.release();
  }
}

async function getMfaSettings(userId) {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      'SELECT two_factor_enabled, mfa_email_enabled, mfa_enforced FROM "user" WHERE id = $1',
      [userId]
    );
    const settings = result.rows[0];
    return {
      totp_enabled: settings?.two_factor_enabled || false,
      email_mfa_enabled: settings?.mfa_email_enabled || false,
      mfa_enforced: settings?.mfa_enforced || false
    };
  } finally {
    client.release();
  }
}

async function isOidcUser(userId) {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      'SELECT EXISTS (SELECT 1 FROM "account" WHERE user_id = $1 AND provider_id LIKE \'oidc-%\') AS is_oidc_user',
      [userId]
    );
    return result.rows[0].is_oidc_user;
  } finally {
    client.release();
  }
}

async function ensureUserInitialization(userId, fullName, existingClient = null) {
  const client = existingClient || await getSystemClient();
  try {
    if (!existingClient) await client.query('BEGIN');

    // Ensure profile exists
    await client.query(
      'INSERT INTO profiles (id, full_name, created_at, updated_at) ' +
      'SELECT $1, $2, now(), now() WHERE NOT EXISTS (SELECT 1 FROM profiles WHERE id = $1)',
      [userId, fullName]
    );

    // Ensure user_goals exists (the base goal with NULL date)
    await client.query(
      'INSERT INTO user_goals (user_id, created_at, updated_at) ' +
      'SELECT $1, now(), now() WHERE NOT EXISTS (SELECT 1 FROM user_goals WHERE user_id = $1 AND goal_date IS NULL)',
      [userId]
    );

    // Ensure onboarding_status exists
    await client.query(
      'INSERT INTO onboarding_status (user_id, onboarding_complete, created_at, updated_at) ' +
      'SELECT $1, FALSE, now(), now() WHERE NOT EXISTS (SELECT 1 FROM onboarding_status WHERE user_id = $1)',
      [userId]
    );

    if (!existingClient) await client.query('COMMIT');
  } catch (error) {
    if (!existingClient) await client.query('ROLLBACK');
    throw error;
  } finally {
    if (!existingClient) client.release();
  }
}

module.exports = {
  createUser,
  createOidcUser,
  findUserByEmail,
  findUserById,
  findUserIdByEmail,
  getAccessibleUsers,
  getUserProfile,
  updateUserProfile,
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
  isOidcUser,
  ensureUserInitialization,
};
