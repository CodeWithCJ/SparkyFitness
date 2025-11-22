const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto'); // For generating secure tokens
const { JWT_SECRET, ENCRYPTION_KEY, encrypt, decrypt } = require('../security/encryption'); // Added encrypt and decrypt
const { TOTP, Secret } = require('otpauth'); // Import OTPAuth library
const userRepository = require('../models/userRepository');
const familyAccessRepository = require('../models/familyAccessRepository');
const oidcProviderRepository = require('../models/oidcProviderRepository');
const globalSettingsRepository = require('../models/globalSettingsRepository');
const adminActivityLogRepository = require('../models/adminActivityLogRepository'); // Import admin activity log repository
const { getClient, getSystemClient } = require('../db/poolManager');
const nutrientDisplayPreferenceService = require('./nutrientDisplayPreferenceService');
const { log } = require('../config/logging'); // Import log explicitly
const emailService = require('./emailService');

async function registerUser(email, password, full_name) {
  try {
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const userId = uuidv4();

    await userRepository.createUser(userId, email, hashedPassword, full_name);

    await nutrientDisplayPreferenceService.createDefaultNutrientPreferencesForUser(
      userId
    );

    const token = jwt.sign({ userId: userId }, JWT_SECRET, {
      expiresIn: "30d",
    });
    return { userId, token };
  } catch (error) {
    log("error", "Error during user registration in authService:", error);
    throw error;
  }
}

async function loginUser(email, password, loginSettings) {
  try {
    if (!loginSettings.email.enabled) {
      throw new Error("Email/Password login is disabled.");
    }

    const user = await userRepository.findUserByEmail(email);
    log('debug', `User object after findUserByEmail in loginUser:`, user);

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      throw new Error("Invalid credentials.");
    }

    if (!user.is_active) {
      throw new Error("Account is disabled. Please contact an administrator.");
    }

    // Update last login time
    await userRepository.updateUserLastLogin(user.id);

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
      expiresIn: "30d",
    });
    return { userId: user.id, token, role: user.role };
  } catch (error) {
    log("error", "Error during user login in authService:", error);
    throw error;
  }
}

async function getUser(authenticatedUserId) {
  try {
    const user = await userRepository.findUserById(authenticatedUserId);
    if (!user) {
      throw new Error("User not found.");
    }
    return user;
  } catch (error) {
    log(
      "error",
      `Error fetching user ${authenticatedUserId} in authService:`,
      error
    );
    throw error;
  }
}

async function findUserIdByEmail(email) {
  try {
    const user = await userRepository.findUserIdByEmail(email);
    if (!user) {
      throw new Error("User not found.");
    }
    return user.id;
  } catch (error) {
    log("error", `Error finding user by email ${email} in authService:`, error);
    throw error;
  }
}

async function generateUserApiKey(
  authenticatedUserId,
  targetUserId,
  description
) {
  try {
    const newApiKey = uuidv4();
    const apiKey = await userRepository.generateApiKey(
      targetUserId,
      newApiKey,
      description
    );
    return apiKey;
  } catch (error) {
    log(
      "error",
      `Error generating API key for user ${targetUserId} in authService:`,
      error
    );
    throw error;
  }
}

async function deleteUserApiKey(authenticatedUserId, targetUserId, apiKeyId) {
  try {
    const success = await userRepository.deleteApiKey(apiKeyId, targetUserId);
    if (!success) {
      throw new Error("API Key not found or not authorized for deletion.");
    }
    return true;
  } catch (error) {
    log(
      "error",
      `Error deleting API key ${apiKeyId} for user ${targetUserId} in authService:`,
      error
    );
    throw error;
  }
}

async function getAccessibleUsers(authenticatedUserId) {
  try {
    const users = await userRepository.getAccessibleUsers(authenticatedUserId);
    return users;
  } catch (error) {
    log(
      "error",
      `Error fetching accessible users for user ${authenticatedUserId} in authService:`,
      error
    );
    throw error;
  }
}

async function getUserProfile(authenticatedUserId, targetUserId) {
  try {
    const profile = await userRepository.getUserProfile(targetUserId);
    return profile;
  } catch (error) {
    log(
      "error",
      `Error fetching profile for user ${targetUserId} in authService:`,
      error
    );
    throw error;
  }
}

