import { useCSSVariable } from 'uniwind';

export interface MedicationStatusColors {
  success: string;
  warning: string;
  orange: string;
  danger: string;
  neutral: string;
  sideEffect: string;
  generalSymptom: string;
  track: string;
}

/** Theme colors shared by the adherence card, month calendar and day log. */
export function useMedicationStatusColors(): MedicationStatusColors {
  const [
    success,
    warning,
    orange,
    danger,
    neutral,
    sideEffect,
    generalSymptom,
    track,
  ] = useCSSVariable([
    '--color-icon-success',
    '--color-icon-warning',
    '--color-cat-orange',
    '--color-icon-danger',
    '--color-cat-slate',
    '--color-cat-pink',
    '--color-cat-violet',
    '--color-progress-track',
  ]) as [string, string, string, string, string, string, string, string];
  return {
    success,
    warning,
    orange,
    danger,
    neutral,
    sideEffect,
    generalSymptom,
    track,
  };
}
