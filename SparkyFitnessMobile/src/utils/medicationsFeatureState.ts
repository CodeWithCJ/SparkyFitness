import {
  isFeatureEnabled,
  type FeatureChoicesResponse,
} from '@workspace/shared';

/**
 * Whether Medications (#3487) is on in this app. `unknown` until the choices
 * have been read (they are loading, or the read failed), so nothing that acts
 * on it, such as the reminders, is decided on a guess.
 */
export type MedicationsFeatureState = 'on' | 'off' | 'unknown';

/**
 * Medications' state from the choices `fetchFeatureChoices` gives: undefined
 * while they are not known, null from a server older than Features (every
 * feature is then at its default, on).
 */
export function medicationsFeatureState(
  response: FeatureChoicesResponse | null | undefined
): MedicationsFeatureState {
  if (response === undefined) return 'unknown';
  return isFeatureEnabled('medications', 'mobile', {
    choices: response?.feature_choices,
    cycleEnabled: undefined,
  })
    ? 'on'
    : 'off';
}