async function updateUserProfile(
  authenticatedUserId,
  targetUserId,
  profileData
) {
  try {
    const updatedProfile = await userRepository.updateUserProfile(
      targetUserId,
      profileData.full_name,
      profileData.phone_number,
      profileData.date_of_birth,
      profileData.bio,
      profileData.avatar_url,
      profileData.gender
    );
    if (!updatedProfile) {
      throw new Error("Profile not found or no changes made.");
    }
    return updatedProfile;
  } catch (error) {
    log(
      "error",
      `Error updating profile for user ${targetUserId} in authService:`,
      error
    );
    throw error;
  }
}

async function getUserApiKeys(authenticatedUserId, targetUserId) {
  try {
    const apiKeys = await userRepository.getUserApiKeys(targetUserId);
    return apiKeys;
  } catch (error) {
    log(
      "error",
      `Error fetching API keys for user ${targetUserId} in authService:`,
      error
    );
    throw error;
  }
}

async function updateUserPassword(authenticatedUserId, newPassword) {
  try {
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    const success = await userRepository.updateUserPassword(
      authenticatedUserId,
      hashedPassword
    );
    if (!success) {
      throw new Error("User not found.");
    }
    return true;
  } catch (error) {
    log(
      "error",
      `Error updating password for user ${authenticatedUserId} in authService:`,
      error
    );
    throw error;
  }
}

async function updateUserEmail(authenticatedUserId, newEmail) {
  try {
    const existingUser = await userRepository.findUserByEmail(newEmail);
    if (existingUser && existingUser.id !== authenticatedUserId) {
      throw new Error("Email already in use by another account.");
    }
    const success = await userRepository.updateUserEmail(
      authenticatedUserId,
      newEmail
    );
    if (!success) {
      throw new Error("User not found.");
    }
    return true;
  } catch (error) {
    log(
      "error",
      `Error updating email for user ${authenticatedUserId} in authService:`,
      error
    );
    throw error;
  }
}

async function canAccessUserData(
  targetUserId,
  permissionType,
  authenticatedUserId
) {
  try {
    const client = await getClient(authenticatedUserId); // User-specific operation
    const result = await client.query(
      `SELECT public.can_access_user_data($1, $2, $3) AS can_access`,
      [targetUserId, permissionType, authenticatedUserId]
    );
    client.release();
    return result.rows[0].can_access;
  } catch (error) {
    log(
      "error",
      `Error checking access for user ${targetUserId} by ${authenticatedUserId} with permission ${permissionType} in authService:`,
      error
    );
    throw error;
  }
}

async function checkFamilyAccess(authenticatedUserId, ownerUserId, permission) {
  try {
    const hasAccess = await familyAccessRepository.checkFamilyAccessPermission(
      authenticatedUserId,
      ownerUserId,
      permission
    );
    return hasAccess;
  } catch (error) {
    log(
      "error",
      `Error checking family access for family user ${authenticatedUserId} and owner ${ownerUserId} with permission ${permission} in authService:`,
      error
    );
    throw error;
  }
}

async function getFamilyAccessEntries(authenticatedUserId) {
  try {
    // The RLS policy on the family_access table will ensure that only records
    // where the authenticated user is either the owner_user_id or the family_user_id are returned.
    const entries = await familyAccessRepository.getFamilyAccessEntriesByUserId(authenticatedUserId);
    return entries;
  } catch (error) {
    log('error', `Error fetching family access entries for user ${authenticatedUserId} in authService:`, error);
    throw error;
  }
}

async function createFamilyAccessEntry(authenticatedUserId, entryData) {
  try {
    const newEntry = await familyAccessRepository.createFamilyAccessEntry(
      authenticatedUserId, // Use authenticatedUserId as owner_user_id
      entryData.family_user_id,
      entryData.family_email,
      entryData.access_permissions,
      entryData.access_end_date,
      entryData.status
    );
    return newEntry;
  } catch (error) {
    log(
      "error",
      `Error creating family access entry for owner ${authenticatedUserId} in authService:`,
      error
    );
    throw error;
  }
}

