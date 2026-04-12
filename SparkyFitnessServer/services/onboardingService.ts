import onboardingRepository from '../models/onboardingRepository.js';
import { log } from '../config/logging.js';
/**
 * Processes and saves the user's onboarding data.
 * @param {string} userId - The UUID of the user.
 * @param {object} data - The onboarding form data.
 * @returns {Promise<void>}
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processOnboardingData(userId: any, data: any) {
  try {
    await onboardingRepository.saveOnboardingData(userId, data);
    log('info', `Successfully processed onboarding for user: ${userId}`);
  } catch (error) {
    log('error', `Error processing onboarding data for user ${userId}:`, error);
    throw new Error('Failed to save onboarding data.', { cause: error });
  }
}
/**
 * Checks if a user has completed the onboarding process.
 * @param {string} userId - The UUID of the user.
 * @returns {Promise<boolean>} True if onboarding is complete, false otherwise.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkOnboardingStatus(userId: any) {
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resetOnboardingStatus(userId: any) {
  try {
    await onboardingRepository.resetOnboardingStatus(userId);
    log('info', `Successfully reset onboarding status for user: ${userId}`);
  } catch (error) {
    log(
      'error',
      `Error resetting onboarding status for user ${userId}:`,
      error
    );
    throw new Error('Failed to reset onboarding status.', { cause: error });
  }
}
export { processOnboardingData };
export { checkOnboardingStatus };
export { resetOnboardingStatus };
export default {
  processOnboardingData,
  checkOnboardingStatus,
  resetOnboardingStatus,
};
