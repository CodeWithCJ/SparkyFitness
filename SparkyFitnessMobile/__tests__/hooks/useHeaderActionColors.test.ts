import { resolveHeaderActionColors } from '../../src/hooks/useHeaderActionColors';

describe('resolveHeaderActionColors', () => {
  const accent = '#0A84FF';
  const text = '#111827';

  it('uses a neutral default and an accent save on iOS < 26 classic headers', () => {
    expect(resolveHeaderActionColors('ios', 18, accent, text)).toEqual({
      defaultColor: text,
      saveColor: accent,
    });
  });

  it('uses text-colored actions inside native glass controls', () => {
    expect(resolveHeaderActionColors('ios', '26.0', accent, text, true)).toEqual({
      defaultColor: text,
      saveColor: text,
    });
  });

  it('uses a neutral default and an accent save on iOS 26 when the glass tab bar is disabled', () => {
    expect(resolveHeaderActionColors('ios', '26.0', accent, text, false)).toEqual({
      defaultColor: text,
      saveColor: accent,
    });
  });

  it('uses text actions and an accent save action on Android', () => {
    expect(resolveHeaderActionColors('android', 36, accent, text)).toEqual({
      defaultColor: text,
      saveColor: accent,
    });
  });
});
