import React, { forwardRef, useState } from 'react';
import { TextInput, type TextInputProps } from 'react-native';
import { useCSSVariable } from 'uniwind';

type FormInputProps = Omit<TextInputProps, 'placeholderTextColor'> & {
  placeholderTextColor?: string;
};

/**
 * Themed TextInput with explicit padding to fix iOS text alignment.
 * Drop-in replacement for TextInput — accepts all TextInput props.
 */
const FormInput = forwardRef<TextInput, FormInputProps>(
  ({ style, placeholderTextColor, onFocus, onBlur, ...props }, ref) => {
    const [textMuted, raisedBg, borderSubtle, accentPrimary] = useCSSVariable([
      '--color-text-muted',
      '--color-raised',
      '--color-border-subtle',
      '--color-accent-primary',
    ]) as [string, string, string, string];
    const [isFocused, setIsFocused] = useState(false);

    return (
      <TextInput
        ref={ref}
        className="text-base text-text-primary rounded-lg"
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
        inputAccessoryViewID="none"
        {...props}
      />
    );
  },
);

FormInput.displayName = 'FormInput';

export default FormInput;
