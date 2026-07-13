import { forwardRef, useEffect, useRef, useState } from 'react';
import { TextInput, type TextInputProps } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { scheduleAndroidImeShowRetry } from '../utils/keyboardFocus';

type FormInputProps = Omit<TextInputProps, 'placeholderTextColor'> & {
  placeholderTextColor?: string;
};

/**
 * Themed TextInput with explicit padding to fix iOS text alignment.
 * Drop-in replacement for TextInput — accepts all TextInput props.
 */
const FormInput = forwardRef<TextInput, FormInputProps>(
  ({ className = '', style, placeholderTextColor, onFocus, onBlur, ...props }, ref) => {
    const [textMuted, raisedBg, borderSubtle, accentPrimary] = useCSSVariable([
      '--color-text-muted',
      '--color-raised',
      '--color-border-subtle',
      '--color-accent-primary',
    ]) as [string, string, string, string];
    const [isFocused, setIsFocused] = useState(false);

    const innerRef = useRef<TextInput>(null);
    const { autoFocus } = props;

    // autoFocus takes focus natively as the view attaches, which on Android
    // can leave the keyboard behind (see scheduleAndroidImeShowRetry) — back
    // it up the same way the tap-to-edit activation effects do.
    useEffect(() => {
      if (!autoFocus) return;
      return scheduleAndroidImeShowRetry(innerRef);
    }, [autoFocus]);

    return (
      <TextInput
        ref={(node) => {
          innerRef.current = node;
          if (typeof ref === 'function') {
            ref(node);
          } else if (ref) {
            ref.current = node;
          }
        }}
        className={`text-base text-text-primary rounded-lg ${className}`}
        placeholderTextColor={placeholderTextColor ?? textMuted}
        onFocus={(e) => {
          setIsFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setIsFocused(false);
          onBlur?.(e);
        }}
        style={[
          {
            backgroundColor: raisedBg,
            borderWidth: 1,
            borderColor: isFocused ? accentPrimary : borderSubtle,
            paddingTop: 10,
            paddingBottom: 10,
            paddingLeft: 12,
            paddingRight: 12,
            fontSize: 16,
            lineHeight: 20,
          },
          style,
        ]}
        {...props}
      />
    );
  },
);

FormInput.displayName = 'FormInput';

export default FormInput;
