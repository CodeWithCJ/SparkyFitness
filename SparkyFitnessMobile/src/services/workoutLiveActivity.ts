// Platform-neutral Live Activity entry point (Android-resolved). Live
// Activities are iOS-only; Metro picks the `.ios.ts` sibling on iOS. The
// split must stay at module level — the iOS implementation's layout import
// runs `createLiveActivity` at module scope, which would evaluate iOS-only
// native modules in the Android bundle.
export async function initWorkoutLiveActivity(): Promise<void> {}

export function __resetWorkoutLiveActivityForTests(): void {}
