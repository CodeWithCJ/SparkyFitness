// Define logging levels
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  SILENT: 4,
};

// Get desired log level from environment variable, default to INFO
const currentLogLevel =
  LOG_LEVELS[process.env.SPARKY_FITNESS_LOG_LEVEL?.trim().toUpperCase()] ||
  LOG_LEVELS.DEBUG; // Changed default to DEBUG for development

// Custom logger function
function log(level, message, ...args) {
  if (LOG_LEVELS[level.toUpperCase()] >= currentLogLevel) {
    const timestamp = new Date().toISOString();
    switch (level.toUpperCase()) {
      case "DEBUG":
        console.debug(`[${timestamp}] [DEBUG] ${message}`, ...args);
        break;
      case "INFO":
        console.info(`[${timestamp}] [INFO] ${message}`, ...args);
        break;
      case "WARN":
        console.warn(`[${timestamp}] [WARN] ${message}`, ...args);
        break;
      case "ERROR":
        console.error(`[${timestamp}] [ERROR] ${message}`, ...args);
        break;
      default:
        console.log(`[${timestamp}] [UNKNOWN] ${message}`, ...args);
    }
  }
}

module.exports = {
  log,
  LOG_LEVELS,
};
