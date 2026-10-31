import { Platform } from 'react-native';
import { linearLayoutTransition } from '../../src/utils/layoutTransition';

describe('linearLayoutTransition', () => {
  it('returns no layout transition on Android', () => {
    const osSpy = jest.replaceProperty(Platform, 'OS', 'android');
    expect(linearLayoutTransition(300)).toBeUndefined();
    expect(linearLayoutTransition(250, 50)).toBeUndefined();
    expect(linearLayoutTransition()).toBeUndefined();
    osSpy.restore();
  });

  it('keeps the layout transition on iOS', () => {
    const osSpy = jest.replaceProperty(Platform, 'OS', 'ios');
    expect(linearLayoutTransition(300)).toBeDefined();
    expect(linearLayoutTransition(250, 50)).toBeDefined();
    expect(linearLayoutTransition()).toBeDefined();
    osSpy.restore();
  });
});