async function updateFamilyAccessEntry(authenticatedUserId, id, updateData) {
  try {
    const updatedEntry = await familyAccessRepository.updateFamilyAccessEntry(
      id,
      authenticatedUserId, // Use authenticatedUserId as owner_user_id
      updateData.access_permissions,
      updateData.access_end_date,
      updateData.is_active,
      updateData.status
    );
    if (!updatedEntry) {
      throw new Error(
        "Family access entry not found or not authorized to update."
      );
    }
    return updatedEntry;
  } catch (error) {
    log(
      "error",
      `Error updating family access entry ${id} for owner ${authenticatedUserId} in authService:`,
      error
    );
    throw error;
  }
}

async function deleteFamilyAccessEntry(authenticatedUserId, id) {
  try {
    const success = await familyAccessRepository.deleteFamilyAccessEntry(
      id,
      authenticatedUserId
    ); // Use authenticatedUserId as owner_user_id
    if (!success) {
      throw new Error(
        "Family access entry not found or not authorized to delete."
      );
    }
    return true;
  } catch (error) {
    log(
      "error",
      `Error deleting family access entry ${id} for owner ${authenticatedUserId} in authService:`,
      error
    );
    throw error;
  }
}

async function getLoginSettings() {
    try {
        const globalSettings = await globalSettingsRepository.getGlobalSettings();
        const forceEmailLogin = process.env.SPARKY_FITNESS_FORCE_EMAIL_LOGIN === 'true';

        let emailEnabled = globalSettings ? globalSettings.enable_email_password_login : true;
        if (forceEmailLogin) {
            log('warn', 'SPARKY_FITNESS_FORCE_EMAIL_LOGIN is set, forcing email/password login to be enabled.');
            emailEnabled = true;
        }

        return {
            oidc: {
                enabled: globalSettings ? globalSettings.is_oidc_active : false,
            },
            email: {
                enabled: emailEnabled,
            },
        };
    } catch (error) {
        log('error', 'Error fetching login settings:', error);
        // In case of error, default to enabling email login as a safe fallback.
        return {
            oidc: { enabled: false },
            email: { enabled: true },
        };
    }
}

module.exports = {
  registerUser,
  registerOidcUser,
  loginUser,
  getLoginSettings,
  getUser,
  findUserIdByEmail,
  generateUserApiKey,
  deleteUserApiKey,
  getAccessibleUsers,
  getUserProfile,
  updateUserProfile,
  getUserApiKeys,
  updateUserPassword,
  updateUserEmail,
  canAccessUserData,
  checkFamilyAccess,
  getFamilyAccessEntries,
  createFamilyAccessEntry,
  updateFamilyAccessEntry,
  deleteFamilyAccessEntry,
  forgotPassword,
  resetPassword,
  getAllUsers,
  deleteUser,
  updateUserStatus,
  updateUserRole,
  updateUserFullName,
  logAdminAction,
  generateTotpSecret,
  verifyTotpCode,
  generateEmailMfaCode,
  sendEmailMfaCode,
  verifyEmailMfaCode,
  generateRecoveryCodes,
  verifyRecoveryCode,
  resetUserMfa,
  requestMagicLink,
  verifyMagicLink,
  getMfaStatus, // Add this line
  updateUserMfaSettings, // Add this line
};

async function registerOidcUser(email, fullName, providerId, oidcSub) {
    try {
        log('info', `Registering OIDC user: ${email} for provider ${providerId}`);
        const userId = uuidv4();
        const newUserId = await userRepository.createOidcUser(userId, email, fullName, providerId, oidcSub);
        await nutrientDisplayPreferenceService.createDefaultNutrientPreferencesForUser(newUserId);
        return newUserId;
    } catch (error) {
        log('error', 'Error during OIDC user registration in authService:', error);
        throw error;
    }
}

