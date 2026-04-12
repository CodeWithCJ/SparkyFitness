// @ts-expect-error TS(7016): Could not find a declaration file for module 'bcry... Remove this comment to see the full error message
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import userRepository from '../models/userRepository.js';
import familyAccessRepository from '../models/familyAccessRepository.js';
import { log } from '../config/logging.js';
import { canAccessUserData } from '../utils/permissionUtils.js';
import adminActivityLogRepository from '../models/adminActivityLogRepository.js';
/**
 * Gets consistent user data by ID.
 * Used internally by various app services.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getUser(authenticatedUserId: any) {
  try {
    const user = await userRepository.findUserById(authenticatedUserId);
    if (!user) {
      throw new Error('User not found.');
    }
    return user;
  } catch (error) {
    log(
      'error',
      `Error fetching user ${authenticatedUserId} in authService:`,
      error
    );
    throw error;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function findUserIdByEmail(email: any) {
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function generateUserApiKey(targetUserId: any, description: any) {
  try {
    const newApiKey = uuidv4();
    // @ts-expect-error TS(2339): Property 'generateApiKey' does not exist on type '... Remove this comment to see the full error message
    const apiKey = await userRepository.generateApiKey(
      targetUserId,
      newApiKey,
      description
    );
    return apiKey;
  } catch (error) {
    log(
      'error',
      `Error generating API key for user ${targetUserId} in authService:`,
      error
    );
    throw error;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteUserApiKey(targetUserId: any, apiKeyId: any) {
  try {
    // @ts-expect-error TS(2339): Property 'deleteApiKey' does not exist on type '{ ... Remove this comment to see the full error message
    const success = await userRepository.deleteApiKey(apiKeyId, targetUserId);
    if (!success) {
      throw new Error('API Key not found or not authorized for deletion.');
    }
    return true;
  } catch (error) {
    log(
      'error',
      `Error deleting API key ${apiKeyId} for user ${targetUserId} in authService:`,
      error
    );
    throw error;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getAccessibleUsers(authenticatedUserId: any) {
  try {
    const users = await userRepository.getAccessibleUsers(authenticatedUserId);
    return users;
  } catch (error) {
    log('error', 'Error fetching accessible users in authService:', error);
    throw error;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getUserProfile(targetUserId: any) {
  try {
    const profile = await userRepository.getUserProfile(targetUserId);
    return profile;
  } catch (error) {
    log(
      'error',
      `Error fetching profile for user ${targetUserId} in authService:`,
      error
    );
    throw error;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateUserProfile(targetUserId: any, profileData: any) {
  try {
    const { full_name, phone_number, date_of_birth, bio, avatar_url, gender } =
      profileData;
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
      throw new Error('Profile not found or no changes made.');
    }
    return updatedProfile;
  } catch (error) {
    log(
      'error',
      `Error updating profile for user ${targetUserId} in authService:`,
      error
    );
    throw error;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getUserApiKeys(targetUserId: any) {
  try {
    // @ts-expect-error TS(2339): Property 'getUserApiKeys' does not exist on type '... Remove this comment to see the full error message
    const apiKeys = await userRepository.getUserApiKeys(targetUserId);
    return apiKeys;
  } catch (error) {
    log(
      'error',
      `Error fetching API keys for user ${targetUserId} in authService:`,
      error
    );
    throw error;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function switchUserContext(authenticatedUserId: any, targetUserId: any) {
  try {
    log(
      'info',
      `Attempting context switch: User ${authenticatedUserId} -> User ${targetUserId}`
    );
    // Verify access
    const hasAccess = await canAccessUserData(
      targetUserId,
      'reports',
      authenticatedUserId
    );
    if (!hasAccess) {
      throw new Error(
        'Forbidden: You do not have permission to switch to this user context.'
      );
    }
    return { success: true, activeUserId: targetUserId };
  } catch (error) {
    log(
      'error',
      `Error switching context for user ${authenticatedUserId} to ${targetUserId} in authService:`,
      error
    );
    throw error;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateUserPassword(authenticatedUserId: any, newPassword: any) {
  try {
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    const success = await userRepository.updateUserPassword(
      authenticatedUserId,
      hashedPassword
    );
    if (!success) {
      throw new Error('User not found.');
    }
    return true;
  } catch (error) {
    log('error', 'Error updating password in authService:', error);
    throw error;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateUserEmail(authenticatedUserId: any, newEmail: any) {
  try {
    const existingUser = await userRepository.findUserByEmail(newEmail);
    if (existingUser && existingUser.id !== authenticatedUserId) {
      throw new Error('Email already in use by another account.');
    }
    const success = await userRepository.updateUserEmail(
      authenticatedUserId,
      newEmail
    );
    if (!success) {
      throw new Error('User not found.');
    }
    return true;
  } catch (error) {
    log('error', 'Error updating email in authService:', error);
    throw error;
  }
}

async function checkFamilyAccess(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ownerUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  permission: any
) {
  try {
    const hasAccess = await familyAccessRepository.checkFamilyAccessPermission(
      authenticatedUserId,
      ownerUserId,
      permission
    );
    return hasAccess;
  } catch (error) {
    log('error', 'Error checking family access in authService:', error);
    throw error;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getFamilyAccessEntries(authenticatedUserId: any) {
  try {
    const entries =
      await familyAccessRepository.getFamilyAccessEntriesByUserId(
        authenticatedUserId
      );
    return entries;
  } catch (error) {
    log('error', 'Error fetching family access entries in authService:', error);
    throw error;
  }
}

async function createFamilyAccessEntry(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entryData: any
) {
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
    log('error', 'Error creating family access entry in authService:', error);
    throw error;
  }
}

async function updateFamilyAccessEntry(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  id: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateData: any
) {
  try {
    const updatedEntry = await familyAccessRepository.updateFamilyAccessEntry(
      id,
      authenticatedUserId,
      updateData.access_permissions,
      updateData.access_end_date,
      updateData.is_active,
      updateData.status
    );
    if (!updatedEntry) throw new Error('Family access entry not found.');
    return updatedEntry;
  } catch (error) {
    log('error', 'Error updating family access entry in authService:', error);
    throw error;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteFamilyAccessEntry(authenticatedUserId: any, id: any) {
  try {
    const success = await familyAccessRepository.deleteFamilyAccessEntry(
      id,
      authenticatedUserId
    );
    if (!success) throw new Error('Family access entry not found.');
    return true;
  } catch (error) {
    log('error', 'Error deleting family access entry in authService:', error);
    throw error;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateUserFullName(userId: any, fullName: any) {
  try {
    const success = await userRepository.updateUserFullName(userId, fullName);
    return success;
  } catch (error) {
    log(
      'error',
      `Error updating full name for user ${userId} in authService:`,
      error
    );
    throw error;
  }
}
async function updateUserMfaSettings(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mfaSecret: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mfaTotpEnabled: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mfaEmailEnabled: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mfaRecoveryCodes: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mfaEnforced: any
) {
  try {
    const success = await userRepository.updateUserMfaSettings(
      userId,
      mfaSecret,
      mfaTotpEnabled,
      mfaEmailEnabled,
      mfaRecoveryCodes,
      mfaEnforced
    );
    return success;
  } catch (error) {
    log('error', 'Error updating MFA settings in authService:', error);
    throw error;
  }
}
/**
 * Resets a user's MFA status (TOTP and Email).
 * Used by administrators.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resetUserMfa(adminUserId: any, targetUserId: any) {
  try {
    await userRepository.updateUserMfaSettings(
      targetUserId,
      null, // clear secret
      false, // disable TOTP
      false, // disable email MFA
      [], // clear recovery codes
      false // disable enforced
    );
    await logAdminAction(adminUserId, targetUserId, 'USER_MFA_RESET', {
      resetUserId: targetUserId,
    });
    return true;
  } catch (error) {
    log('error', `Error resetting MFA for user ${targetUserId}:`, error);
    throw error;
  }
}
/**
 * Internal logger for administrative actions.
 */
async function logAdminAction(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  targetUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actionType: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actionDetails: any
) {
  try {
    await adminActivityLogRepository.createAdminActivityLog(
      adminUserId,
      targetUserId,
      actionType,
      actionDetails
    );
  } catch (error) {
    log('error', 'Error logging admin action:', error);
    // Silent fail for logging to prevent breaking main admin actions
  }
}
export { getUser };
export { findUserIdByEmail };
export { generateUserApiKey };
export { deleteUserApiKey };
export { getAccessibleUsers };
export { getUserProfile };
export { updateUserProfile };
export { getUserApiKeys };
export { switchUserContext };
export { updateUserPassword };
export { updateUserEmail };
export { canAccessUserData };
export { checkFamilyAccess };
export { getFamilyAccessEntries };
export { createFamilyAccessEntry };
export { updateFamilyAccessEntry };
export { deleteFamilyAccessEntry };
export { updateUserFullName };
export { updateUserMfaSettings };
export { resetUserMfa };
export { logAdminAction };
export default {
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
