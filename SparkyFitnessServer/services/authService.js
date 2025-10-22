const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto'); // For generating secure tokens
const { log } = require('../config/logging');
const { JWT_SECRET } = require('../security/encryption');
const userRepository = require('../models/userRepository');
const familyAccessRepository = require('../models/familyAccessRepository');
const oidcProviderRepository = require('../models/oidcProviderRepository');
const globalSettingsRepository = require('../models/globalSettingsRepository');
const adminActivityLogRepository = require('../models/adminActivityLogRepository'); // Import admin activity log repository
const { getClient, getSystemClient } = require('../db/poolManager');
const nutrientDisplayPreferenceService = require('./nutrientDisplayPreferenceService');
const emailService = require('./emailService');

async function registerUser(email, password, full_name) {
  try {
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const userId = uuidv4();

    await userRepository.createUser(userId, email, hashedPassword, full_name);

    await nutrientDisplayPreferenceService.createDefaultNutrientPreferencesForUser(userId);

    const token = jwt.sign({ userId: userId }, JWT_SECRET, { expiresIn: '30d' });
    return { userId, token };
  } catch (error) {
    log('error', 'Error during user registration in authService:', error);
    throw error;
  }
}

async function loginUser(email, password, loginSettings) {
  try {
    if (!loginSettings.email.enabled) {
      throw new Error('Email/Password login is disabled.');
    }

    const user = await userRepository.findUserByEmail(email);

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      throw new Error('Invalid credentials.');
    }

    if (!user.is_active) {
      throw new Error('Account is disabled. Please contact an administrator.');
    }

    // Update last login time
    await userRepository.updateUserLastLogin(user.id);

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
    return { userId: user.id, token, role: user.role };
  } catch (error) {
    log('error', 'Error during user login in authService:', error);
    throw error;
  }
}

async function getUser(authenticatedUserId) {
  try {
    const user = await userRepository.findUserById(authenticatedUserId);
    if (!user) {
      throw new Error('User not found.');
    }
    return user;
  } catch (error) {
    log('error', `Error fetching user ${authenticatedUserId} in authService:`, error);
    throw error;
  }
}

async function findUserIdByEmail(email) {
  try {
    const user = await userRepository.findUserIdByEmail(email);
    if (!user) {
      throw new Error('User not found.');
    }
    return user.id;
  } catch (error) {
    log('error', `Error finding user by email ${email} in authService:`, error);
    throw error;
  }
}

async function generateUserApiKey(authenticatedUserId, targetUserId, description) {
  try {
    const newApiKey = uuidv4();
    const apiKey = await userRepository.generateApiKey(targetUserId, newApiKey, description);
    return apiKey;
  } catch (error) {
    log('error', `Error generating API key for user ${targetUserId} in authService:`, error);
    throw error;
  }
}

async function deleteUserApiKey(authenticatedUserId, targetUserId, apiKeyId) {
  try {
    const success = await userRepository.deleteApiKey(apiKeyId, targetUserId);
    if (!success) {
      throw new Error('API Key not found or not authorized for deletion.');
    }
    return true;
  } catch (error) {
    log('error', `Error deleting API key ${apiKeyId} for user ${targetUserId} in authService:`, error);
    throw error;
  }
}

async function getAccessibleUsers(authenticatedUserId) {
  try {
    const users = await userRepository.getAccessibleUsers(authenticatedUserId);
    return users;
  } catch (error) {
    log('error', `Error fetching accessible users for user ${authenticatedUserId} in authService:`, error);
    throw error;
  }
}

async function getUserProfile(authenticatedUserId, targetUserId) {
  try {
    const profile = await userRepository.getUserProfile(targetUserId);
    return profile;
  } catch (error) {
    log('error', `Error fetching profile for user ${targetUserId} in authService:`, error);
    throw error;
  }
}

async function updateUserProfile(authenticatedUserId, targetUserId, profileData) {
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
      throw new Error('Profile not found or no changes made.');
    }
    return updatedProfile;
  } catch (error) {
    log('error', `Error updating profile for user ${targetUserId} in authService:`, error);
    throw error;
  }
}

async function getUserApiKeys(authenticatedUserId, targetUserId) {
  try {
    const apiKeys = await userRepository.getUserApiKeys(targetUserId);
    return apiKeys;
  } catch (error) {
    log('error', `Error fetching API keys for user ${targetUserId} in authService:`, error);
    throw error;
  }
}

async function updateUserPassword(authenticatedUserId, newPassword) {
  try {
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    const success = await userRepository.updateUserPassword(authenticatedUserId, hashedPassword);
    if (!success) {
      throw new Error('User not found.');
    }
    return true;
  } catch (error) {
    log('error', `Error updating password for user ${authenticatedUserId} in authService:`, error);
    throw error;
  }
}

async function updateUserEmail(authenticatedUserId, newEmail) {
  try {
    const existingUser = await userRepository.findUserByEmail(newEmail);
    if (existingUser && existingUser.id !== authenticatedUserId) {
      throw new Error('Email already in use by another account.');
    }
    const success = await userRepository.updateUserEmail(authenticatedUserId, newEmail);
    if (!success) {
      throw new Error('User not found.');
    }
    return true;
  } catch (error) {
    log('error', `Error updating email for user ${authenticatedUserId} in authService:`, error);
    throw error;
  }
}

