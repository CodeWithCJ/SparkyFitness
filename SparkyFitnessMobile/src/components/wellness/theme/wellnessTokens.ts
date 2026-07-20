import { useUniwind } from 'uniwind';

/**
 * Scoped "wellness" color identity for the cycle/pregnancy feature — plain
 * constants, NOT new global `--color-*` CSS variables. Only components under
 * `src/components/wellness/` should reference these, for accent color,
 * ring/glyph fills, and phase-colored calendar cells; everything else (card
 * chrome, borders, backgrounds, buttons) keeps using the app's existing
 * `--color-*` tokens via `useCSSVariable` so wellness screens still look
 * native to the app.
 *
 * These hex values are reused, unmodified, from this repo's `dataviz` skill
 * reference palette (`references/palette.md`) — its magenta/violet slots
 * double as this feature's rose/lavender identity, and its red/green/blue
 * slots (which pass the CVD/contrast validator as a mutually co-occurring
 * trio, since a period day, a fertile day, and an ovulation day can all
 * appear together in one calendar month) become the cycle-phase colors.
 * Do not hand-tune these — if the palette ever needs to change, re-run
 * `node scripts/validate_palette.js` from the `dataviz` skill and pick a new
 * validated set rather than eyeballing a tweak.
 */

export interface WellnessPalette {
  /** Primary rose accent — used for the pregnant-mode identity and general highlights. */
  accent: string;
  /** Lighter/muted variant of the accent, for secondary emphasis. */
  accentMuted: string;
  /** Soft accent-tinted surface wash, for subtle card backgrounds. */
  surfaceTint: string;
  phaseMenstrual: string;
  phaseFollicular: string;
  phaseOvulation: string;
  phaseLuteal: string;
  phasePregnant: string;
  /** The "amber" symptom category from shared's SYMPTOM_CATEGORY_COLOR (skin). */
  categoryAmber: string;
}

const LIGHT: WellnessPalette = {
  accent: '#e87ba4',
  accentMuted: '#f3aec7',
  surfaceTint: '#fdf1f5',
  phaseMenstrual: '#e34948',
  phaseFollicular: '#008300',
  phaseOvulation: '#2a78d6',
  phaseLuteal: '#4a3aa7',
  phasePregnant: '#e87ba4',
  categoryAmber: '#eda100',
};

const DARK: WellnessPalette = {
  accent: '#d55181',
  accentMuted: '#e28fad',
  surfaceTint: '#241820',
  phaseMenstrual: '#e66767',
  phaseFollicular: '#008300',
  phaseOvulation: '#3987e5',
  phaseLuteal: '#9085e9',
  phasePregnant: '#d55181',
  categoryAmber: '#c98500',
};

// AMOLED shares dark's hues (validated against the AMOLED surface separately);
// only the surface tint darkens further to sit on a near-black background.
const AMOLED: WellnessPalette = {
  ...DARK,
  surfaceTint: '#180f16',
};

const PALETTES: Record<'light' | 'dark' | 'amoled', WellnessPalette> = {
  light: LIGHT,
  dark: DARK,
  amoled: AMOLED,
};

export function useWellnessTokens(): WellnessPalette {
  const { theme } = useUniwind();
  return PALETTES[theme === 'dark' || theme === 'amoled' ? theme : 'light'];
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
