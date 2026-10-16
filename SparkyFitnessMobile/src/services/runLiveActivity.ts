// Platform-neutral entry point (Android-resolved). Live Activities are iOS
// only; Metro picks the `.ios.ts` sibling on iOS. The split must stay at module
// level: the iOS implementation's layout import runs `createLiveActivity` at
// module scope, which would evaluate iOS-only native modules in the Android
// bundle.
import type { TFunction } from 'i18next';

export async function initRunLiveActivity(): Promise<void> {}

export function configureRunLiveActivity(_context: {
  t: TFunction;
  distanceUnit: 'km' | 'miles';
}): void {}
