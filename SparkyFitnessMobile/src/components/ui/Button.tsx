import React from 'react';
import { Pressable, Text, type PressableProps, type ViewStyle } from 'react-native';
import { preview } from 'radon-ide';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'header' | 'link';
type ButtonTone = 'accent' | 'neutral';

interface ButtonProps extends Omit<PressableProps, 'children'> {
  variant?: ButtonVariant;
  /**
   * Only affects the accent-text variants (`header`/`ghost`). `neutral` swaps
   * the accent text for the primary text color so a header-like button can act
   * as a secondary/navigation action. Note: this recolors the button's own text
   * child only — an `Icon` child takes its own `color` prop, so pass that
   * explicitly when the child is an icon.
   */
  tone?: ButtonTone;
  children: React.ReactNode;
  className?: string;
  textClassName?: string;
}

// Neutral-tone text overrides, per variant. Only the accent-text variants have
// an entry; other variants ignore `tone`.
const neutralToneText: Partial<Record<ButtonVariant, string>> = {
  header: 'text-text-primary font-semibold',
  ghost: 'text-text-primary font-semibold',
};

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
  header: {
    container: 'bg-transparent',
    text: 'text-accent-primary font-semibold',
    pressed: 'opacity-70',
  },
  link: {
    container: 'bg-transparent',
    text: 'text-text-link font-semibold',
    pressed: 'opacity-70',
  }
};

const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  tone = 'accent',
  children,
  className = '',
  textClassName = '',
  disabled,
  ...rest
}) => {
  const styles = variantClasses[variant];
  const textClass =
    tone === 'neutral' && neutralToneText[variant] ? neutralToneText[variant]! : styles.text;

  const basePadding = variant === 'header' ? '' : 'py-3.5 px-4';

  return (
    <Pressable
      className={`${basePadding} items-center justify-center ${styles.container} ${disabled ? 'opacity-50' : ''} ${className}`}
      disabled={disabled}
      {...(variant === 'header' && !rest.hitSlop ? { hitSlop: { top: 10, bottom: 10, left: 10, right: 10 } } : {})}
      {...rest}
      style={({ pressed }) => [
        pressed && !disabled ? { opacity: 0.8 } : {},
        typeof rest.style === 'function' ? rest.style({ pressed }) : (rest.style as ViewStyle),
      ]}
    >
      {typeof children === 'string' ? (
        <Text className={`text-base ${textClass} ${textClassName}`}>{children}</Text>
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

preview(<Button variant="link">Link Button</Button>);

export default Button;