async function forgotPassword(email) {
  try {
    const user = await userRepository.findUserByEmail(email);
    if (!user) {
      // For security, don't reveal if the user exists or not
      log("info", `Password reset requested for non-existent email: ${email}`);
      return;
    }
    log("debug", `User object before sending email: ${JSON.stringify(user)}`);
    log("debug", `User found for password reset: ${JSON.stringify(user)}`);

    // Generate a secure, unique token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const passwordResetExpires = Date.now() + 3600000; // 1 hour from now

    await userRepository.updatePasswordResetToken(
      user.id,
      resetToken,
      passwordResetExpires
    );

    const resetUrl = `${process.env.SPARKY_FITNESS_FRONTEND_URL}/reset-password?token=${resetToken}`;
    await emailService.sendPasswordResetEmail(user.email, resetUrl);

    log(
      "info",
      `Password reset token generated and email sent to user: ${user.id}`
    );
  } catch (error) {
    log(
      "error",
      `Error in forgotPassword for email ${email} in authService:`,
      error
    );
    throw error;
  }
}

async function getAllUsers(limit, offset, searchTerm) {
  try {
    const users = await userRepository.getAllUsers(limit, offset, searchTerm);
    return users;
  } catch (error) {
    log("error", `Error fetching all users in authService:`, error);
    throw error;
  }
}

async function deleteUser(userId) {
  try {
    const success = await userRepository.deleteUser(userId);
    if (!success) {
      throw new Error("User not found or could not be deleted.");
    }
    return true;
  } catch (error) {
    log("error", `Error deleting user ${userId} in authService:`, error);
    throw error;
  }
}

async function updateUserStatus(userId, isActive) {
  try {
    const success = await userRepository.updateUserStatus(userId, isActive);
    if (!success) {
      throw new Error("User not found or status could not be updated.");
    }
    return true;
  } catch (error) {
    log(
      "error",
      `Error updating user status for user ${userId} in authService:`,
      error
    );
    throw error;
  }
}

async function updateUserRole(userId, role) {
  try {
    const success = await userRepository.updateUserRole(userId, role);
    if (!success) {
      throw new Error("User not found or role could not be updated.");
    }
    return true;
  } catch (error) {
    log(
      "error",
      `Error updating user role for user ${userId} in authService:`,
      error
    );
    throw error;
  }
}

async function updateUserFullName(userId, fullName) {
  try {
    const success = await userRepository.updateUserFullName(userId, fullName);
    if (!success) {
      throw new Error("User not found or full name could not be updated.");
    }
    return true;
  } catch (error) {
    log(
      "error",
      `Error updating user full name for user ${userId} in authService:`,
      error
    );
    throw error;
  }
}

async function logAdminAction(adminUserId, targetUserId, actionType, details) {
  try {
    await adminActivityLogRepository.createAdminActivityLog(
      adminUserId,
      targetUserId,
      actionType,
      details
    );
  } catch (error) {
    log(
      "error",
      `Failed to log admin action for admin ${adminUserId} on user ${targetUserId}:`,
      error
    );
    // Do not re-throw, logging should not block the main operation
  }
}

// MFA Functions
async function generateTotpSecret(userId, email) {
  try {
    const totp = new TOTP({
      issuer: "SparkyFitness",
      label: email,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: new Secret({ size: 20 }), // Generate a random 20-byte secret
    });
    const { encryptedText, iv, tag } = await encrypt(totp.secret.base32, ENCRYPTION_KEY);
    const encryptedSecret = JSON.stringify({ encryptedText, iv, tag });
    // Store secret, but don't enable yet. mfaTotpEnabled will be set to false during setup.
    await userRepository.updateUserMfaSettings(userId, encryptedSecret, false, null, null, null, null, null);
    const otpauthUrl = totp.toString();
    return { secret: totp.secret.base32, otpauthUrl };
  } catch (error) {
    log('error', `Error generating TOTP secret for user ${userId}:`, error);
    throw error;
  }
}

async function verifyTotpCode(userId, code) {
  try {
    const user = await userRepository.findUserById(userId);
    if (!user || !user.mfa_secret) {
      throw new Error("TOTP not set up for this user.");
    }
    const { encryptedText, iv, tag } = JSON.parse(user.mfa_secret);
    const decryptedSecret = await decrypt(encryptedText, iv, tag, ENCRYPTION_KEY);
    if (!decryptedSecret) {
      throw new Error("Failed to decrypt TOTP secret.");
    }

    const totp = new TOTP({
      issuer: "SparkyFitness",
      label: user.email,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(decryptedSecret),
    });

    const delta = totp.validate({ token: code, window: 6 }); // Allow for 6 steps (180 seconds = 3 minutes) time difference

    if (delta === null) {
      return false; // Invalid code
    }
    return true;
  } catch (error) {
    log('error', `Error verifying TOTP code for user ${userId}: ${error.message}`, error);
    throw error;
  }
}

