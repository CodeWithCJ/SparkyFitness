import { useCycleSettings } from './useCycleSettings';

export interface UseDiscreetModeResult {
  discreetMode: boolean;
  isLoading: boolean;
  isError: boolean;
}

/**
 * Centralized discreet mode hook with fail-closed privacy logic.
 *
 * Fail-closed guarantee: while settings are loading, in error state,
 * or explicitly set to true, `discreetMode` returns `true` to protect
 * sensitive health data from flashing on screen.
 */
export function useDiscreetMode(): UseDiscreetModeResult {
  const { settings, isLoading, isError } = useCycleSettings();

  const discreetMode =
    isLoading || isError || (settings?.discreet_mode ?? false);

  return {
    discreetMode,
    isLoading,
    isError,
  };
}
