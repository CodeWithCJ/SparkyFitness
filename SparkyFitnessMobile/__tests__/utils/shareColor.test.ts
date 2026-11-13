import { isLightColor, normalizeHexColor } from '../../src/utils/shareColor';

describe('normalizeHexColor', () => {
  it('accepts 3 and 6 digit hex with or without the hash', () => {
    expect(normalizeHexColor('#fc4c02')).toBe('#FC4C02');
    expect(normalizeHexColor('fc4c02')).toBe('#FC4C02');
    expect(normalizeHexColor(' #0af ')).toBe('#00AAFF');
  });

  it('rejects anything else', () => {
    expect(normalizeHexColor('')).toBeNull();
    expect(normalizeHexColor('#12')).toBeNull();
    expect(normalizeHexColor('#12345')).toBeNull();
    expect(normalizeHexColor('#GGGGGG')).toBeNull();
  });
});

describe('isLightColor', () => {
  it('treats white and yellow as light, black and blue as dark', () => {
    expect(isLightColor('#FFFFFF')).toBe(true);
    expect(isLightColor('#FFCC00')).toBe(true);
    expect(isLightColor('#111111')).toBe(false);
    expect(isLightColor('#0A84FF')).toBe(false);
  });

  it('falls back to light for an invalid color', () => {
    expect(isLightColor('nope')).toBe(true);
  });
});
