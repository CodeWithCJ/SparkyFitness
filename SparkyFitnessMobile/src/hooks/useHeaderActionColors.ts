import { Platform } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { useNativeIOSTabsActive } from '../services/nativeTabBarPreference';

export function resolveHeaderActionColors(
  os: string,
  _version: number | string,
  accentColor: string,
  textColor: string,
  usesNativeTabs = false,
) {
  // Liquid Glass path (iOS 26 with the glass tab bar on): keep the header
  // monochrome — every action, including save, takes the text color.
  if (os === 'ios' && usesNativeTabs) {
    return { defaultColor: textColor, saveColor: textColor };
  }

  // Every non-glass path (Android, iOS < 26 classic headers, and iOS 26 with
  // the glass tab bar off): neutral navigation/secondary actions with exactly
  // one accented primary/save action, matching Material Design.
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
