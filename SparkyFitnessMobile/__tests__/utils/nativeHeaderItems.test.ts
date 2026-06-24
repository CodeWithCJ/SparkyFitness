import {
  createIOSNativeHeaderOptions,
  createIOSSmallNativeHeaderOptions,
} from '../../src/utils/nativeHeaderItems';

describe('native header options', () => {
  it('uses accent color for controls and text color for titles', () => {
    const options = createIOSNativeHeaderOptions('#0A84FF', '#111827');

    expect(options.headerTintColor).toBe('#0A84FF');
    expect(options.headerTitleStyle).toMatchObject({ color: '#111827' });
    expect(options.headerLargeTitleStyle).toMatchObject({ color: '#111827' });
  });

  it('keeps small headers from enabling large titles', () => {
    const options = createIOSSmallNativeHeaderOptions('#0A84FF', '#111827');

    expect(options.headerLargeTitleEnabled).toBe(false);
    expect(options.headerTintColor).toBe('#0A84FF');
  });
});
