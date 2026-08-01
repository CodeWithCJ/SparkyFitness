import React, { useLayoutEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SymbolView } from 'expo-symbols';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { ParamListBase } from '@react-navigation/native';
import type {
  NativeStackHeaderItem,
  NativeStackNavigationOptions,
  NativeStackNavigationProp,
} from '@react-navigation/native-stack';
import Icon from '../components/Icon';
import FadeView from '../components/FadeView';
import { useHeaderActionColors } from './useHeaderActionColors';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import {
  createNativeHeaderIconButtonItem,
  createNativeHeaderTextButtonItem,
} from '../utils/nativeHeaderItems';

/**
 * `useScreenHeader` provides a single declarative API for screen-level headers
 * that works on both the native iOS 26 / classic header path and the custom
 * bar path (Android + iOS fallback).
 */

export type HeaderRole = 'primary' | 'secondary';

/**
 * `native-only` items are mirrored into the native header but omitted from the
 * custom bar — used by footer-save forms whose sticky-footer Button is the
 * custom-path primary, so the header does not show a second Save control.
 */
export type HeaderPlacement = 'both' | 'native-only';

export type HeaderItem =
  | { kind: 'back'; onPress?: () => void; disabled?: boolean; identifier?: string }
  | {
      kind: 'dismiss';
      onPress: () => void;
      disabled?: boolean;
      accessibilityLabel?: string;
      identifier?: string;
    }
  | {
      kind: 'text';
      label: string;
      onPress: () => void;
      role?: HeaderRole;
      placement?: HeaderPlacement;
      disabled?: boolean;
      busy?: boolean;
      busyLabel?: string;
      accessibilityLabel?: string;
      identifier?: string;
    }
  | {
      kind: 'icon';
      sfSymbol: string;
      ionicon: string;
      onPress: () => void;
      role?: HeaderRole;
      placement?: HeaderPlacement;
      disabled?: boolean;
      busy?: boolean;
      useIoniconOnIOS?: boolean;
      accessibilityLabel: string;
      identifier?: string;
    }
  | {
      // Sugar for `text` + role:'primary' + weight 600.
      kind: 'primary';
      label?: string;
      onPress: () => void;
      placement?: HeaderPlacement;
      disabled?: boolean;
      busy?: boolean;
      busyLabel?: string;
      accessibilityLabel?: string;
      identifier?: string;
    };

export interface ScreenHeaderConfig {
  /** Centered title for the custom bar. */
  title?: string;
  /** Also drive `setOptions({ title })` — used for view/edit mode swaps. */
  nativeTitle?: string;
  left?: HeaderItem | null;
  right?: HeaderItem | HeaderItem[] | null;
  /** Escape hatch for a custom-bar middle (simple, ref-less content). */
  center?: React.ReactNode;
  /** Drop the custom bar's bottom hairline (large-title detail screens). */
  borderless?: boolean;
  /** gestureEnabled / headerBackVisible etc. for edit-mode swaps. */
  nativeOptions?: Partial<NativeStackNavigationOptions>;
  /** Cross-fade the custom bar when this key changes (view/edit swaps). */
  animateKey?: string;
}

interface HeaderColors {
  defaultColor: string;
  saveColor: string;
}

function isPrimaryItem(item: HeaderItem): boolean {
  return item.kind === 'primary' || ('role' in item && item.role === 'primary');
}

function itemColor(item: HeaderItem, colors: HeaderColors): string {
  return isPrimaryItem(item) ? colors.saveColor : colors.defaultColor;
}

function itemIsBusy(item: HeaderItem): boolean {
  return 'busy' in item && !!item.busy;
}

function itemPlacement(item: HeaderItem): HeaderPlacement {
  return 'placement' in item ? item.placement ?? 'both' : 'both';
}

function resolvePress(item: HeaderItem, goBack: () => void): () => void {
  if (item.kind === 'back') return item.onPress ?? goBack;
  return item.onPress;
}

function itemIsDisabled(item: HeaderItem): boolean {
  return ('disabled' in item && !!item.disabled) || itemIsBusy(item);
}

function resolveItemLabel(item: HeaderItem, t: ReturnType<typeof useTranslation>['t']): string | undefined {
  if ('label' in item) {
    return item.label;
  }
  if (item.kind === 'back') return undefined;
  if (item.kind === 'dismiss') return undefined;
  return t('common.save');
}

function resolveItemBusyLabel(item: HeaderItem, t: ReturnType<typeof useTranslation>['t']): string | undefined {
  if ('busyLabel' in item) {
    return item.busyLabel;
  }
  if (isPrimaryItem(item)) {
    return t('common.saving');
  }
  return undefined;
}

function resolveItemAccessibilityLabel(item: HeaderItem, t: ReturnType<typeof useTranslation>['t']): string {
  switch (item.kind) {
    case 'back':
      return t('common.back');
    case 'dismiss':
      return item.accessibilityLabel ?? t('common.close');
    case 'icon':
      return item.accessibilityLabel;
    case 'text':
    case 'primary':
      return item.accessibilityLabel ?? (isPrimaryItem(item) ? (item.label ?? t('common.save')) : item.label) ?? t('common.save');
  }
}

