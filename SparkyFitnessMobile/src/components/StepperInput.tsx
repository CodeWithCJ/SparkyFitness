import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, type TextInputProps } from 'react-native';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';

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
        onFocus={(e: never) => {
          setIsFocused(true);
          externalOnFocus?.(e);
        }}
        onBlur={(e: never) => {
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
