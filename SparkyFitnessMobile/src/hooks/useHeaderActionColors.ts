import { Platform } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { supportsNativeIOSTabs } from '../utils/nativeTabs';
import { useNativeIOSTabsActive } from '../services/nativeTabBarPreference';

export function resolveHeaderActionColors(
  os: string,
  version: number | string,
  accentColor: string,
  textColor: string,
  usesNativeTabs = supportsNativeIOSTabs(os, version),
) {
  if (os === 'ios') {
    const color = usesNativeTabs ? textColor : accentColor;
    return { defaultColor: color, saveColor: color };
  }

  return {
    defaultColor: textColor,
    saveColor: accentColor,
  };
}

export function useHeaderActionColors() {
  const [accentColor, textColor] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-primary',
  ]) as [string, string];
  const usesNativeTabs = useNativeIOSTabsActive();

  const resolved = resolveHeaderActionColors(
    Platform.OS,
    Platform.Version,
    accentColor || '#0A84FF',
    textColor || '#111827',
    usesNativeTabs,
  );

  return {
    ...resolved,
    // Semantic aliases for manually rendered Android headers. Consumers should
    // not choose theme colors directly: back/cancel use the text color while
    // save remains accented on Android.
    backColor: resolved.defaultColor,
    actionColor: resolved.defaultColor,
    headerTintColor: resolved.defaultColor,
  };
}
