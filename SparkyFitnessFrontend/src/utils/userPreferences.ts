import type { UserLoggingLevel } from './logging';

const currentUserLoggingLevel: UserLoggingLevel = 'ERROR'; // Default logging level

export const getUserLoggingLevel = (): UserLoggingLevel => {
  return currentUserLoggingLevel;
};
