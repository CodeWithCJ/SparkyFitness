import { useCycleSettings } from './useCycleSettings';
import type { CycleMode } from '../types/womensHealth';

export function useCycleMode() {
  const { settings, isLoading, refetch } = useCycleSettings();

  const enabled = settings?.enabled ?? false;
  const mode: CycleMode = settings?.mode ?? 'standard';
  const discreetMode = settings?.discreet_mode ?? false;
  const terminology = settings?.terminology ?? 'default';
  const onboardedAt = settings?.onboarded_at ?? null;

  return {
    mode,
    enabled,
    discreetMode,
    terminology,
    onboardedAt,
    isLoading,
    refetch,
  };
}
