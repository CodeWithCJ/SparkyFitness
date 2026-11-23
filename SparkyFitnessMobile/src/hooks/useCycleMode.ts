import { useCycleSettings } from './useCycleSettings';
import type { CycleMode } from '../types/womensHealth';

/**
 * How cycle tracking is set up: mode, terminology, whether its setup ran.
 * Whether cycle shows at all is a feature switch: ask `useMobileFeatures`.
 */
export function useCycleMode() {
  const { settings, isLoading, refetch } = useCycleSettings();

  const mode: CycleMode = settings?.mode ?? 'standard';
  const discreetMode = settings?.discreet_mode ?? false;
  const terminology = settings?.terminology ?? 'default';
  const onboardedAt = settings?.onboarded_at ?? null;

  return {
    mode,
    discreetMode,
    terminology,
    onboardedAt,
    isLoading,
    refetch,
  };
}
