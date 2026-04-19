import * as Haptics from 'expo-haptics';

export function fireSelectionHaptic(): void {
  Haptics.selectionAsync().catch(() => {});
}

export function fireSheetOpenHaptic(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => {});
}

export function fireSuccessHaptic(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
