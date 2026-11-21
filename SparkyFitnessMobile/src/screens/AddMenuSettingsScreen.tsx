import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';

import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import AddMenuPreview from '../components/AddMenuPreview';
import FeaturesOffNotice from '../components/FeaturesOffNotice';
import Icon from '../components/Icon';
import AddMenuIconTile, {
  useAddMenuTintColors,
} from '../components/AddMenuIconTile';
import BottomSheetPicker from '../components/BottomSheetPicker';
import { ReorderSwitchList } from '../components/ReorderSwitchList';
import Button from '../components/ui/Button';
import {
  ADD_MENU_CARD_LABELS,
  ADD_MENU_ITEM_ICONS,
  ADD_MENU_ITEM_KEYS,
  ADD_MENU_ITEM_TINTS,
  DEFAULT_ADD_MENU_CARDS,
  type AddMenuItemKey,
  type AddMenuRowStyle,
} from '../constants/addMenuItems';
import { useServerConnection } from '../hooks';
import { useAddMenuItemAvailable } from '../hooks/useAddMenuItemAvailable';
import { useAddMenuItemLabel } from '../hooks/useAddMenuItemLabel';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import type { RootStackScreenProps } from '../types/navigation';
import {
  chunkIntoLines,
  groupRowsByStyle,
  mergeGroupOrder,
  placeInCardSlot,
  resolveAddMenuCards,
  rowKeys,
} from '../utils/addMenu';
import { resolveKeyOrder } from '../utils/reorderUtils';

type AddMenuSettingsScreenProps = RootStackScreenProps<'AddMenuSettings'>;

/**
 * Lays out the + sheet: the four big cards (tap one to pick what goes there)
 * and the rows under them (drag to reorder, switch off to hide). An item
 * appears in one place only. An item of a feature turned off in Settings →
 * Features, such as Wellness while cycle is off, is left out here as in the
 * sheet (a tile holding one shows empty), with one line that says so; its
 * place, tile and switch are kept for when the feature comes back.
 */
