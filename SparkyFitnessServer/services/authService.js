const bcrypt = require('bcrypt');

const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const userRepository = require('../models/userRepository');
const familyAccessRepository = require('../models/familyAccessRepository');
const nutrientDisplayPreferenceService = require('./nutrientDisplayPreferenceService');
const { log } = require('../config/logging');
const { canAccessUserData } = require('../utils/permissionUtils');


/**
 * Gets consistent user data by ID.
 * Used internally by various app services.
 */
async function getUser(authenticatedUserId) {
  try {
    const user = await userRepository.findUserById(authenticatedUserId);
    if (!user) {
      throw new Error("User not found.");
    }
    return user;
  } catch (error) {
    log("error", `Error fetching user ${authenticatedUserId} in authService:`, error);
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

async function generateUserApiKey(targetUserId, description) {
  try {
    const newApiKey = uuidv4();
    const apiKey = await userRepository.generateApiKey(targetUserId, newApiKey, description);
    return apiKey;
  } catch (error) {
    log("error", `Error generating API key for user ${targetUserId} in authService:`, error);
    throw error;
  }
}

async function deleteUserApiKey(targetUserId, apiKeyId) {
  try {
    const success = await userRepository.deleteApiKey(apiKeyId, targetUserId);
    if (!success) {
      throw new Error("API Key not found or not authorized for deletion.");
    }
    return true;
  } catch (error) {
    log("error", `Error deleting API key ${apiKeyId} for user ${targetUserId} in authService:`, error);
    throw error;
  }
}

async function getAccessibleUsers(authenticatedUserId) {
  try {
    const users = await userRepository.getAccessibleUsers(authenticatedUserId);
    return users;
  } catch (error) {
    log("error", `Error fetching accessible users in authService:`, error);
    throw error;
  }
}

async function getUserProfile(targetUserId) {
  try {
    const profile = await userRepository.getUserProfile(targetUserId);
    return profile;
  } catch (error) {
    log("error", `Error fetching profile for user ${targetUserId} in authService:`, error);
    throw error;
  }
}

async function updateUserProfile(targetUserId, profileData) {
  try {
    const { full_name, phone_number, date_of_birth, bio, avatar_url, gender } = profileData;
    const updatedProfile = await userRepository.updateUserProfile(
      targetUserId,
      full_name,
      phone_number,
      date_of_birth,
      bio,
      avatar_url,
      gender
    );
    if (!updatedProfile) {
      throw new Error("Profile not found or no changes made.");
    }
    return updatedProfile;
  } catch (error) {
    log("error", `Error updating profile for user ${targetUserId} in authService:`, error);
    throw error;
  }
}

async function getUserApiKeys(targetUserId) {
  try {
    const apiKeys = await userRepository.getUserApiKeys(targetUserId);
    return apiKeys;
  } catch (error) {
    log("error", `Error fetching API keys for user ${targetUserId} in authService:`, error);
    throw error;
  }
}

async function switchUserContext(authenticatedUserId, targetUserId) {
  try {
    log('info', `Attempting context switch: User ${authenticatedUserId} -> User ${targetUserId}`);

    // Verify access
    const hasAccess = await canAccessUserData(targetUserId, 'reports', authenticatedUserId);
    if (!hasAccess) {
      throw new Error("Forbidden: You do not have permission to switch to this user context.");
    }

    return { success: true, activeUserId: targetUserId };
  } catch (error) {
    log("error", `Error switching context for user ${authenticatedUserId} to ${targetUserId} in authService:`, error);
    throw error;
  }
}

async function updateUserPassword(authenticatedUserId, newPassword) {
  try {
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    const success = await userRepository.updateUserPassword(authenticatedUserId, hashedPassword);
    if (!success) {
      throw new Error("User not found.");
    }
    return true;
  } catch (error) {
    log("error", `Error updating password in authService:`, error);
    throw error;
  }
}

async function updateUserEmail(authenticatedUserId, newEmail) {
  try {
    const existingUser = await userRepository.findUserByEmail(newEmail);
    if (existingUser && existingUser.id !== authenticatedUserId) {
      throw new Error("Email already in use by another account.");
    }
    const success = await userRepository.updateUserEmail(authenticatedUserId, newEmail);
    if (!success) {
      throw new Error("User not found.");
    }
    return true;
  } catch (error) {
    log("error", `Error updating email in authService:`, error);
    throw error;
  }
}

async function checkFamilyAccess(authenticatedUserId, ownerUserId, permission) {
  try {
    const hasAccess = await familyAccessRepository.checkFamilyAccessPermission(authenticatedUserId, ownerUserId, permission);
    return hasAccess;
  } catch (error) {
    log("error", `Error checking family access in authService:`, error);
    throw error;
  }
}

async function getFamilyAccessEntries(authenticatedUserId) {
  try {
    const entries = await familyAccessRepository.getFamilyAccessEntriesByUserId(authenticatedUserId);
    return entries;
  } catch (error) {
    log('error', `Error fetching family access entries in authService:`, error);
    throw error;
  }
}

async function createFamilyAccessEntry(authenticatedUserId, entryData) {
  try {
    return await familyAccessRepository.createFamilyAccessEntry(
      authenticatedUserId,
      entryData.family_user_id,
      entryData.family_email,
      entryData.access_permissions,
      entryData.access_end_date,
      entryData.status
    );
  } catch (error) {
    log("error", `Error creating family access entry in authService:`, error);
    throw error;
  }
}

async function updateFamilyAccessEntry(authenticatedUserId, id, updateData) {
  try {
    const updatedEntry = await familyAccessRepository.updateFamilyAccessEntry(
      id,
      authenticatedUserId,
      updateData.access_permissions,
      updateData.access_end_date,
      updateData.is_active,
      updateData.status
    );
    if (!updatedEntry) throw new Error("Family access entry not found.");
    return updatedEntry;
  } catch (error) {
    log("error", `Error updating family access entry in authService:`, error);
    throw error;
  }
}

async function deleteFamilyAccessEntry(authenticatedUserId, id) {
  try {
    const success = await familyAccessRepository.deleteFamilyAccessEntry(id, authenticatedUserId);
    if (!success) throw new Error("Family access entry not found.");
    return true;
  } catch (error) {
    log("error", `Error deleting family access entry in authService:`, error);
    throw error;
  }
}

async function updateUserFullName(userId, fullName) {
  try {
    const success = await userRepository.updateUserFullName(userId, fullName);
    return success;
  } catch (error) {
    log('error', `Error updating full name for user ${userId} in authService:`, error);
    throw error;
  }
}

async function updateUserMfaSettings(userId, mfaSecret, mfaTotpEnabled, mfaEmailEnabled, mfaRecoveryCodes, mfaEnforced, emailMfaCode, emailMfaExpiresAt) {
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
    return success;
  } catch (error) {
    log('error', `Error updating MFA settings in authService:`, error);
    throw error;
  }
}

/**
 * Resets a user's MFA status (TOTP and Email).
 * Used by administrators.
 */
async function resetUserMfa(adminUserId, targetUserId) {
  try {
    await userRepository.updateUserMfaSettings(
      targetUserId,
      null,  // clear secret
      false, // disable TOTP
      false, // disable email MFA
      [],    // clear recovery codes
      false, // disable enforced
      null,  // clear email code
      null   // clear email expiry
    );
    await logAdminAction(adminUserId, targetUserId, 'USER_MFA_RESET', { resetUserId: targetUserId });
    return true;
  } catch (error) {
    log('error', `Error resetting MFA for user ${targetUserId}:`, error);
    throw error;
  }
}

/**
 * Internal logger for administrative actions.
 */
async function logAdminAction(adminUserId, targetUserId, actionType, actionDetails) {
  try {
    const adminActivityLogRepository = require('../models/adminActivityLogRepository');
    await adminActivityLogRepository.createAdminActivityLog(adminUserId, targetUserId, actionType, actionDetails);
  } catch (error) {
    log('error', 'Error logging admin action:', error);
    // Silent fail for logging to prevent breaking main admin actions
  }
}



module.exports = {
  getUser,
  findUserIdByEmail,
  generateUserApiKey,
  deleteUserApiKey,
  getAccessibleUsers,
  getUserProfile,
  updateUserProfile,
  getUserApiKeys,
  switchUserContext,
  updateUserPassword,
  updateUserEmail,
  canAccessUserData,
  checkFamilyAccess,
  getFamilyAccessEntries,
  createFamilyAccessEntry,
  updateFamilyAccessEntry,
  deleteFamilyAccessEntry,
  updateUserFullName,

  updateUserMfaSettings,
  resetUserMfa,
  logAdminAction,
};