async function generateEmailMfaCode(userId) {
  try {
    const code = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now
    const { encryptedText, iv, tag } = await encrypt(code, ENCRYPTION_KEY);
    const encryptedCode = JSON.stringify({ encryptedText, iv, tag });
    log('debug', `Generated encryptedCode for storage for user ${userId}:`, encryptedCode);

    // Pass all parameters, setting only email_mfa_code and email_mfa_expires_at
    await userRepository.updateUserMfaSettings(userId, null, null, null, null, null, encryptedCode, expiresAt);
    return code;
  } catch (error) {
    log('error', `Error generating email MFA code for user ${userId}:`, error);
    throw error;
  }
}

async function verifyEmailMfaCode(userId, code) {
  try {
    const user = await userRepository.findUserById(userId);
    if (!user || !user.email_mfa_code || !user.email_mfa_expires_at) {
      throw new Error("Email MFA code not found or expired.");
    }
    log('debug', `Stored email_mfa_code for user ${userId} before JSON.parse:`, user.email_mfa_code);

    let parsedCode;
    try {
      parsedCode = JSON.parse(user.email_mfa_code);
    } catch (parseError) {
      log('error', `Error parsing stored email_mfa_code for user ${userId}:`, parseError);
      return false; // Failed to parse, assume invalid
    }
    const { encryptedText, iv, tag } = parsedCode;
    const decryptedCode = await decrypt(encryptedText, iv, tag, ENCRYPTION_KEY);
    log('debug', `Decrypted code from DB for user ${userId}: ${decryptedCode}`);
    log('debug', `User provided code: ${code}`);

    if (!decryptedCode || decryptedCode !== code) {
      log('warn', `MFA code mismatch for user ${userId}. Decrypted: ${decryptedCode}, Provided: ${code}`);
      return false;
    }

    log('debug', `Stored expiration for user ${userId}: ${user.email_mfa_expires_at}`);
    log('debug', `Current time: ${new Date()}`);

    if (new Date() > new Date(user.email_mfa_expires_at)) {
      return false; // Code expired
    }

    // Clear the code after successful verification
    // Clear only email_mfa_code and email_mfa_expires_at after successful verification
    await userRepository.updateUserMfaSettings(userId, undefined, undefined, undefined, undefined, undefined, null, null);
    return user;
  } catch (error) {
    log('error', `Error verifying email MFA code for user ${userId}:`, error);
    throw error;
  }
}

async function generateRecoveryCodes(userId) {
  try {
    const codes = Array.from({ length: 10 }, () =>
      crypto.randomBytes(8).toString('hex').toUpperCase()
    );
    const { encryptedText, iv, tag } = await encrypt(JSON.stringify(codes), ENCRYPTION_KEY);
    // Store the encrypted object directly, as the DB column is likely JSONB and will handle parsing
    const encryptedRecoveryCodesObject = { encryptedText, iv, tag };
    await userRepository.updateUserMfaSettings(userId, null, null, null, encryptedRecoveryCodesObject, null, null, null);
    return codes;
  } catch (error) {
    log('error', `Error generating recovery codes for user ${userId}:`, error);
    throw error;
  }
}

async function verifyRecoveryCode(userId, code) {
  try {
    const user = await userRepository.findUserById(userId);
    if (!user || !user.mfa_recovery_codes) {
      return false;
    }
    const normalizedCode = code.trim().toUpperCase(); // Normalize the input code
    const { encryptedText: recoveryEncryptedText, iv: recoveryIv, tag: recoveryTag } = user.mfa_recovery_codes;
    const decryptedCodes = JSON.parse(await decrypt(recoveryEncryptedText, recoveryIv, recoveryTag, ENCRYPTION_KEY));
    const index = decryptedCodes.indexOf(normalizedCode); // Use the normalized code for comparison
    if (index === -1) {
      return false; // Code not found
    }

    // Remove used code
    decryptedCodes.splice(index, 1);
    const { encryptedText: updatedRecoveryEncryptedText, iv: updatedRecoveryIv, tag: updatedRecoveryTag } = await encrypt(JSON.stringify(decryptedCodes), ENCRYPTION_KEY);
    const updatedEncryptedCodes = JSON.stringify({ encryptedText: updatedRecoveryEncryptedText, iv: updatedRecoveryIv, tag: updatedRecoveryTag });
    await userRepository.updateUserMfaSettings(userId, null, null, null, updatedEncryptedCodes, null, null, null);
    return true;
  } catch (error) {
    log('error', `Error verifying recovery code for user ${userId}:`, error);
    throw error;
  }
}

