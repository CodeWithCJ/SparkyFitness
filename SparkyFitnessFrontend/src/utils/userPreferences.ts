import type { UserLoggingLevel } from './logging';

let currentUserLoggingLevel: UserLoggingLevel = 'ERROR'; // Default logging level

export const setUserLoggingLevel = (level: UserLoggingLevel) => {
  currentUserLoggingLevel = level;
};

export const getUserLoggingLevel = (): UserLoggingLevel => {
  return currentUserLoggingLevel;
};
