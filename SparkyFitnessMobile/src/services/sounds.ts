import { createBooleanPreference } from './booleanPreference';

const soundsPref = createBooleanPreference('@HealthConnect:soundsEnabled', true);

export const initializeSounds = soundsPref.initialize;
export const setSoundsEnabled = soundsPref.set;
export const getSoundsEnabled = soundsPref.get;
export const useSoundsEnabled = soundsPref.use;

/** Test-only helper — resets module-level state. */
export const __resetSoundsStateForTests = soundsPref.__reset;