/** Raw platform icon for the generic `icon` kind on the custom bar. */
function RawHeaderIcon({
  sf,
  ion,
  color,
  size = 24,
  useIoniconOnIOS = false,
}: {
  sf: string;
  ion: string;
  color: string;
  size?: number;
  useIoniconOnIOS?: boolean;
}) {
  if (Platform.OS === 'ios' && !useIoniconOnIOS) {
    return <SymbolView name={sf as never} tintColor={color} size={size} />;
  }
  return <Ionicons name={ion as keyof typeof Ionicons.glyphMap} color={color} size={size} />;
}

/**
 * Custom-bar button. Owned by this abstraction (not `Button`) so its color is
 * driven by `useHeaderActionColors()` in lockstep with the native tint, and the
 * one-accent rule is enforced in a single place.
 */
function HeaderBarButton({
  item,
  color,
  onPress,
}: {
  item: HeaderItem;
  color: string;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const disabled = itemIsDisabled(item);
  const busy = itemIsBusy(item);

  const label = resolveItemLabel(item, t);
  const content = busy ? (
    <ActivityIndicator size="small" color={color} />
  ) : item.kind === 'back' ? (
    <Icon name="chevron-back" size={22} color={color} />
  ) : item.kind === 'dismiss' ? (
    <Icon name="close" size={22} color={color} />
  ) : item.kind === 'icon' ? (
    <RawHeaderIcon
      sf={item.sfSymbol}
      ion={item.ionicon}
      color={color}
      useIoniconOnIOS={item.useIoniconOnIOS}
    />
  ) : (
    <Text style={{ color, fontSize: 17, fontWeight: isPrimaryItem(item) ? '600' : '500' }}>
      {label}
    </Text>
  );

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      accessibilityRole="button"
      accessibilityLabel={resolveItemAccessibilityLabel(item, t)}
      style={disabled ? { opacity: 0.4 } : undefined}
    >
      {content}
    </Pressable>
  );
}

function toRightArray(right: ScreenHeaderConfig['right']): HeaderItem[] {
  if (!right) return [];
  return Array.isArray(right) ? right : [right];
}

function resolveIdentifier(item: HeaderItem, fallback: string): string {
  return item.identifier ?? fallback;
}

function buildNativeItem(
  item: HeaderItem,
  identifier: string,
  colors: HeaderColors,
  press: () => void,
  t: ReturnType<typeof useTranslation>['t'],
): NativeStackHeaderItem | null {
  const color = itemColor(item, colors);
  const accessibilityLabel = resolveItemAccessibilityLabel(item, t);
  switch (item.kind) {
    case 'back':
      // System back button owns the native left slot.
      return null;
    case 'dismiss':
      return createNativeHeaderIconButtonItem({
        sfSymbol: 'xmark',
        identifier,
        tintColor: colors.defaultColor,
        accessibilityLabel: accessibilityLabel,
        onPress: press,
        disabled: !!item.disabled,
      });
    case 'icon':
      return createNativeHeaderIconButtonItem({
        sfSymbol: item.sfSymbol,
        identifier,
        tintColor: color,
        accessibilityLabel: accessibilityLabel,
        onPress: press,
        disabled: itemIsDisabled(item),
      });
    case 'text':
    case 'primary': {
      const resolvedLabel = resolveItemLabel(item, t);
      const resolvedBusyLabel = resolveItemBusyLabel(item, t);
      const label = itemIsBusy(item) && resolvedBusyLabel ? resolvedBusyLabel : (resolvedLabel ?? t('common.save'));
      return createNativeHeaderTextButtonItem({
        label,
        identifier,
        tintColor: color,
        onPress: press,
        disabled: itemIsDisabled(item),
        fontWeight: isPrimaryItem(item) ? '600' : '500',
        accessibilityLabel,
      });
    }
  }
}

/**
 * Single declarative header per screen, rendered correctly on both paths:
 * - Native path (iOS 26 glass on, or iOS < 26 classic headers): mirrors the
 *   descriptor into `unstable_header{Left,Right}Items` via a layout effect and
 *   returns `null` (the native stack header owns the chrome).
 * - Custom path (Android always, iOS 26 glass off): returns the custom bar
 *   element for the screen to render at the top of its view.
 *
 * The one-accent rule (exactly one primary/save action tinted accent, all
 * navigation/secondary actions neutral) is enforced here for both paths.
 */
