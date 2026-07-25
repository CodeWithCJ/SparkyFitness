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
    catPink,
    catGreen,
    catBlue,
    catViolet,
    catAmber,
    surfaceBg,
    accentPrimary,
  ] = useCSSVariable([
    '--color-cat-pink',
    '--color-cat-green',
    '--color-cat-blue',
    '--color-cat-violet',
    '--color-cat-amber',
    '--color-surface',
    '--color-accent-primary',
  ]) as [string, string, string, string, string, string, string];

  return {
    accent: accentPrimary || '#e87ba4',
    accentMuted: catPink || '#f3aec7',
    surfaceTint: surfaceBg || '#fdf1f5',
    phaseMenstrual: catPink || '#e34948',
    phaseFollicular: catGreen || '#008300',
    phaseOvulation: catBlue || '#2a78d6',
    phaseLuteal: catViolet || '#4a3aa7',
    phasePregnant: catPink || '#e87ba4',
    categoryAmber: catAmber || '#eda100',
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
