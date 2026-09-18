import React from 'react';
import { Switch as RNSwitch, type SwitchProps } from 'react-native';
import { useCSSVariable } from 'uniwind';

const THUMB_COLOR = '#FFFFFF';
const DISABLED_OPACITY = 0.4;

const Switch: React.FC<SwitchProps> = ({
  trackColor,
  thumbColor,
  disabled,
  style,
  ...rest
}) => {
  const [formEnabled, formDisabled] = useCSSVariable([
    '--color-form-enabled',
    '--color-form-disabled',
  ]) as [string, string];

  return (
    <RNSwitch
      disabled={disabled}
      trackColor={trackColor ?? { false: formDisabled, true: formEnabled }}
      thumbColor={thumbColor ?? THUMB_COLOR}
      // Explicit track and thumb colors override the greyed-out look the
      // platform switch applies on its own, so a disabled switch reads as
      // enabled. Dim the whole control instead of restoring native colors.
      style={[disabled ? { opacity: DISABLED_OPACITY } : null, style]}
      {...rest}
    />
  );
};

export default Switch;
