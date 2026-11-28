import type { ChoiceFeatureKey } from '@workspace/shared';
import { featureOnState } from '../utils/featureOnState';
import { useFeatureChoicesQuery } from './useFeatureChoices';

/**
 * Whether a feature switched through `feature_choices` (#3487) is on in this
 * app, for code that must not act while that is unknown (the medication and
 * brushing reminders). Reads only the feature choices, unlike
 * `useMobileFeatures`, which also loads the cycle settings and gives the
 * default while the choices load.
 */
export function useFeatureOnState(feature: ChoiceFeatureKey) {
  const { data, refetch } = useFeatureChoicesQuery();
  return { state: featureOnState(feature, data), refetch };
}