async function canAccessUserData(targetUserId, permissionType, authenticatedUserId) {
  try {
    const client = await getClient(authenticatedUserId); // User-specific operation
    const result = await client.query(
      `SELECT public.can_access_user_data($1, $2, $3) AS can_access`,
      [targetUserId, permissionType, authenticatedUserId]
    );
    client.release();
    return result.rows[0].can_access;
  } catch (error) {
    log('error', `Error checking access for user ${targetUserId} by ${authenticatedUserId} with permission ${permissionType} in authService:`, error);
    throw error;
  }
}

async function checkFamilyAccess(authenticatedUserId, ownerUserId, permission) {
  try {
    const hasAccess = await familyAccessRepository.checkFamilyAccessPermission(authenticatedUserId, ownerUserId, permission);
    return hasAccess;
  } catch (error) {
    log('error', `Error checking family access for family user ${authenticatedUserId} and owner ${ownerUserId} with permission ${permission} in authService:`, error);
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
    log('error', `Error creating family access entry for owner ${authenticatedUserId} in authService:`, error);
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
      throw new Error('Family access entry not found or not authorized to update.');
    }
    return updatedEntry;
  } catch (error) {
    log('error', `Error updating family access entry ${id} for owner ${authenticatedUserId} in authService:`, error);
    throw error;
  }
}

async function deleteFamilyAccessEntry(authenticatedUserId, id) {
  try {
    const success = await familyAccessRepository.deleteFamilyAccessEntry(id, authenticatedUserId); // Use authenticatedUserId as owner_user_id
    if (!success) {
      throw new Error('Family access entry not found or not authorized to delete.');
    }
    return true;
  } catch (error) {
    log('error', `Error deleting family access entry ${id} for owner ${authenticatedUserId} in authService:`, error);
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
  deleteFamilyAccessEntry,
  forgotPassword,
  resetPassword,
  getAllUsers,
  deleteUser,
  updateUserStatus,
  updateUserRole,
  updateUserFullName,
  logAdminAction,
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
      log('info', `Password reset requested for non-existent email: ${email}`);
      return;
    }
    log('debug', `User object before sending email: ${JSON.stringify(user)}`);
    log('debug', `User found for password reset: ${JSON.stringify(user)}`);

    // Generate a secure, unique token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const passwordResetExpires = Date.now() + 3600000; // 1 hour from now

    await userRepository.updatePasswordResetToken(user.id, resetToken, passwordResetExpires);

    const resetUrl = `${process.env.SPARKY_FITNESS_FRONTEND_URL}/reset-password?token=${resetToken}`;
    await emailService.sendPasswordResetEmail(user.email, resetUrl);

    log('info', `Password reset token generated and email sent to user: ${user.id}`);
  } catch (error) {
    log('error', `Error in forgotPassword for email ${email} in authService:`, error);
    throw error;
  }
}

async function getAllUsers(limit, offset, searchTerm) {
  try {
    const users = await userRepository.getAllUsers(limit, offset, searchTerm);
    return users;
  } catch (error) {
    log('error', `Error fetching all users in authService:`, error);
    throw error;
  }
}

async function deleteUser(userId) {
  try {
    const success = await userRepository.deleteUser(userId);
    if (!success) {
      throw new Error('User not found or could not be deleted.');
    }
    return true;
  } catch (error) {
    log('error', `Error deleting user ${userId} in authService:`, error);
    throw error;
  }
}

async function updateUserStatus(userId, isActive) {
  try {
    const success = await userRepository.updateUserStatus(userId, isActive);
    if (!success) {
      throw new Error('User not found or status could not be updated.');
    }
    return true;
  } catch (error) {
    log('error', `Error updating user status for user ${userId} in authService:`, error);
    throw error;
  }
}

async function updateUserRole(userId, role) {
  try {
    const success = await userRepository.updateUserRole(userId, role);
    if (!success) {
      throw new Error('User not found or role could not be updated.');
    }
    return true;
  } catch (error) {
    log('error', `Error updating user role for user ${userId} in authService:`, error);
    throw error;
  }
}

async function updateUserFullName(userId, fullName) {
  try {
    const success = await userRepository.updateUserFullName(userId, fullName);
    if (!success) {
      throw new Error('User not found or full name could not be updated.');
    }
    return true;
  } catch (error) {
    log('error', `Error updating user full name for user ${userId} in authService:`, error);
    throw error;
  }
}

async function logAdminAction(adminUserId, targetUserId, actionType, details) {
  try {
    await adminActivityLogRepository.createAdminActivityLog(adminUserId, targetUserId, actionType, details);
  } catch (error) {
    log('error', `Failed to log admin action for admin ${adminUserId} on user ${targetUserId}:`, error);
    // Do not re-throw, logging should not block the main operation
  }
}

async function resetPassword(token, newPassword) {
  try {
    const user = await userRepository.findUserByPasswordResetToken(token);

    if (!user) {
      throw new Error('Password reset token is invalid or has expired.');
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    await userRepository.updateUserPassword(user.id, hashedPassword);
    await userRepository.updatePasswordResetToken(user.id, null, null); // Clear the token and expiration

    log('info', `Password successfully reset for user: ${user.id}`);
  } catch (error) {
    log('error', `Error in resetPassword for token ${token} in authService:`, error);
    throw error;
  }
}