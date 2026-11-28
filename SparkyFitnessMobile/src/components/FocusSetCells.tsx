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
 * One editable cell of the focus view's set table: a 34 pt rounded control
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
    '--color-text-secondary',
    '--color-text-primary',
  ]) as [string, string, string];
  return (
    <View
      className="h-[34px] justify-center rounded-[12px] bg-raised"
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
          height: 30,
          padding: 0,
          textAlign: 'center',
          fontSize: 16,
          lineHeight: 19,
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

/** A round 34 pt −/+ button inside an active-set card pill. */
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
      hitSlop={6}
      className="h-[34px] w-[34px] items-center justify-center rounded-full bg-text-primary/10 active:opacity-70"
    >
      <Icon name={icon} size={18} color={primary} weight="bold" />
    </Pressable>
  );
}

/** The active-set card's pill: [−] big number [+], tinted while it holds the keyboard. */
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
  const [focused, setFocused] = useState(false);
  const [muted, primary] = useCSSVariable([
    '--color-text-secondary',
    '--color-text-primary',
  ]) as [string, string];
  return (
    <View
      className={`h-[46px] flex-row items-center rounded-[14px] px-1.5 ${focused ? 'bg-accent-primary/20' : 'bg-control'}`}
    >
      <StepButton icon="remove" onPress={onDecrement} label={decrementLabel} />
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
          fontSize: 24,
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

/**
 * Label over a hero field: a small centred uppercase caption, or with `accent`
 * the card's bold accent "Set 2" heading in normal case.
 */
export function HeroLabel({
  children,
  accent = false,
}: {
  children: React.ReactNode;
  accent?: boolean;
}) {
  const accentInk = String(useCSSVariable('--color-accent-ink'));
  return accent ? (
    <Text className="text-[15px] font-extrabold" style={{ color: accentInk }}>
      {children}
    </Text>
  ) : (
    <Text
      className="text-center text-[10px] font-bold uppercase text-text-secondary"
      style={{ letterSpacing: 0.6 }}
    >
      {children}
    </Text>
  );
}
