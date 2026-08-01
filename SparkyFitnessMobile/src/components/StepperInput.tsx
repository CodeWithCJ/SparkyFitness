import React, { useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  type NativeSyntheticEvent,
  type TextInputFocusEventData,
  type TextInputProps,
} from 'react-native';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';

interface StepperDraftOptions {
  /** Committed value, shown whenever the field is not mid-edit. */
  value: number;
  min: number;
  max: number;
  /** Amount the +/- buttons move by. Defaults to 1. */
  step?: number;
  onCommit: (value: number) => void;
  /** Called when an optional field is left empty. Required fields omit this. */
  onClear?: () => void;
}

interface StepperDraftProps {
  value: string;
  onChangeText: (text: string) => void;
  onBlur: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
}

/**
 * Holds keystrokes for a bounded integer field in local state so a partial
 * entry ("2" on the way to "28") is never clamped or pushed to a caller that
 * rejects out-of-range values. In-range text commits as it is typed; anything
 * still out of range is clamped and committed on blur. Empty text restores a
 * required field or invokes the optional field's clear handler.
 */
export function useStepperDraft({
  value,
  min,
  max,
  step = 1,
  onCommit,
  onClear,
}: StepperDraftOptions): StepperDraftProps {
  const [draft, setDraft] = useState<string | null>(null);

  const handleChangeText = (text: string) => {
    if (text !== '' && !/^\d+$/.test(text)) return;
    setDraft(text);
    const parsed = parseInt(text, 10);
    if (!Number.isNaN(parsed) && parsed >= min && parsed <= max && parsed !== value) {
      onCommit(parsed);
    }
  };

  const handleBlur = () => {
    if (draft === null) return;
    setDraft(null);
    if (draft === '') {
      onClear?.();
      return;
    }
    const parsed = parseInt(draft, 10);
    const clamped = Math.max(min, Math.min(max, parsed));
    if (clamped !== value) onCommit(clamped);
  };

  const adjust = (delta: number) => {
    const parsed = draft === null ? NaN : parseInt(draft, 10);
    const base = Number.isNaN(parsed) ? value : parsed;
    setDraft(null);
    const next = Math.max(min, Math.min(max, base + delta));
    if (next !== value) onCommit(next);
  };

  return {
    value: draft ?? String(value),
    onChangeText: handleChangeText,
    onBlur: handleBlur,
    onIncrement: () => adjust(step),
    onDecrement: () => adjust(-step),
  };
}

interface StepperInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onBlur?: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
  keyboardType?: 'decimal-pad' | 'number-pad';
  placeholder?: string;
  selectTextOnFocus?: boolean;
  /** Override the TextInput component (e.g., BottomSheetTextInput) */
  InputComponent?: React.ComponentType<any>;
  /** Extra props forwarded to the text input */
  inputProps?: Partial<TextInputProps>;
  /** Ref forwarded to the underlying text input for imperative focus control */
  inputRef?: React.Ref<TextInput>;
  /** Compact size for inline use in set rows */
  compact?: boolean;
}

type TextInputFocusEvent = NativeSyntheticEvent<TextInputFocusEventData>;

function StepperInput({
  value,
  onChangeText,
  onBlur,
  onIncrement,
  onDecrement,
  keyboardType = 'decimal-pad',
  placeholder = '0',
  selectTextOnFocus = true,
  InputComponent = TextInput,
  inputProps,
  inputRef,
  compact = false,
}: StepperInputProps) {
  const [accentColor, borderSubtle] = useCSSVariable([
    '--color-accent-primary',
    '--color-border-subtle',
  ]) as [string, string];
  const [isFocused, setIsFocused] = useState(false);

  const size = compact ? 32 : 40;
  const inputWidth = compact ? 48 : 56;
  const iconSize = compact ? 18 : 20;
  const fontSize = compact ? 16 : 20;

  const borderColor = isFocused ? accentColor : borderSubtle;
  const { onFocus: externalOnFocus, onBlur: externalOnBlur, ...restInputProps } = inputProps ?? {};

  return (
    <View
      className="flex-row items-center bg-raised rounded-lg overflow-hidden"
      style={{ borderWidth: 1, borderColor }}
    >
      <TouchableOpacity
        onPress={onDecrement}
        style={{ width: size, height: size, borderRightWidth: 1, borderRightColor: borderColor }}
        className="items-center justify-center"
        activeOpacity={0.7}
      >
        <Icon name="remove" size={iconSize} color={accentColor} />
      </TouchableOpacity>
      <InputComponent
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        onFocus={(e: TextInputFocusEvent) => {
          setIsFocused(true);
          externalOnFocus?.(e);
        }}
        onBlur={(e: TextInputFocusEvent) => {
          setIsFocused(false);
          onBlur?.();
          externalOnBlur?.(e);
        }}
        keyboardType={keyboardType}
        placeholder={placeholder}
        selectTextOnFocus={selectTextOnFocus}
        className="text-text-primary text-base text-center"
        style={{ width: inputWidth, height: size, fontSize, lineHeight: fontSize + 2, padding: 0 }}
        {...restInputProps}
      />
      <TouchableOpacity
        onPress={onIncrement}
        style={{ width: size, height: size, borderLeftWidth: 1, borderLeftColor: borderColor }}
        className="items-center justify-center"
        activeOpacity={0.7}
      >
        <Icon name="add" size={iconSize} color={accentColor} />
      </TouchableOpacity>
    </View>
  );
}

export default React.memo(StepperInput);
