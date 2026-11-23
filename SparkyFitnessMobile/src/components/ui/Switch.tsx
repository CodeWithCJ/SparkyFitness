import React from 'react';
import {
  Platform,
  StyleSheet,
  Switch as RNSwitch,
  type SwitchProps,
} from 'react-native';
import { useCSSVariable } from 'uniwind';

const THUMB_COLOR = '#FFFFFF';

/**
 * React Native's switch in the app's colours. On Android those colours are a
 * flat tint that ignores whether the switch is enabled, so a disabled switch
 * looked exactly like one that works; it is dimmed here, as a disabled
 * `SettingsRow` is. iOS dims a disabled switch itself.
 */
const Switch: React.FC<SwitchProps> = ({
  trackColor,
  thumbColor,
  style,
  ...rest
}) => {
  const [formEnabled, formDisabled] = useCSSVariable([
    '--color-form-enabled',
    '--color-form-disabled',
  ]) as [string, string];
  // The same test React Native uses to disable the switch.
  const disabled =
    (rest.disabled ?? rest.accessibilityState?.disabled) === true;
  const dimmed = disabled && Platform.OS === 'android';

  return (
    <RNSwitch
      trackColor={trackColor ?? { false: formDisabled, true: formEnabled }}
      thumbColor={thumbColor ?? THUMB_COLOR}
      style={dimmed ? [style, styles.disabled] : style}
      {...rest}
    />
  );
};

const styles = StyleSheet.create({
  disabled: { opacity: 0.5 },
});

export default Switch;
