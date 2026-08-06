// Define logging levels
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  SILENT: 4,
};
// Log level from the environment. An unset, empty, or invalid
// SPARKY_FITNESS_LOG_LEVEL fails closed to INFO: debug logging can serialize
// full health payloads (GPS tracks, heart-rate series), so it must be an
// explicit opt-in, never the result of a missing variable or a typo. `??`
// rather than `||` because DEBUG's threshold is the falsy 0.
const currentLogLevel =
  // @ts-expect-error TS(2538): Type 'undefined' cannot be used as an index type.
  LOG_LEVELS[process.env.SPARKY_FITNESS_LOG_LEVEL?.trim().toUpperCase()] ??
  LOG_LEVELS.INFO;
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
/**
 * Whether a message at `level` would actually be emitted. Lets a caller skip
 * building an expensive message (a JSON.stringify of a multi-megabyte payload,
 * say) that the current level would discard anyway — `log()` alone still pays
 * that cost because arguments are evaluated before the call.
 */
function isLogLevelEnabled(level: string): boolean {
  const threshold = LOG_LEVELS[level.toUpperCase() as keyof typeof LOG_LEVELS];
  return threshold !== undefined && threshold >= currentLogLevel;
}
export { log };
export { isLogLevelEnabled };
export { LOG_LEVELS };
export default {
  log,
  isLogLevelEnabled,
  LOG_LEVELS,
};
