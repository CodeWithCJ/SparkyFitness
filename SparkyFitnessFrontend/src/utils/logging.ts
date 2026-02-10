// Define logging levels with a numerical value for comparison
const LOGGING_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  SILENT: 4,
};

type LogLevel = keyof typeof LOGGING_LEVELS;
export type UserLoggingLevel = LogLevel; // Export for use with usePreferences

export const log = (
  userLoggingLevel: UserLoggingLevel,
  level: LogLevel,
  message: any,
  ...optionalParams: any[]
) => {
  const userLevelValue = LOGGING_LEVELS[userLoggingLevel];
  const messageLevelValue = LOGGING_LEVELS[level];

  if (messageLevelValue >= userLevelValue) {
    // Use appropriate console method based on level
    if (level === 'ERROR') {
      console.error(`[${level}]`, message, ...optionalParams);
    } else if (level === 'WARN') {
      console.warn(`[${level}]`, message, ...optionalParams);
    } else if (level === 'INFO') {
      console.info(`[${level}]`, message, ...optionalParams);
    } else if (level === 'DEBUG') {
      console.debug(`[${level}]`, message, ...optionalParams);
    } else {
      console.log(`[${level}]`, message, ...optionalParams);
    }
  }
};

// Helper functions for each level, now accepting loggingLevel
export const debug = (
  userLoggingLevel: UserLoggingLevel,
  message: any,
  ...optionalParams: any[]
) => log(userLoggingLevel, 'DEBUG', message, ...optionalParams);
export const info = (
  userLoggingLevel: UserLoggingLevel,
  message: any,
  ...optionalParams: any[]
) => log(userLoggingLevel, 'INFO', message, ...optionalParams);
export const warn = (
  userLoggingLevel: UserLoggingLevel,
  message: any,
  ...optionalParams: any[]
) => log(userLoggingLevel, 'WARN', message, ...optionalParams);
export const error = (
  userLoggingLevel: UserLoggingLevel,
  message: any,
  ...optionalParams: any[]
) => log(userLoggingLevel, 'ERROR', message, ...optionalParams);
