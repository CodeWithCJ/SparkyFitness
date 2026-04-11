import React from 'react';
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
  const [accentColor] = useCSSVariable(['--color-accent-primary']) as [string];

  const size = compact ? 32 : 40;
  const inputWidth = compact ? 48 : 56;
  const iconSize = compact ? 18 : 20;
  const fontSize = compact ? 16 : 20;

  return (
    <View className="flex-row items-center bg-raised border border-border-subtle rounded-lg overflow-hidden">
      <TouchableOpacity
        onPress={onDecrement}
        style={{ width: size, height: size }}
        className="items-center justify-center border-r border-border-subtle"
        activeOpacity={0.7}
      >
        <Icon name="remove" size={iconSize} color={accentColor} />
      </TouchableOpacity>
      <InputComponent
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
        keyboardType={keyboardType}
        placeholder={placeholder}
        selectTextOnFocus={selectTextOnFocus}
        className="text-text-primary text-base text-center"
        style={{ width: inputWidth, height: size, fontSize, lineHeight: fontSize + 2, padding: 0 }}
        {...inputProps}
      />
      <TouchableOpacity
        onPress={onIncrement}
        style={{ width: size, height: size }}
        className="items-center justify-center border-l border-border-subtle"
        activeOpacity={0.7}
      >
        <Icon name="add" size={iconSize} color={accentColor} />
      </TouchableOpacity>
    </View>
  );
}

export default React.memo(StepperInput);
