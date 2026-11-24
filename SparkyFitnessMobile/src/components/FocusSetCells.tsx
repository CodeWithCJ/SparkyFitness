import React, { useState } from 'react';
import {
  Pressable,
  Text,
  TextInput,
  View,
  type TextInputInstance,
} from 'react-native';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';

type FocusKeyboardType =
  'decimal-pad' | 'number-pad' | 'numbers-and-punctuation' | 'numeric';

interface CellInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  keyboardType?: FocusKeyboardType;
  placeholder?: string;
  accessibilityLabel: string;
  inputRef?: React.Ref<TextInputInstance>;
  /** Overrides the value color (an effort tone). */
  textColor?: string;
  /** Ring color while the cell does not hold the keyboard (the resting set). */
  ringColor?: string;
  /** False shows the value read-only (e.g. while a set stopwatch runs). */
  editable?: boolean;
}

/**
 * One editable cell of the focus view's set table: a 44 pt rounded control
 * whose number is centered and bold, ringed in the accent while it holds the
 * keyboard. The chrome sits on a wrapper and the input is bone stock (explicit
 * height, no padding), which keeps Android's EditText from mislaying its text.
 */
export function TableCellInput({
  value,
  onChangeText,
  onFocus,
  onBlur,
  keyboardType = 'decimal-pad',
  placeholder = '',
  accessibilityLabel,
  inputRef,
  textColor,
  ringColor,
  editable = true,
}: CellInputProps) {
  const [focused, setFocused] = useState(false);
  const [accent, muted, primary] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
    '--color-text-primary',
  ]) as [string, string, string];
  return (
    <View
      className="h-11 justify-center rounded-[14px] bg-raised"
      style={{
        borderWidth: 2,
        borderColor: focused ? accent : (ringColor ?? 'transparent'),
      }}
    >
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => {
          setFocused(true);
          onFocus?.();
        }}
        onBlur={() => {
          setFocused(false);
          onBlur?.();
        }}
        keyboardType={keyboardType}
        editable={editable}
        selectTextOnFocus
        placeholder={placeholder}
        placeholderTextColor={muted}
        accessibilityLabel={accessibilityLabel}
        style={{
          height: 36,
          padding: 0,
          textAlign: 'center',
          fontSize: 19,
          lineHeight: 21,
          fontWeight: '700',
          color: textColor ?? primary,
          fontVariant: ['tabular-nums'],
        }}
      />
    </View>
  );
}

interface HeroStepperProps extends CellInputProps {
  onIncrement: () => void;
  onDecrement: () => void;
  incrementLabel: string;
  decrementLabel: string;
}

/** A round 44 pt −/+ button on the active-set card. */
function StepButton({
  icon,
  onPress,
  label,
}: {
  icon: 'add' | 'remove';
  onPress: () => void;
  label: string;
}) {
  const primary = String(useCSSVariable('--color-text-primary'));
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      className="h-11 w-11 items-center justify-center rounded-full bg-control active:opacity-70"
    >
      <Icon name={icon} size={20} color={primary} weight="bold" />
    </Pressable>
  );
}

/** The active-set card's [−] big number [+] control. */
export function HeroStepper({
  onIncrement,
  onDecrement,
  incrementLabel,
  decrementLabel,
  value,
  onChangeText,
  onFocus,
  onBlur,
  keyboardType = 'decimal-pad',
  placeholder,
  accessibilityLabel,
  inputRef,
  textColor,
}: HeroStepperProps) {
  const [muted, primary] = useCSSVariable([
    '--color-text-muted',
    '--color-text-primary',
  ]) as [string, string];
  return (
    <View className="flex-row items-center">
      <StepButton icon="remove" onPress={onDecrement} label={decrementLabel} />
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        onFocus={onFocus}
        onBlur={onBlur}
        keyboardType={keyboardType}
        selectTextOnFocus
        placeholder={placeholder}
        placeholderTextColor={muted}
        accessibilityLabel={accessibilityLabel}
        style={{
          flex: 1,
          minWidth: 0,
          height: 40,
          padding: 0,
          textAlign: 'center',
          fontSize: 26,
          lineHeight: 28,
          fontWeight: '700',
          color: textColor ?? primary,
          fontVariant: ['tabular-nums'],
        }}
      />
      <StepButton icon="add" onPress={onIncrement} label={incrementLabel} />
    </View>
  );
}

/** Small uppercase label used over a hero field. */
export function HeroLabel({
  children,
  accent = false,
}: {
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <Text
      className={`text-xs font-bold uppercase ${accent ? 'text-accent-primary' : 'text-text-secondary'}`}
      style={{ letterSpacing: 0.7 }}
    >
      {children}
    </Text>
  );
}
