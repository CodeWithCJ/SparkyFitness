import {
  getMetabolicStage,
  protocolBadgeLabel,
  FASTING_PRESETS,
  DEFAULT_PRESET_ID,
  METABOLIC_STAGES,
} from '../../src/constants/fasting';

describe('getMetabolicStage', () => {
  test('returns Anabolic at and below the first boundary', () => {
    expect(getMetabolicStage(0).key).toBe('anabolic');
    expect(getMetabolicStage(3.99).key).toBe('anabolic');
  });

  test('lower bounds are inclusive at each boundary', () => {
    expect(getMetabolicStage(4).key).toBe('catabolic');
    expect(getMetabolicStage(16).key).toBe('fat-burning');
    expect(getMetabolicStage(24).key).toBe('ketosis');
    expect(getMetabolicStage(72).key).toBe('deep-ketosis');
  });

  test('returns the stage just below each boundary', () => {
    expect(getMetabolicStage(15.99).key).toBe('catabolic');
    expect(getMetabolicStage(23.99).key).toBe('fat-burning');
    expect(getMetabolicStage(71.99).key).toBe('ketosis');
    expect(getMetabolicStage(1000).key).toBe('deep-ketosis');
  });

  test('clamps negative and non-finite input to the first stage', () => {
    expect(getMetabolicStage(-5).key).toBe('anabolic');
    expect(getMetabolicStage(NaN).key).toBe('anabolic');
    // Infinity is non-finite, so it defensively clamps to the first stage too.
    expect(getMetabolicStage(Infinity).key).toBe('anabolic');
  });

  test('every stage carries a CSS-variable color name (never a hex)', () => {
    for (const stage of METABOLIC_STAGES) {
      expect(stage.colorVar.startsWith('--color-')).toBe(true);
    }
  });
});

describe('protocolBadgeLabel', () => {
  test('extracts the ratio from a preset name', () => {
    expect(protocolBadgeLabel('16:8 Leangains')).toBe('١٦:٨');
    expect(protocolBadgeLabel('18:6 Warrior')).toBe('١٨:٦');
    expect(protocolBadgeLabel('20:4 Warrior')).toBe('٢٠:٤');
  });

  test('extracts a ratio from arbitrary web-started strings', () => {
    expect(protocolBadgeLabel('Time-restricted 14:10 eating')).toBe('١٤:١٠');
  });

  test('falls back to the raw string when there is no ratio', () => {
    expect(protocolBadgeLabel('Custom Fast')).toBe('صيام مخصص');
    expect(protocolBadgeLabel('Circadian Rhythm')).toBe('الإيقاع اليومي');
    expect(protocolBadgeLabel('My weird fast')).toBe('My weird fast');
  });

  test('returns a neutral label for null/empty input', () => {
    expect(protocolBadgeLabel(null)).toBe('صيام');
    expect(protocolBadgeLabel(undefined)).toBe('صيام');
    expect(protocolBadgeLabel('   ')).toBe('صيام');
  });
});

describe('FASTING_PRESETS', () => {
  test('preserves the circadian id typo verbatim', () => {
    expect(FASTING_PRESETS.some(p => p.id === 'circumadian')).toBe(true);
  });

  test('the default preset exists', () => {
    expect(FASTING_PRESETS.some(p => p.id === DEFAULT_PRESET_ID)).toBe(true);
  });

  test('every preset has a Saudi Arabic display name and description', () => {
    for (const preset of FASTING_PRESETS) {
      expect(preset.displayName).toMatch(/[\u0600-\u06ff]/);
      expect(preset.description).toMatch(/[\u0600-\u06ff]/);
    }
  });
});
