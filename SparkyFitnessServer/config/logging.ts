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
  // @ts-expect-error TS(2538): Type 'undefined' cannot be used as an index type.
  LOG_LEVELS[process.env.SPARKY_FITNESS_LOG_LEVEL?.trim().toUpperCase()] ||
  LOG_LEVELS.DEBUG; // Changed default to DEBUG for development
// Custom logger function
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function log(level: any, message: any, ...args: any[]) {
  // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
  if (LOG_LEVELS[level.toUpperCase()] >= currentLogLevel) {
    const timestamp = new Date().toISOString();
    switch (level.toUpperCase()) {
      case 'DEBUG':
        console.debug(`[${timestamp}] [DEBUG] ${message}`, ...args);
        break;
      case 'INFO':
        console.info(`[${timestamp}] [INFO] ${message}`, ...args);
        break;
      case 'WARN':
        console.warn(`[${timestamp}] [WARN] ${message}`, ...args);
        break;
      case 'ERROR':
        console.error(`[${timestamp}] [ERROR] ${message}`, ...args);
        break;
      default:
        console.log(`[${timestamp}] [UNKNOWN] ${message}`, ...args);
    }
  }
}
export { log };
export { LOG_LEVELS };
export default {
  log,
  LOG_LEVELS,
};
