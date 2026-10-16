import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

interface NativeStepCounter {
  /** Steps since the last boot, from the hardware counter. Null when it cannot be read. */
  readSinceBoot(): Promise<number | null>;
}

// Null on iOS and in a build made before this module existed. Callers treat
// that the same as a phone with no step sensor: no estimate.
const native: NativeStepCounter | null =
  Platform.OS === 'android'
    ? requireOptionalNativeModule<NativeStepCounter>('StepCounter')
    : null;

/** Cumulative steps since boot, or null when the sensor cannot be read. */
export function readStepCounterSinceBoot(): Promise<number | null> {
  if (!native) return Promise.resolve(null);
  return native.readSinceBoot().then(
    (value) =>
      typeof value === 'number' && Number.isFinite(value) && value >= 0
        ? value
        : null,
    () => null
  );
}
