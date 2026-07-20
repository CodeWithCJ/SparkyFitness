import { renderHook } from '@testing-library/react-native';
import { useUniwind } from 'uniwind';
import {
  useWellnessTokens,
  resolveSymptomCategoryColor,
  type WellnessPalette,
} from '../../../../src/components/wellness/theme/wellnessTokens';

const REQUIRED_KEYS = [
  'accent',
  'accentMuted',
  'surfaceTint',
  'phaseMenstrual',
  'phaseFollicular',
  'phaseOvulation',
  'phaseLuteal',
  'phasePregnant',
  'categoryAmber',
];

describe('useWellnessTokens', () => {
  it('returns a full palette for light theme', () => {
    (useUniwind as jest.Mock).mockReturnValue({ theme: 'light', hasAdaptiveThemes: false });
    const { result } = renderHook(() => useWellnessTokens());
    REQUIRED_KEYS.forEach((key) => {
      expect(result.current).toHaveProperty(key);
      expect(typeof (result.current as Record<string, string>)[key]).toBe('string');
    });
  });

  it('returns a distinct palette for dark vs light theme', () => {
    (useUniwind as jest.Mock).mockReturnValue({ theme: 'dark', hasAdaptiveThemes: false });
    const { result: dark } = renderHook(() => useWellnessTokens());
    (useUniwind as jest.Mock).mockReturnValue({ theme: 'light', hasAdaptiveThemes: false });
    const { result: light } = renderHook(() => useWellnessTokens());

    expect(dark.current.phaseMenstrual).not.toBe(light.current.phaseMenstrual);
  });

  it('returns a full palette for amoled theme', () => {
    (useUniwind as jest.Mock).mockReturnValue({ theme: 'amoled', hasAdaptiveThemes: false });
    const { result } = renderHook(() => useWellnessTokens());
    REQUIRED_KEYS.forEach((key) => {
      expect(result.current).toHaveProperty(key);
    });
  });
});

describe('resolveSymptomCategoryColor', () => {
  const tokens = {
    accent: '#a',
    accentMuted: '#b',
    surfaceTint: '#c',
    phaseMenstrual: '#menstrual',
    phaseFollicular: '#follicular',
    phaseOvulation: '#ovulation',
    phaseLuteal: '#luteal',
    phasePregnant: '#pregnant',
    categoryAmber: '#amber',
  } as WellnessPalette;

  it('maps shared color tokens to palette hexes', () => {
    expect(resolveSymptomCategoryColor('period', tokens, '#neutral')).toBe('#menstrual');
    expect(resolveSymptomCategoryColor('lavender', tokens, '#neutral')).toBe('#luteal');
    expect(resolveSymptomCategoryColor('green', tokens, '#neutral')).toBe('#follicular');
    expect(resolveSymptomCategoryColor('sky', tokens, '#neutral')).toBe('#ovulation');
    expect(resolveSymptomCategoryColor('amber', tokens, '#neutral')).toBe('#amber');
  });

  it('falls back to the neutral color for unknown/neutral tokens', () => {
    expect(resolveSymptomCategoryColor('neutral', tokens, '#neutral')).toBe('#neutral');
    expect(resolveSymptomCategoryColor('unknown', tokens, '#neutral')).toBe('#neutral');
  });
});
