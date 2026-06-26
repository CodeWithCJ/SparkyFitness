import { createBooleanPreference } from './booleanPreference';

// Defaults to visible so existing users see no change until they opt out.
const askSparkyPref = createBooleanPreference('@HealthConnect:askSparkyVisible', true);

export const initializeAskSparkyVisibility = askSparkyPref.initialize;
export const setAskSparkyVisible = askSparkyPref.set;
export const getAskSparkyVisible = askSparkyPref.get;
export const useAskSparkyVisible = askSparkyPref.use;

/** Test-only helper — resets module-level state. */
export const __resetAskSparkyVisibilityForTests = askSparkyPref.__reset;
