import {
  isFeatureEnabled,
  type ChoiceFeatureKey,
  type FeatureChoicesResponse,
} from '@workspace/shared';

/**
 * Whether a feature switched through `feature_choices` (#3487) is on in this
 * app. `unknown` until the choices have been read (they are loading, or the
 * read failed), so nothing that acts on it, such as the medication and
 * brushing reminders, is decided on a guess.
 */
export type FeatureOnState = 'on' | 'off' | 'unknown';

/**
 * The feature's state from the choices `fetchFeatureChoices` gives: undefined
 * while they are not known, null from a server older than Features (every
 * feature is then at its default).
 */
export function featureOnState(
  feature: ChoiceFeatureKey,
  response: FeatureChoicesResponse | null | undefined
): FeatureOnState {
  if (response === undefined) return 'unknown';
  return isFeatureEnabled(feature, 'mobile', {
    choices: response?.feature_choices,
    cycleEnabled: undefined,
  })
    ? 'on'
    : 'off';
}
