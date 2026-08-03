import React from 'react';
import { Switch as RNSwitch, type SwitchProps } from 'react-native';
import { useCSSVariable } from 'uniwind';

const THUMB_COLOR = '#FFFFFF';

const Switch: React.FC<SwitchProps> = ({ trackColor, thumbColor, ...rest }) => {
  const [formEnabled, formDisabled] = useCSSVariable([
    '--color-form-enabled',
    '--color-form-disabled',
  ]) as [string, string];

  return (
    <RNSwitch
      trackColor={trackColor ?? { false: formDisabled, true: formEnabled }}
      thumbColor={thumbColor ?? THUMB_COLOR}
      {...rest}
    />
  );
};

export default Switch;
