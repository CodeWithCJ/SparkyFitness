import type { NativeStackHeaderItem, NativeStackNavigationOptions } from '@react-navigation/native-stack';

export function createIOSNativeHeaderOptions(tintColor: string): NativeStackNavigationOptions {
  return {
    headerShown: true,
    headerLargeTitleEnabled: true,
    headerLargeTitleShadowVisible: false,
    headerTintColor: tintColor,
    headerTitleStyle: {
      color: tintColor,
      fontWeight: '600',
    },
    headerLargeTitleStyle: {
      color: tintColor,
      fontWeight: '700',
    },
    animation: 'default',
  };
}

export function createIOSSmallNativeHeaderOptions(tintColor: string): NativeStackNavigationOptions {
  return {
    ...createIOSNativeHeaderOptions(tintColor),
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
