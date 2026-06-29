import { Platform } from 'react-native';
import {
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from 'expo-glass-effect';

let glassAvailable: boolean | undefined;

export function canUseLiquidGlass(): boolean {
  if (Platform.OS !== 'ios') return false;
  if (glassAvailable === undefined) {
    try {
      glassAvailable = isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
    } catch {
      glassAvailable = false;
    }
  }
  return glassAvailable;
}
