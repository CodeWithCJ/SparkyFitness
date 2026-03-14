import React from 'react';
import { Pressable, Text, type PressableProps, type ViewStyle } from 'react-native';
import { preview } from 'radon-ide';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost';

interface ButtonProps extends Omit<PressableProps, 'children'> {
  variant?: ButtonVariant;
  children: React.ReactNode;
  className?: string;
  textClassName?: string;
}

const variantClasses: Record<ButtonVariant, { container: string; text: string; pressed: string }> = {
  primary: {
    container: 'bg-accent-primary rounded-xl',
    text: 'text-white font-semibold',
    pressed: 'opacity-80',
  },
  secondary: {
    container: 'bg-raised rounded-xl border border-accent-primary border-2',
    text: 'text-text-primary font-semibold',
    pressed: 'opacity-80',
  },
  outline: {
    container: 'bg-transparent rounded-xl border border-accent-primary',
    text: 'text-accent-primary font-semibold',
    pressed: 'opacity-70',
  },
  ghost: {
    container: 'bg-transparent rounded-xl',
    text: 'text-accent-primary font-semibold',
    pressed: 'opacity-70',
  },
};

const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  children,
  className = '',
  textClassName = '',
  disabled,
  ...rest
}) => {
  const styles = variantClasses[variant];

  return (
    <Pressable
      className={`py-3.5 px-4 items-center justify-center ${styles.container} ${disabled ? 'opacity-50' : ''} ${className}`}
      disabled={disabled}
      {...rest}
      style={({ pressed }) => [
        pressed && !disabled ? { opacity: 0.8 } : {},
        typeof rest.style === 'function' ? rest.style({ pressed }) : (rest.style as ViewStyle),
      ]}
    >
      {typeof children === 'string' ? (
        <Text className={`text-base ${styles.text} ${textClassName}`}>{children}</Text>
      ) : (
        children
      )}
    </Pressable>
  );
};

preview(<Button variant="primary">Primary Button</Button>);

preview(<Button variant="secondary">Secondary Button</Button>);

preview(<Button variant="outline">Outline Button</Button>);

preview(<Button variant="ghost">Ghost Button</Button>);

export default Button;
