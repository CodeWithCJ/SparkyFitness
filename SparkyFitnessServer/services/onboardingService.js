const onboardingRepository = require('../models/onboardingRepository');
const { log } = require('../config/logging'); 

/**
 * Processes and saves the user's onboarding data.
 * @param {string} userId - The UUID of the user.
 * @param {object} data - The onboarding form data.
 * @returns {Promise<void>}
 */
async function processOnboardingData(userId, data) {
  try {
    await onboardingRepository.saveOnboardingData(userId, data);
    log('info', `Successfully processed onboarding for user: ${userId}`);
  } catch (error) {
    log('error', `Error processing onboarding data for user ${userId}:`, error);
    throw new Error('Failed to save onboarding data.');
  }
}

/**
 * Checks if a user has completed the onboarding process.
 * @param {string} userId - The UUID of the user.
 * @returns {Promise<boolean>} True if onboarding is complete, false otherwise.
 */
async function checkOnboardingStatus(userId) {
  try {
    const statusRecord = await onboardingRepository.getOnboardingStatus(userId);

    if (!statusRecord) {
      return false;
    }

    return statusRecord.onboarding_complete;
  } catch (error) {
    log('error', `Error checking onboarding status for user ${userId}:`, error);
    return true;
  }
}

/**
 * Resets the onboarding completion status for a given user.
 * @param {string} userId - The UUID of the user.
 * @returns {Promise<void>}
 */
async function resetOnboardingStatus(userId) {
  try {
    await onboardingRepository.resetOnboardingStatus(userId);
    log('info', `Successfully reset onboarding status for user: ${userId}`);
  } catch (error) {
    log('error', `Error resetting onboarding status for user ${userId}:`, error);
    throw new Error('Failed to reset onboarding status.');
  }
}

module.exports = {
  processOnboardingData,
  checkOnboardingStatus,
  resetOnboardingStatus,
};