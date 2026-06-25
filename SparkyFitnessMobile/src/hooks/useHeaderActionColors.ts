import { Platform } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { supportsNativeIOSTabs } from '../utils/nativeTabs';

export function resolveHeaderActionColors(
  os: string,
  version: number | string,
  accentColor: string,
  textColor: string,
) {
  if (os === 'ios') {
    const color = supportsNativeIOSTabs(os, version)
      ? textColor
      : accentColor;
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

  const resolved = resolveHeaderActionColors(
    Platform.OS,
    Platform.Version,
    accentColor || '#0A84FF',
    textColor || '#111827',
  );

  return {
    ...resolved,
    headerTintColor: resolved.defaultColor,
  };
}
