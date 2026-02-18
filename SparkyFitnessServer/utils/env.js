/**
 * Utility functions for environment variable parsing
 */

/**
 * Get a boolean value from an environment variable
 * @param {string} varName - The name of the environment variable
 * @param {boolean} defaultValue - Default value if variable is not set (default: false)
 * @returns {boolean} The parsed boolean value
 */
function getBooleanEnv(varName, defaultValue = false) {
  const value = process.env[varName];
  if (value === undefined) {
    return defaultValue;
  }
  return value === 'true' || value === '1';
}

module.exports = {
  getBooleanEnv,
};
