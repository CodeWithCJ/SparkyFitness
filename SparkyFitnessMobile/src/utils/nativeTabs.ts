import { Platform } from 'react-native';

export const NATIVE_IOS_TABS_MIN_VERSION = 26;

export function supportsNativeIOSTabs(
  os: string,
  version: number | string,
): boolean {
  if (os !== 'ios') return false;

  const majorVersion =
    typeof version === 'number'
      ? Math.trunc(version)
      : Number.parseInt(version, 10);

  return (
    Number.isFinite(majorVersion) &&
    majorVersion >= NATIVE_IOS_TABS_MIN_VERSION
  );
}

export function shouldUseNativeIOSTabs(): boolean {
  return supportsNativeIOSTabs(Platform.OS, Platform.Version);
}
