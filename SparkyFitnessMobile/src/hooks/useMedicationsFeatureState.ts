import { medicationsFeatureState } from '../utils/medicationsFeatureState';
import { useFeatureChoicesQuery } from './useFeatureChoices';

/**
 * Whether Medications (#3487) is on in this app, for code that must not act
 * while that is unknown (the medication reminders). Reads only the feature
 * choices, unlike `useMobileFeatures`, which also loads the cycle settings and
 * gives the default while the choices load.
 */
export function useMedicationsFeatureState() {
  const { data, refetch } = useFeatureChoicesQuery();
  return { state: medicationsFeatureState(data), refetch };
}
