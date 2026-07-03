const LOGGING_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  SILENT: 4,
} as const;

type LogLevel = keyof typeof LOGGING_LEVELS;
export type UserLoggingLevel = LogLevel;

export const log = (
  userLoggingLevel: UserLoggingLevel,
  level: LogLevel,
  message: unknown,
  ...optionalParams: unknown[]
) => {
  const userLevelValue = LOGGING_LEVELS[userLoggingLevel];
  const messageLevelValue = LOGGING_LEVELS[level];

  if (messageLevelValue >= userLevelValue) {
    const prefix = `[${level}]`;

    switch (level) {
      case 'ERROR':
        console.error(prefix, message, ...optionalParams);
        break;
      case 'WARN':
        console.warn(prefix, message, ...optionalParams);
        break;
      case 'INFO':
        console.info(prefix, message, ...optionalParams);
        break;
      case 'DEBUG':
        console.debug(prefix, message, ...optionalParams);
        break;
      default:
        console.log(prefix, message, ...optionalParams);
    }
  }
};

export const debug = (
  userLoggingLevel: UserLoggingLevel,
  message: unknown,
  ...optionalParams: unknown[]
) => log(userLoggingLevel, 'DEBUG', message, ...optionalParams);

export const info = (
  userLoggingLevel: UserLoggingLevel,
  message: unknown,
  ...optionalParams: unknown[]
) => log(userLoggingLevel, 'INFO', message, ...optionalParams);

export const warn = (
  userLoggingLevel: UserLoggingLevel,
  message: unknown,
  ...optionalParams: unknown[]
) => log(userLoggingLevel, 'WARN', message, ...optionalParams);

export const error = (
  userLoggingLevel: UserLoggingLevel,
  message: unknown,
  ...optionalParams: unknown[]
) => log(userLoggingLevel, 'ERROR', message, ...optionalParams);
