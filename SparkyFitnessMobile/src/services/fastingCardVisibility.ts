import { createBooleanPreference } from './booleanPreference';

// Defaults to visible so existing users see no change until they opt out.
const fastingCardPref = createBooleanPreference('@HealthConnect:fastingCardVisible', true);

export const initializeFastingCardVisibility = fastingCardPref.initialize;
export const setFastingCardVisible = fastingCardPref.set;
export const getFastingCardVisible = fastingCardPref.get;
export const useFastingCardVisible = fastingCardPref.use;

/** Test-only helper — resets module-level state. */
export const __resetFastingCardVisibilityForTests = fastingCardPref.__reset;
