import React, { forwardRef } from 'react';
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
  ({ style, placeholderTextColor, ...props }, ref) => {
    const [textMuted, raisedBg, borderSubtle] = useCSSVariable([
      '--color-text-muted',
      '--color-raised',
      '--color-border-subtle',
    ]) as [string, string, string];

    return (
      <TextInput
        ref={ref}
        className="text-base text-text-primary rounded-lg"
        placeholderTextColor={placeholderTextColor ?? textMuted}
        style={[
          {
            backgroundColor: raisedBg,
            borderWidth: 1,
            borderColor: borderSubtle,
            paddingTop: 10,
            paddingBottom: 10,
            paddingLeft: 12,
            paddingRight: 12,
            fontSize: 16,
            letterSpacing: 0,
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