async function resetUserMfa(adminUserId, targetUserId) {
  try {
    // Admins can reset MFA for any user
    await userRepository.updateUserMfaSettings(targetUserId, null, false, false, null, false, null, null);
    await logAdminAction(adminUserId, targetUserId, 'MFA Reset', `MFA reset for user ${targetUserId}`);
    return true;
  } catch (error) {
    log('error', `Error resetting MFA for user ${targetUserId} by admin ${adminUserId}:`, error);
    throw error;
  }
}


async function sendEmailMfaCode(email, code) {
  try {
    await emailService.sendEmailMfaCode(email, code);
    log('info', `Email MFA code sent to ${email}`);
  } catch (error) {
    log('error', `Error sending email MFA code to ${email}:`, error);
    throw error;
  }
}

// Magic Link Functions
async function requestMagicLink(email) {
  try {
    const user = await userRepository.findUserByEmail(email);
    if (!user) {
      log("info", `Magic link requested for non-existent email: ${email}`);
      return; // For security, don't reveal if user exists or not
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes validity

    await userRepository.storeMagicLinkToken(user.id, token, expires);

    const magicLinkUrl = `${process.env.SPARKY_FITNESS_FRONTEND_URL}/login/magic-link?token=${token}`;
    await emailService.sendMagicLinkEmail(user.email, magicLinkUrl);

    log("info", `Magic link sent to user: ${user.id}`);
  } catch (error) {
    log('error', `Error requesting magic link for email ${email}:`, error);
    throw error;
  }
}

async function verifyMagicLink(token) {
  try {
    const user = await userRepository.getMagicLinkToken(token);
    if (!user) {
      throw new Error("Magic link is invalid or has already been used.");
    }
    if (new Date() > new Date(user.magic_link_expires)) {
      throw new Error("Magic link has expired.");
    }

    // Defer clearing the magic link token until after MFA check or full login
    // await userRepository.clearMagicLinkToken(user.id);

    // After successful magic link verification, proceed to issue a JWT
    // Check for MFA requirements for local users after magic link login
    const globalMfaMandatory = await globalSettingsRepository.getMfaMandatorySetting();
    const mfaEnabledForUser = user.mfa_totp_enabled || user.mfa_email_enabled;
    const mfaEnforcedForUser = user.mfa_enforced;

    log('debug', `Magic link login MFA check for user ${user.id}:`);
    log('debug', `  Global MFA mandatory: ${globalMfaMandatory}`);
    log('debug', `  User MFA enabled (TOTP or Email): ${mfaEnabledForUser}`);
    log('debug', `  User MFA enforced: ${mfaEnforcedForUser}`);
    log('debug', `  User object MFA details: mfa_totp_enabled=${user.mfa_totp_enabled}, mfa_email_enabled=${user.mfa_email_enabled}, mfa_enforced=${user.mfa_enforced}`);


    if (globalMfaMandatory || mfaEnforcedForUser || mfaEnabledForUser) {
      // Return a special status to the frontend indicating MFA is required
      return {
        status: 'MFA_REQUIRED',
        userId: user.id,
        email: user.email,
        mfa_totp_enabled: user.mfa_totp_enabled,
        mfa_email_enabled: user.mfa_email_enabled,
        needs_mfa_setup: (globalMfaMandatory || mfaEnforcedForUser) && !mfaEnabledForUser,
        mfaToken: jwt.sign({ userId: user.id, purpose: 'mfa_challenge' }, JWT_SECRET, { expiresIn: '5m' }), // Short-lived token for MFA challenge
      };
    }

    await userRepository.updateUserLastLogin(user.id);
    // Clear the magic link token now that the user is fully logged in without MFA
    await userRepository.clearMagicLinkToken(user.id);

    const authToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "30d" });
    return { userId: user.id, email: user.email, token: authToken, role: user.role };

  } catch (error) {
    log('error', `Error verifying magic link:`, error);
    throw error;
  }
}


