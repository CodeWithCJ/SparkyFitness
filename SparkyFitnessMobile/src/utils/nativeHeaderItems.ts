import type {
  NativeStackHeaderItem,
  NativeStackHeaderItemMenu,
  NativeStackNavigationOptions,
} from '@react-navigation/native-stack';

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

/**
 * The screens bridge only exposes UIBarButtonItemBadge's string variant (no
 * .indicator), so a bullet with foreground matched to the background renders
 * as a plain accent dot; the badge capsule sizes with the font, so a small
 * fontSize keeps the dot compact.
 */
export function createNativeHeaderAccentBadge(
  accentColor: string,
  value = '•',
): NativeStackHeaderItemMenu['badge'] {
  return {
    value,
    style: {
      backgroundColor: accentColor,
      color: accentColor,
      fontSize: 9,
    },
  };
}

export function createNativeHeaderMenuButtonItem({
  sfSymbol,
  menuItems,
  tintColor,
  identifier,
  accessibilityLabel,
  badge,
}: {
  sfSymbol: string;
  menuItems: NativeStackHeaderItemMenu['menu']['items'];
  tintColor: string;
  identifier: string;
  accessibilityLabel: string;
  /** iOS 26+ system badge (UIBarButtonItemBadge); ignored on earlier versions. */
  badge?: NativeStackHeaderItemMenu['badge'];
}): NativeStackHeaderItem {
  return {
    type: 'menu',
    label: '',
    icon: { type: 'sfSymbol', name: sfSymbol as never },
    tintColor,
    accessibilityLabel,
    identifier,
    sharesBackground: true,
    // Keep the raw badge field for the native runtime, while mirroring it
    // as `badge` in the test/runtime descriptor expected by our header
    // contract helpers.
    badge,
    menu: { items: menuItems },
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
