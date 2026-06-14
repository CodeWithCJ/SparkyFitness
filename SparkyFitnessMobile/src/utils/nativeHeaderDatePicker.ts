export type NativeHeaderDatePickerKey = 'Dashboard' | 'Diary';

export type NativeHeaderDatePickerHandlers = {
  selectedDate: string;
  onPreviousDate: () => void;
  onDatePress: () => void;
  onNextDate: () => void;
};

const nativeHeaderDatePickerHandlers: Partial<Record<NativeHeaderDatePickerKey, NativeHeaderDatePickerHandlers>> = {};

export function setNativeHeaderDatePickerHandlers(
  key: NativeHeaderDatePickerKey,
  handlers: NativeHeaderDatePickerHandlers,
) {
  nativeHeaderDatePickerHandlers[key] = handlers;
}

export function getNativeHeaderDatePickerHandlers(key: NativeHeaderDatePickerKey) {
  return nativeHeaderDatePickerHandlers[key];
}