export function useScreenHeader(config: ScreenHeaderConfig): React.ReactNode {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const { defaultColor, saveColor } = useHeaderActionColors();
  const colors: HeaderColors = { defaultColor, saveColor };

  const { title, nativeTitle, left, right, center, borderless, nativeOptions, animateKey } = config;
  const rightItems = toRightArray(right);

  // One-accent invariant: count both `kind:'primary'` and `role:'primary'`.
  if (__DEV__) {
    const primaryCount = [left, ...rightItems].filter(
      (item): item is HeaderItem => !!item && isPrimaryItem(item),
    ).length;
    if (primaryCount > 1) {
      throw new Error(
        `useScreenHeader: ${primaryCount} primary header actions declared; exactly one accent action is allowed per screen.`,
      );
    }
  }

  // Stable id → latest onPress map, refreshed every render so native header
  // buttons (rebuilt only when their visible state changes) always invoke the
  // current closure — replaces the per-screen handler-ref dance.
  const handlersRef = useRef<Record<string, () => void>>({});
  const nextHandlers: Record<string, () => void> = {};

  const goBack = () => navigation.goBack();
  const leftId = left ? resolveIdentifier(left, 'header-left') : 'header-left';
  if (left) {
    nextHandlers[leftId] = resolvePress(left, goBack);
  }
  const rightMeta = rightItems.map((item, index) => {
    const id = resolveIdentifier(item, `header-right-${index}`);
    nextHandlers[id] = resolvePress(item, goBack);
    return { item, id };
  });
  handlersRef.current = nextHandlers;

// Native path: mirror the descriptor into stack options. Re-runs only when the
  // visible signature changes; onPress is dispatched through `handlersRef`.
  const leftSignature = left
    ? {
        id: leftId,
        kind: left.kind,
        label: resolveItemLabel(left, t),
        busyLabel: resolveItemBusyLabel(left, t),
        accessibilityLabel: resolveItemAccessibilityLabel(left, t),
        sfSymbol: left.kind === 'icon' ? left.sfSymbol : undefined,
        role: 'role' in left ? left.role : undefined,
        disabled: itemIsDisabled(left),
        busy: itemIsBusy(left),
      }
    : null;
  const signature = JSON.stringify({
    usesNativeHeader,
    defaultColor,
    saveColor,
    nativeTitle: nativeTitle ?? null,
    left: leftSignature,
    right: rightMeta.map(({ item, id }) => ({
      id,
      kind: item.kind,
      label: resolveItemLabel(item, t),
      busyLabel: resolveItemBusyLabel(item, t),
      accessibilityLabel: resolveItemAccessibilityLabel(item, t),
      sfSymbol: item.kind === 'icon' ? item.sfSymbol : undefined,
      role: 'role' in item ? item.role : undefined,
      disabled: itemIsDisabled(item),
      busy: itemIsBusy(item),
    })),
    nativeOptions: nativeOptions ?? null,
  });

  useLayoutEffect(() => {
    if (Platform.OS !== 'ios') return;

    const options: Partial<NativeStackNavigationOptions> = {
      headerTintColor: defaultColor,
      ...nativeOptions,
    };

    if (usesNativeHeader) {
      if (nativeTitle !== undefined) options.title = nativeTitle;

      if (!left || left.kind === 'back') {
        options.unstable_headerLeftItems = undefined;
      } else {
         const leftNative = buildNativeItem(left, leftId, colors, () =>
          handlersRef.current[leftId]?.(),
          t,
        );
        options.unstable_headerLeftItems = leftNative ? () => [leftNative] : undefined;
        // A dismiss/text left item replaces the system back button.
        if (left.kind === 'dismiss' && options.headerBackVisible === undefined) {
          options.headerBackVisible = false;
        }
      }

      const rightNative = rightMeta
        .map(({ item, id }) => buildNativeItem(item, id, colors, () => handlersRef.current[id]?.(), t))
        .filter((entry): entry is NativeStackHeaderItem => entry !== null);
      options.unstable_headerRightItems = rightNative.length ? () => rightNative : undefined;
    }

    navigation.setOptions(options);
    // `signature` captures every value that affects the native header output;
    // handlers dispatch through a ref so stale closures are impossible.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, signature]);

  if (usesNativeHeader) return null;

  const leftCustom =
    left && itemPlacement(left) !== 'native-only' ? (
      <HeaderBarButton
        item={left}
        color={itemColor(left, colors)}
        onPress={() => handlersRef.current[leftId]?.()}
      />
    ) : null;

  const rightCustom = rightMeta
    .filter(({ item }) => itemPlacement(item) !== 'native-only')
    .map(({ item, id }) => (
      <HeaderBarButton
        key={id}
        item={item}
        color={itemColor(item, colors)}
        onPress={() => handlersRef.current[id]?.()}
      />
    ));

  const bar = (
    <View
      className={`flex-row items-center px-4 py-3 ${borderless ? '' : 'border-b border-border-subtle'}`}
    >
      {/* Equal-width side cells keep the title cell geometrically centered in
          the bar even when the left/right actions have different widths; the
          title stays content-sized (shrinking to truncate) so it can use more
          than a third of the width when the sides are light. */}
      <View className="flex-1 flex-row items-center gap-4">{leftCustom}</View>
      <View className="shrink px-2">
        {center ?? (
          <Text
            numberOfLines={1}
            className="text-center text-text-primary text-lg font-semibold"
          >
            {title ?? ''}
          </Text>
        )}
      </View>
      <View className="flex-1 flex-row items-center justify-end gap-4">{rightCustom}</View>
    </View>
  );

  if (animateKey !== undefined) {
    return <FadeView key={animateKey}>{bar}</FadeView>;
  }
  return bar;
}
