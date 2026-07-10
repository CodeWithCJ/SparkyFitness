import fs from 'fs';
import path from 'path';
import withArabicLocalization from '../../plugins/withArabicLocalization';

let mockAndroidResult: Record<string, any>;
let mockInfoPlistResult: Record<string, any>;
let mockDangerousMod:
  | ((config: Record<string, any>) => Promise<Record<string, any>>)
  | undefined;

jest.mock('fs', () => ({
  __esModule: true,
  default: {
    mkdirSync: jest.fn(),
    writeFileSync: jest.fn(),
  },
}));

jest.mock('expo/config-plugins', () => ({
  withAndroidManifest: (
    config: Record<string, any>,
    action: (config: Record<string, any>) => Record<string, any>,
  ) => {
    mockAndroidResult = action({
      ...config,
      modResults: { manifest: { application: [{ $: {} }] } },
    });
    return config;
  },
  withDangerousMod: (
    config: Record<string, any>,
    [, action]: [string, (config: Record<string, any>) => Promise<Record<string, any>>],
  ) => {
    mockDangerousMod = action;
    return config;
  },
  withInfoPlist: (
    config: Record<string, any>,
    action: (config: Record<string, any>) => Record<string, any>,
  ) => {
    mockInfoPlistResult = action({ ...config, modResults: {} });
    return config;
  },
}));

describe('withArabicLocalization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDangerousMod = undefined;
    withArabicLocalization({} as never);
  });

  it('enables RTL and registers the Android locale configuration', () => {
    const application =
      mockAndroidResult.modResults.manifest.application[0].$;

    expect(application).toMatchObject({
      'android:supportsRtl': 'true',
      'android:localeConfig': '@xml/locales_config',
    });
  });

  it('registers Arabic-first iOS localization metadata', () => {
    expect(mockInfoPlistResult.modResults).toMatchObject({
      CFBundleLocalizations: ['ar', 'en'],
      CFBundleDevelopmentRegion: 'ar',
      CFBundleAllowMixedLocalizations: true,
    });
  });

  it('writes the Android locale catalog with Arabic and English', async () => {
    expect(mockDangerousMod).toBeDefined();
    const platformProjectRoot = path.join('tmp', 'android');

    await mockDangerousMod!({
      modRequest: { platformProjectRoot },
    });

    const expectedPath = path.join(
      platformProjectRoot,
      'app/src/main/res/xml/locales_config.xml',
    );
    expect(fs.mkdirSync).toHaveBeenCalledWith(path.dirname(expectedPath), {
      recursive: true,
    });
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expectedPath,
      expect.stringContaining('<locale android:name="ar-SA" />'),
    );
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expectedPath,
      expect.stringContaining('<locale android:name="en" />'),
    );
  });
});
