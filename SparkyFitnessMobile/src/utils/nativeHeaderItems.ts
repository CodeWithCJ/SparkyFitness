import type { NativeStackHeaderItem, NativeStackNavigationOptions } from '@react-navigation/native-stack';

export function createIOSNativeHeaderOptions(
  actionTintColor: string,
  titleColor: string = actionTintColor,
): NativeStackNavigationOptions {
  return {
    headerShown: true,
    headerLargeTitleEnabled: true,
    headerLargeTitleShadowVisible: false,
    headerTintColor: actionTintColor,
    headerTitleStyle: {
      color: titleColor,
      fontWeight: '600',
    },
    headerLargeTitleStyle: {
      color: titleColor,
      fontWeight: '700',
    },
    animation: 'default',
  };
}

export function createIOSSmallNativeHeaderOptions(
  actionTintColor: string,
  titleColor: string = actionTintColor,
): NativeStackNavigationOptions {
  return {
    ...createIOSNativeHeaderOptions(actionTintColor, titleColor),
    headerLargeTitleEnabled: false,
  };
}

export function createNativeHeaderTextButtonItem({
  label,
  onPress,
  tintColor,
  identifier,
  disabled = false,
  fontWeight = '500',
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  tintColor: string;
  identifier: string;
  disabled?: boolean;
  fontWeight?: '400' | '500' | '600' | '700';
  accessibilityLabel?: string;
}): NativeStackHeaderItem {
  return {
    type: 'button',
    label,
    onPress,
    tintColor,
    labelStyle: { fontSize: 17, fontWeight, color: tintColor },
    accessibilityLabel: accessibilityLabel ?? label,
    identifier,
    sharesBackground: true,
    disabled,
  };
}

export function createNativeHeaderIconButtonItem({
  sfSymbol,
  onPress,
  tintColor,
  identifier,
  accessibilityLabel,
  disabled = false,
}: {
  sfSymbol: string;
  onPress: () => void;
  tintColor: string;
  identifier: string;
  accessibilityLabel: string;
  disabled?: boolean;
}): NativeStackHeaderItem {
  return {
    type: 'button',
    label: '',
    icon: { type: 'sfSymbol', name: sfSymbol as never },
    onPress,
    tintColor,
    accessibilityLabel,
    identifier,
    sharesBackground: true,
    disabled,
  };
}
