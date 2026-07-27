import { useCSSVariable } from 'uniwind';

export interface WellnessPalette {
  accent: string;
  accentMuted: string;
  surfaceTint: string;
  phaseMenstrual: string;
  phaseFollicular: string;
  phaseOvulation: string;
  phaseLuteal: string;
  phasePregnant: string;
  categoryAmber: string;
}

export function useWellnessTokens(): WellnessPalette {
  const [
    phaseMenstrual,
    phaseFollicular,
    phaseOvulation,
    phaseLuteal,
    phasePregnant,
    categoryAmber,
    surfaceBg,
    accentPrimary,
    accentMuted,
  ] = useCSSVariable([
    '--color-wellness-menstrual',
    '--color-wellness-follicular',
    '--color-wellness-ovulation',
    '--color-wellness-luteal',
    '--color-wellness-pregnant',
    '--color-cat-amber',
    '--color-surface',
    '--color-accent-primary',
    '--color-accent-muted',
  ]) as [string, string, string, string, string, string, string, string, string];

  return {
    accent: accentPrimary,
    accentMuted: accentMuted || phasePregnant,
    surfaceTint: surfaceBg,
    phaseMenstrual,
    phaseFollicular,
    phaseOvulation,
    phaseLuteal,
    phasePregnant,
    categoryAmber,
  };
}

/**
 * Resolves a semantic color name from `shared/src/cycle/constants.ts`'s
 * `SYMPTOM_CATEGORY_COLOR` (e.g. "period", "lavender", "green", "sky",
 * "amber", "neutral") to an actual hex value for the current theme. Keeps
 * the mobile symptom picker's category colors consistent with the rest of
 * the wellness palette instead of maintaining a second, divergent hex list.
 */
export function resolveSymptomCategoryColor(
  colorToken: string,
  tokens: WellnessPalette,
  neutralColor: string,
): string {
  switch (colorToken) {
    case 'period':
      return tokens.phaseMenstrual;
    case 'lavender':
      return tokens.phaseLuteal;
    case 'green':
      return tokens.phaseFollicular;
    case 'sky':
      return tokens.phaseOvulation;
    case 'amber':
      return tokens.categoryAmber;
    default:
      return neutralColor;
  }
}
