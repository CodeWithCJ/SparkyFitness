import { createBooleanPreference } from './booleanPreference';

// Defaults to visible so existing users see no change until they opt out.
const hydrationCardPref = createBooleanPreference('@HealthConnect:hydrationCardVisible', true);

export const initializeHydrationCardVisibility = hydrationCardPref.initialize;
export const setHydrationCardVisible = hydrationCardPref.set;
export const getHydrationCardVisible = hydrationCardPref.get;
export const useHydrationCardVisible = hydrationCardPref.use;

/** Test-only helper — resets module-level state. */
export const __resetHydrationCardVisibilityForTests = hydrationCardPref.__reset;
