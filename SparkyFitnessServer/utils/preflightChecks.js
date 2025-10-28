const { log } = require('../config/logging');

function runPreflightChecks() {
  const requiredEnvVars = [
    'SPARKY_FITNESS_DB_HOST',
    'SPARKY_FITNESS_DB_NAME',
    'SPARKY_FITNESS_DB_USER',
    'SPARKY_FITNESS_DB_PASSWORD',            
    'SPARKY_FITNESS_APP_DB_USER',
    'SPARKY_FITNESS_APP_DB_PASSWORD',
    'SPARKY_FITNESS_FRONTEND_URL',
    'JWT_SECRET',
    'SPARKY_FITNESS_API_ENCRYPTION_KEY'
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    const errorMessage = `FATAL: Missing required environment variables: ${missingVars.join(', ')}. Please check your .env file.`;
    log('error', errorMessage);
    throw new Error(errorMessage);
  }

  log('info', 'Environment variable pre-flight checks passed successfully.');
}

module.exports = {
  runPreflightChecks,
};