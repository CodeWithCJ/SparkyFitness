import type { PlatformFeatureChoices } from '@workspace/shared';

/**
 * Stand-ins for what `useWebFeatures` reads, so a component test runs the real
 * hook (and its acting-on-behalf rule) without a QueryClient:
 *
 *   jest.mock('@/hooks/Settings/useFeatureChoices', () =>
 *     jest.requireActual('@/tests/mocks/webFeatures').featureChoicesModule
 *   );
 *   jest.mock('@/hooks/useCycle', () =>
 *     jest.requireActual('@/tests/mocks/webFeatures').cycleModule
 *   );
 *
 * plus an `@/contexts/ActiveUserContext` mock with `isActingOnBehalf`. Choices
 * left undefined are still loading, so every feature is at its default.
 */
let webChoices: PlatformFeatureChoices | undefined;

export function setWebFeatureChoices(
  choices: PlatformFeatureChoices | undefined
) {
  webChoices = choices;
}

export const setWebFeatureOn = jest.fn();

export const featureChoicesModule = {
  useFeatureChoicesQuery: () => ({
    data:
      webChoices === undefined
        ? undefined
        : { feature_choices: { web: webChoices } },
  }),
  useSetWebFeatureChoice: () => ({
    state: webChoices === undefined ? 'loading' : 'ready',
    isPending: false,
    setFeatureOn: setWebFeatureOn,
    reload: () => {},
  }),
};

export const cycleModule = {
  useCycleSettings: () => ({ data: undefined }),
  useSetCycleEnabledMutation: () => ({ mutate: () => {}, isPending: false }),
};