const AddMenuSettingsScreen: React.FC<AddMenuSettingsScreenProps> = ({
  navigation,
}) => {
  const { t } = useTranslation();
  const { isConnected } = useServerConnection();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();
  const raisedBg = String(useCSSVariable('--color-raised'));
  const tintColors = useAddMenuTintColors();
  const labelFor = useAddMenuItemLabel();
  const isAvailable = useAddMenuItemAvailable();
  const accentColor = tintColors.accent;

  const savedCards = useAppPreferencesStore((s) => s.addMenuCards);
  const addMenuOrder = useAppPreferencesStore((s) => s.addMenuOrder);
  const hiddenAddMenuItems = useAppPreferencesStore(
    (s) => s.hiddenAddMenuItems
  );
  const setAddMenuCards = useAppPreferencesStore((s) => s.setAddMenuCards);
  const setAddMenuOrder = useAppPreferencesStore((s) => s.setAddMenuOrder);
  const setAddMenuItemHidden = useAppPreferencesStore(
    (s) => s.setAddMenuItemHidden
  );
  const addMenuRowStyles = useAppPreferencesStore((s) => s.addMenuRowStyles);
  const setAddMenuRowStyle = useAppPreferencesStore(
    (s) => s.setAddMenuRowStyle
  );
  const resetAddMenu = useAppPreferencesStore((s) => s.resetAddMenu);

  const cards = useMemo(() => resolveAddMenuCards(savedCards), [savedCards]);
  // The rows grouped as the sheet draws them: a list, pairs side by side and
  // buttons at the foot. Each group is arranged on its own, so the order
  // shown here is the order the sheet shows.
  const previewGroups = useMemo(
    () =>
      groupRowsByStyle(
        rowKeys(addMenuOrder, cards).filter(
          (key) => !hiddenAddMenuItems.includes(key)
        ),
        addMenuRowStyles
      ),
    [addMenuOrder, addMenuRowStyles, cards, hiddenAddMenuItems]
  );
  const styleOptions = useMemo(
    () => [
      {
        value: 'list' as const,
        label: t('addMenuSettings.styleList', { defaultValue: 'List' }),
      },
      {
        value: 'compact' as const,
        label: t('addMenuSettings.stylePair', { defaultValue: 'Pair' }),
      },
      {
        value: 'action' as const,
        label: t('addMenuSettings.styleButton', { defaultValue: 'Button' }),
      },
    ],
    [t]
  );
  const rowGroups = useMemo(() => {
    const groups = groupRowsByStyle(
      rowKeys(addMenuOrder, cards).filter(isAvailable),
      addMenuRowStyles
    );
    // Which line a pair or button lands on, counting only the ones shown.
    const lineOf = new Map<AddMenuItemKey, number>();
    for (const style of ['compact', 'action'] as const) {
      chunkIntoLines(
        groups[style].filter((key) => !hiddenAddMenuItems.includes(key))
      ).forEach((keys, index) =>
        keys.forEach((key) => lineOf.set(key, index + 1))
      );
    }
    const toItem = (key: AddMenuItemKey, style: AddMenuRowStyle) => ({
      key,
      label: labelFor(key),
      leading: (
        <AddMenuIconTile
          icon={ADD_MENU_ITEM_ICONS[key]}
          color={tintColors[ADD_MENU_ITEM_TINTS[key]]}
          size="row"
        />
      ),
      detail: (
        <BottomSheetPicker<AddMenuRowStyle>
          value={style}
          options={styleOptions}
          onSelect={(picked) => setAddMenuRowStyle(key, picked)}
          title={t('addMenuSettings.showAs', { defaultValue: 'Show as' })}
          renderTrigger={({ onPress, selectedOption }) => (
            <View className="flex-row items-center">
              <Pressable
                testID={`add-menu-style-${key}`}
                onPress={onPress}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('addMenuSettings.showAsValue', {
                  defaultValue: 'Show as {{style}}',
                  style: selectedOption?.label,
                })}
                className="flex-row items-center mt-0.5 self-start"
              >
                <Text className="text-xs" style={{ color: accentColor }}>
                  {t('addMenuSettings.showAsValue', {
                    defaultValue: 'Show as {{style}}',
                    style: selectedOption?.label,
                  })}
                </Text>
                <Icon name="chevron-expand" size={12} color={accentColor} />
              </Pressable>
              {lineOf.has(key) ? (
                <Text className="text-xs text-text-muted ml-2">
                  {t('addMenuSettings.lineNumber', {
                    defaultValue: 'Line {{number}}',
                    number: lineOf.get(key),
                  })}
                </Text>
              ) : null}
            </View>
          )}
        />
      ),
    });
    return {
      list: groups.list.map((key) => toItem(key, 'list')),
      compact: groups.compact.map((key) => toItem(key, 'compact')),
      action: groups.action.map((key) => toItem(key, 'action')),
    };
  }, [
    accentColor,
    hiddenAddMenuItems,
    isAvailable,
    addMenuOrder,
    addMenuRowStyles,
    cards,
    labelFor,
    setAddMenuRowStyle,
    styleOptions,
    t,
    tintColors,
  ]);
  // Only what the sheet can show: placing an item of a feature turned off
  // would leave its tile empty.
  const pickerOptions = useMemo(
    () =>
      ADD_MENU_ITEM_KEYS.filter(isAvailable).map((key) => ({
        value: key,
        label: labelFor(key),
      })),
    [isAvailable, labelFor]
  );
  const someFeaturesOff = ADD_MENU_ITEM_KEYS.some((key) => !isAvailable(key));
  const isDefault =
    hiddenAddMenuItems.length === 0 &&
    Object.keys(addMenuRowStyles).length === 0 &&
    cards.every((key, index) => key === DEFAULT_ADD_MENU_CARDS[index]) &&
    resolveKeyOrder(addMenuOrder, ADD_MENU_ITEM_KEYS).every(
      (key, index) => key === ADD_MENU_ITEM_KEYS[index]
    );

  const header = useScreenHeader({
    title: t('screens.addMenuSettings', { defaultValue: 'Quick Actions' }),
    left: { kind: 'back' },
  });

  const renderSlot = (slotIndex: number) => {
    const key = cards[slotIndex]!;
    // A tile holding an item of a feature turned off is empty in the sheet,
    // so it is shown empty here too, and keeps the item for when it is back.
    const shown = isAvailable(key);
    const name = shown
      ? labelFor(key)
      : t('addMenuSettings.emptySlot', { defaultValue: 'Empty' });
    return (
      <BottomSheetPicker<AddMenuItemKey>
        key={slotIndex}
        value={key}
        options={pickerOptions}
        onSelect={(picked) =>
          setAddMenuCards(placeInCardSlot(cards, slotIndex, picked))
        }
        title={t('addMenuSettings.chooseCard', {
          defaultValue: 'Choose a tile',
        })}
        renderTrigger={({ onPress }) => (
          <Pressable
            testID={`add-menu-slot-${slotIndex}`}
            accessibilityRole="button"
            accessibilityLabel={t('addMenuSettings.slotLabel', {
              defaultValue: 'Tile {{number}}: {{name}}',
              number: slotIndex + 1,
              name,
            })}
            accessibilityHint={t('addMenuSettings.slotHint', {
              defaultValue: 'Opens a list to choose what goes here',
            })}
            onPress={onPress}
            className="flex-1 items-center px-0.5"
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            {shown ? (
              <AddMenuIconTile
                icon={ADD_MENU_ITEM_ICONS[key]}
                color={tintColors[ADD_MENU_ITEM_TINTS[key]]}
                size="card"
              />
            ) : (
              <View
                testID={`add-menu-slot-${slotIndex}-empty`}
                className="border border-dashed border-border-subtle"
                style={{ width: 52, height: 52, borderRadius: 18 }}
              />
            )}
            <Text
              className={`text-sm font-medium mt-2 text-center ${shown ? 'text-text-primary' : 'text-text-muted'}`}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {shown ? (ADD_MENU_CARD_LABELS[key]?.(t) ?? name) : name}
            </Text>
          </Pressable>
        )}
      />
    );
  };

  const sections: {
    style: AddMenuRowStyle;
    title: string;
    description: string;
  }[] = [
    {
      style: 'list',
      title: t('addMenuSettings.rowsTitle', { defaultValue: 'List' }),
      description: t('addMenuSettings.rowsDescription', {
        defaultValue:
          'Rows under the tiles. Drag a row by its handle to move it. Toggle a row off to hide it.',
      }),
    },
    {
      style: 'compact',
      title: t('addMenuSettings.pairsTitle', { defaultValue: 'Pairs' }),
      description: t('addMenuSettings.pairsDescription', {
        defaultValue:
          'Shown two to a line, under the list. One on its own takes the whole line.',
      }),
    },
    {
      style: 'action',
      title: t('addMenuSettings.buttonsTitle', { defaultValue: 'Buttons' }),
      description: t('addMenuSettings.buttonsDescription', {
        defaultValue: 'Shown side by side at the bottom of the sheet.',
      }),
    },
  ];

  return (
    <View className="flex-1 bg-background">
      {header}
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingTop: 16,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        contentInsetAdjustmentBehavior={
          usesNativeHeader ? 'automatic' : 'never'
        }
      >
        <Text className="text-text-primary text-base font-semibold mb-1">
          {t('addMenuSettings.previewTitle', { defaultValue: 'Preview' })}
        </Text>
        <Text className="text-text-secondary text-sm mb-3">
          {t('addMenuSettings.previewDescription', {
            defaultValue: 'How Quick Actions looks with your choices.',
          })}
        </Text>
        <AddMenuPreview cards={cards} groups={previewGroups} />

        <Text className="text-text-primary text-base font-semibold mt-8 mb-1">
          {t('addMenuSettings.cardsTitle', { defaultValue: 'Tiles' })}
        </Text>
        <Text className="text-text-secondary text-sm mb-4">
          {t('addMenuSettings.cardsDescription', {
            defaultValue:
              'The four tiles at the top of Quick Actions. Tap one to choose what goes there. Choosing something already placed swaps the two.',
          })}
        </Text>
        <View
          className="flex-row rounded-2xl px-2 py-4"
          style={{ backgroundColor: raisedBg }}
        >
          {[0, 1, 2, 3].map((slot) => renderSlot(slot))}
        </View>

        {sections.map(({ style, title, description }) => {
          const items = rowGroups[style];
          if (items.length === 0) return null;
          return (
            <View key={style}>
              <Text className="text-text-primary text-base font-semibold mt-8 mb-1">
                {title}
              </Text>
              <Text className="text-text-secondary text-sm mb-4">
                {description}
              </Text>
              <ReorderSwitchList
                items={items}
                testIDPrefix="add-menu"
                isEnabled={(key) => !hiddenAddMenuItems.includes(key)}
                onToggle={(key, enabled) => setAddMenuItemHidden(key, !enabled)}
                onReorder={(reordered) =>
                  setAddMenuOrder(
                    mergeGroupOrder(addMenuOrder, cards, reordered)
                  )
                }
                reorderA11yLabel={(name) =>
                  t('addMenuSettings.reorder', {
                    defaultValue: 'Reorder {{name}}',
                    name,
                  })
                }
                reorderA11yHint={t('addMenuSettings.reorderHint', {
                  defaultValue: 'Changes where this row sits in Quick Actions',
                })}
              />
            </View>
          );
        })}
        {someFeaturesOff && (
          <FeaturesOffNotice
            className="mt-4"
            onManage={
              isConnected
                ? () => navigation.navigate('FeatureSettings')
                : undefined
            }
          />
        )}
        <View className="mt-6">
          <Button
            variant="secondary"
            onPress={resetAddMenu}
            disabled={isDefault}
            testID="add-menu-reset"
          >
            <Text className="text-text-primary text-base font-medium">
              {t('addMenuSettings.reset', {
                defaultValue: 'Reset to default',
              })}
            </Text>
          </Button>
        </View>
      </ScrollView>
    </View>
  );
};

export default AddMenuSettingsScreen;
