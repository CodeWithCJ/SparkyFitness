import { resolveHeaderActionColors } from '../../src/hooks/useHeaderActionColors';

describe('resolveHeaderActionColors', () => {
  const accent = '#0A84FF';
  const text = '#111827';

  it('uses accent actions on iOS before 26', () => {
    expect(resolveHeaderActionColors('ios', 18, accent, text)).toEqual({
      defaultColor: accent,
      saveColor: accent,
    });
  });

  it('uses text-colored actions inside iOS 26 glass controls', () => {
    expect(resolveHeaderActionColors('ios', '26.0', accent, text)).toEqual({
      defaultColor: text,
      saveColor: text,
    });
  });

  it('uses text actions and an accent save action on Android', () => {
    expect(resolveHeaderActionColors('android', 36, accent, text)).toEqual({
      defaultColor: text,
      saveColor: accent,
    });
  });
});