// Modified loginUser function to incorporate MFA check
async function loginUser(email, password, loginSettings) {
  try {
    if (!loginSettings.email.enabled) {
      throw new Error("Email/Password login is disabled.");
    }

    const user = await userRepository.findUserByEmail(email);

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      throw new Error("Invalid credentials.");
    }

    if (!user.is_active) {
      throw new Error("Account is disabled. Please contact an administrator.");
    }

    // Check if user is an OIDC user
    const isOidc = await userRepository.isOidcUser(user.id);
    if (isOidc) {
      // OIDC users bypass our MFA; their OIDC provider handles it
      await userRepository.updateUserLastLogin(user.id);
      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "30d" });
      return { userId: user.id, token, role: user.role };
    }

    // Check for MFA requirements for local users
    const globalMfaMandatory = await globalSettingsRepository.getMfaMandatorySetting();
    const mfaEnabledForUser = user.mfa_totp_enabled || user.mfa_email_enabled;
    const mfaEnforcedForUser = user.mfa_enforced;

    if (globalMfaMandatory || mfaEnforcedForUser || mfaEnabledForUser) {
      // Return a special status to the frontend indicating MFA is required
      return {
        status: 'MFA_REQUIRED',
        userId: user.id,
        email: user.email,
        mfa_totp_enabled: user.mfa_totp_enabled,
        mfa_email_enabled: user.mfa_email_enabled,
        needs_mfa_setup: (globalMfaMandatory || mfaEnforcedForUser) && !mfaEnabledForUser,
        mfaToken: jwt.sign({ userId: user.id, purpose: 'mfa_challenge' }, JWT_SECRET, { expiresIn: '5m' }), // Short-lived token for MFA challenge
      };
    }

    // If no MFA required, proceed with normal login
    await userRepository.updateUserLastLogin(user.id);

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
      expiresIn: "30d",
    });
    return { userId: user.id, token, role: user.role };
  } catch (error) {
    log("error", "Error during user login in authService:", error);
    throw error;
  }
}


async function getMfaStatus(userId) {
  try {
    const user = await userRepository.findUserById(userId);
    if (!user) {
      throw new Error("User not found.");
    }
    return {
      totp_enabled: user.mfa_totp_enabled,
      email_mfa_enabled: user.mfa_email_enabled,
      mfa_enforced: user.mfa_enforced
    };
  } catch (error) {
    log('error', `Error fetching MFA status for user ${userId}:`, error);
    throw error;
  }
  
}

async function updateUserMfaSettings(
  userId,
  mfaSecret,
  mfaTotpEnabled,
  mfaEmailEnabled,
  mfaRecoveryCodes,
  mfaEnforced,
  emailMfaCode,
  emailMfaExpiresAt
) {
  try {
    const success = await userRepository.updateUserMfaSettings(
      userId,
      mfaSecret,
      mfaTotpEnabled,
      mfaEmailEnabled,
      mfaRecoveryCodes,
      mfaEnforced,
      emailMfaCode,
      emailMfaExpiresAt
    );
    if (!success) {
      throw new Error("User not found or MFA settings could not be updated.");
    }
    return true;
  } catch (error) {
    log('error', `Error updating MFA settings for user ${userId} in authService:`, error);
    throw error;
  }
}

async function resetPassword(token, newPassword) {
  try {
    const user = await userRepository.findUserByPasswordResetToken(token);

    if (!user) {
      throw new Error("Password reset token is invalid or has expired.");
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    await userRepository.updateUserPassword(user.id, hashedPassword);
    await userRepository.updatePasswordResetToken(user.id, null, null); // Clear the token and expiration

    log("info", `Password successfully reset for user: ${user.id}`);
  } catch (error) {
    log(
      "error",
      `Error in resetPassword for token ${token} in authService:`,
      error
    );
    throw error;
  }
}
